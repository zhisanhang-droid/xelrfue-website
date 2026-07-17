const form = document.querySelector("#feedback-form");
const statusEl = document.querySelector("#form-status");

function formValue(data, key) {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  const submitButton = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const email = formValue(data, "email");
  const emailConsent = data.get("emailConsent") === "yes";

  if (email && !emailConsent) {
    setStatus("Please check the launch update consent box if you leave an email.", true);
    return;
  }

  const payload = {
    designChoice: formValue(data, "designChoice"),
    opacityPreference: formValue(data, "opacityPreference"),
    idea: formValue(data, "idea"),
    email,
    emailConsent,
    source: "mahjong-preview",
  };

  submitButton.disabled = true;
  submitButton.textContent = "Submitting...";

  try {
    const response = await fetch("/api/mahjong-feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(result.message || "Feedback could not be submitted.");
    }

    form.reset();
    setStatus("Thank you. Your feedback helps us choose the first production designs.");
  } catch (error) {
    setStatus(error.message || "Feedback could not be submitted. Please try again later.", true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Submit Feedback";
  }
});
