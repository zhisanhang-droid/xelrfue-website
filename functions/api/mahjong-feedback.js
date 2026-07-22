const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const CSV_HEADERS = {
  "Content-Type": "text/csv; charset=utf-8",
  "Cache-Control": "no-store",
  "Content-Disposition": 'attachment; filename="mahjong-feedback.csv"',
};

const MAX_TEXT_LENGTH = 1200;
const FEISHU_API_BASE = "https://open.feishu.cn/open-apis";
const ALLOWED_FIELDS = [
  "designChoice",
  "opacityPreference",
  "packPreference",
  "idea",
  "email",
  "emailConsent",
  "source",
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

function cleanText(value, maxLength = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hasFeishuSheetConfig(env) {
  return env.FEISHU_APP_ID && env.FEISHU_APP_SECRET && env.FEISHU_FEEDBACK_SPREADSHEET_TOKEN && env.FEISHU_FEEDBACK_SHEET_ID;
}

function hasFeishuBotConfig(env) {
  return Boolean(env.FEISHU_GROUP_BOT_WEBHOOK);
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function readStoredRecords(kv) {
  const records = [];
  let cursor;

  do {
    const page = await kv.list({ prefix: "feedback:", cursor });
    cursor = page.cursor;

    for (const key of page.keys) {
      const value = await kv.get(key.name, "json");
      if (value) records.push(value);
    }
  } while (cursor);

  records.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  return records;
}

async function storeFeedback(env, record) {
  const kv = env.MAHJONG_FEEDBACK;

  if (!kv) {
    return false;
  }

  const key = `feedback:${record.createdAt}:${record.id}`;
  await kv.put(key, JSON.stringify(record));

  if (record.email && record.emailConsent) {
    const emailKey = `email:${record.email.toLowerCase()}`;
    await kv.put(
      emailKey,
      JSON.stringify({
        email: record.email,
        firstSeenAt: record.createdAt,
        source: record.source,
      }),
    );
  }

  return true;
}

async function getFeishuTenantToken(env) {
  const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET,
    }),
  });
  const result = await response.json();

  if (!response.ok || result.code !== 0 || !result.tenant_access_token) {
    throw new Error(`Feishu token failed: ${result.msg || response.status}`);
  }

  return result.tenant_access_token;
}

async function appendFeedbackToFeishuSheet(env, record) {
  if (!hasFeishuSheetConfig(env)) return false;

  const token = await getFeishuTenantToken(env);
  const range = `${env.FEISHU_FEEDBACK_SHEET_ID}!A1:I1`;
  const values = [
    [
      record.createdAt,
      record.designChoice,
      record.opacityPreference,
      record.packPreference,
      record.idea,
      record.email,
      record.source,
      record.id,
      record.userAgent,
    ],
  ];

  const response = await fetch(
    `${FEISHU_API_BASE}/sheets/v2/spreadsheets/${encodeURIComponent(env.FEISHU_FEEDBACK_SPREADSHEET_TOKEN)}/values_append`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        valueRange: {
          range,
          values,
        },
      }),
    },
  );
  const result = await response.json();

  if (!response.ok || result.code !== 0) {
    throw new Error(`Feishu sheet append failed: ${result.msg || response.status}`);
  }

  return true;
}

async function signFeishuBotMessage(secret) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}\n${secret}`));
  const sign = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return { timestamp, sign };
}

async function sendFeishuNotification(env, record) {
  if (!hasFeishuBotConfig(env)) return false;

  const text = [
    "XELRFUE Mahjong Preview received new feedback",
    "",
    `Design choice: ${record.designChoice || "-"}`,
    `Print translucency feedback: ${record.opacityPreference || "-"}`,
    `4-pack preference: ${record.packPreference || "-"}`,
    `Email: ${record.email || "-"}`,
    `Feedback: ${record.idea || "-"}`,
    "",
    env.FEISHU_FEEDBACK_SPREADSHEET_URL ? `Feedback sheet: ${env.FEISHU_FEEDBACK_SPREADSHEET_URL}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const signature = env.FEISHU_GROUP_BOT_SECRET ? await signFeishuBotMessage(env.FEISHU_GROUP_BOT_SECRET) : {};
  const response = await fetch(env.FEISHU_GROUP_BOT_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      ...signature,
      msg_type: "text",
      content: { text },
    }),
  });
  const result = await response.json();

  if (!response.ok || ![0, undefined].includes(result.code ?? result.StatusCode)) {
    throw new Error(`Feishu bot notify failed: ${result.msg || result.message || response.status}`);
  }

  return true;
}

async function syncFeedbackToFeishu(env, record) {
  const tasks = [appendFeedbackToFeishuSheet(env, record), sendFeishuNotification(env, record)];
  const results = await Promise.allSettled(tasks);

  for (const result of results) {
    if (result.status === "rejected") {
      console.error(result.reason?.message || "Feishu sync failed");
    }
  }
}

export async function onRequestPost({ request, env, waitUntil }) {
  let input;

  try {
    input = await request.json();
  } catch {
    return json({ message: "Please submit valid feedback data." }, 400);
  }

  const record = {};
  for (const field of ALLOWED_FIELDS) {
    record[field] = field === "idea" ? cleanText(input[field], MAX_TEXT_LENGTH) : cleanText(input[field]);
  }

  record.emailConsent = Boolean(record.email);

  if (!record.designChoice || !record.opacityPreference || !record.packPreference) {
    return json({ message: "Please answer the required feedback questions." }, 400);
  }

  if (!isValidEmail(record.email)) {
    return json({ message: "Please enter a valid email address." }, 400);
  }

  record.id = crypto.randomUUID();
  record.createdAt = new Date().toISOString();
  record.userAgent = cleanText(request.headers.get("User-Agent") || "", 500);

  try {
    const stored = await storeFeedback(env, record);

    if (!stored) {
      return json({ message: "Feedback storage is not configured yet." }, 503);
    }

    const feishuSync = syncFeedbackToFeishu(env, record);
    if (typeof waitUntil === "function") {
      waitUntil(feishuSync);
    } else {
      await feishuSync;
    }

    return json({ ok: true });
  } catch {
    console.error("Mahjong feedback failed at stage STORAGE");
    return json({ message: "Feedback could not be stored. Please try again later." }, 502);
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.MAHJONG_FEEDBACK) {
    return json({ message: "Feedback storage is not configured yet." }, 503);
  }

  if (!env.MAHJONG_FEEDBACK_EXPORT_TOKEN) {
    return json({ message: "CSV export token is not configured yet." }, 503);
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";

  if (token !== env.MAHJONG_FEEDBACK_EXPORT_TOKEN) {
    return json({ message: "Unauthorized." }, 401);
  }

  try {
    const records = await readStoredRecords(env.MAHJONG_FEEDBACK);
    const headers = [
      "createdAt",
      "designChoice",
      "opacityPreference",
      "packPreference",
      "idea",
      "email",
      "emailConsent",
      "source",
      "userAgent",
    ];

    const csv = [
      headers.map(csvCell).join(","),
      ...records.map((record) => headers.map((header) => csvCell(record[header])).join(",")),
    ].join("\n");

    return new Response(csv, { headers: CSV_HEADERS });
  } catch {
    console.error("Mahjong feedback failed at stage CSV_EXPORT");
    return json({ message: "Feedback export failed." }, 502);
  }
}
