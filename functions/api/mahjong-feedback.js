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
const ALLOWED_FIELDS = [
  "designChoice",
  "opacityPreference",
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

export async function onRequestPost({ request, env }) {
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

  record.emailConsent = input.emailConsent === true || input.emailConsent === "yes";

  if (!record.designChoice || !record.opacityPreference) {
    return json({ message: "Please answer the required feedback questions." }, 400);
  }

  if (!isValidEmail(record.email)) {
    return json({ message: "Please enter a valid email address." }, 400);
  }

  if (record.email && !record.emailConsent) {
    return json({ message: "Please agree to receive launch updates if you leave an email." }, 400);
  }

  record.id = crypto.randomUUID();
  record.createdAt = new Date().toISOString();
  record.userAgent = cleanText(request.headers.get("User-Agent") || "", 500);

  try {
    const stored = await storeFeedback(env, record);

    if (!stored) {
      return json({ message: "Feedback storage is not configured yet." }, 503);
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
      "idea",
      "email",
      "emailConsent",
      "source",
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
