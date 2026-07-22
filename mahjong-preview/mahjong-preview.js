const form = document.querySelector("#feedback-form");
const statusEl = document.querySelector("#form-status");
const zoomTargetSelector = ".design-frame, .sample-gallery img, .photo-grid img, .idea-strip img";
const zoomImages = document.querySelectorAll(
  ".design-frame img, .sample-gallery img, .photo-grid img, .idea-strip img",
);

function formValue(data, key) {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function createLightbox() {
  const lightbox = document.createElement("div");
  lightbox.className = "image-lightbox";
  lightbox.hidden = true;
  lightbox.innerHTML = `
    <button class="lightbox-close" type="button" aria-label="Close enlarged image">Close</button>
    <img alt="" />
  `;
  document.body.append(lightbox);
  return lightbox;
}

const lightbox = zoomImages.length ? createLightbox() : null;
const lightboxImage = lightbox?.querySelector("img");
const lightboxClose = lightbox?.querySelector(".lightbox-close");

if (lightboxImage) {
  Object.assign(lightboxImage.style, {
    width: "auto",
    maxWidth: "min(100%, 1280px)",
    maxHeight: "min(84vh, 900px)",
    display: "block",
    objectFit: "contain",
  });
}

if (lightboxClose) {
  Object.assign(lightboxClose.style, {
    position: "absolute",
    top: "clamp(14px, 3vw, 28px)",
    right: "clamp(14px, 3vw, 28px)",
  });
}

function closeLightbox() {
  if (!lightbox) return;
  lightbox.hidden = true;
  document.body.classList.remove("lightbox-open");
  lightboxImage?.removeAttribute("src");
}

function openLightbox(image) {
  if (!lightbox || !lightboxImage) return;
  lightboxImage.src = image.currentSrc || image.src;
  lightboxImage.alt = image.alt || "Enlarged preview image";
  lightbox.hidden = false;
  document.body.classList.add("lightbox-open");
  lightboxClose?.focus();
}

function imageFromZoomTarget(target) {
  if (!target?.closest) return null;
  const zoomTarget = target.closest(zoomTargetSelector);
  if (!zoomTarget) return null;
  return zoomTarget.matches("img") ? zoomTarget : zoomTarget.querySelector("img");
}

zoomImages.forEach((image) => {
  image.classList.add("zoomable-image");
  image.title = "Click to enlarge";
});

document.querySelectorAll(".design-frame").forEach((frame) => {
  frame.classList.add("zoomable-frame");
  frame.tabIndex = 0;
  frame.setAttribute("role", "button");
  frame.setAttribute("aria-label", `${frame.querySelector("img")?.alt || "Preview image"}. Click to enlarge.`);
});

document.addEventListener("click", (event) => {
  const image = imageFromZoomTarget(event.target);
  if (image) {
    openLightbox(image);
  }
});

lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    closeLightbox();
  }
});

lightboxClose?.addEventListener("click", closeLightbox);

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    const image = imageFromZoomTarget(event.target);
    if (image) {
      event.preventDefault();
      openLightbox(image);
      return;
    }
  }

  if (event.key === "Escape" && lightbox && !lightbox.hidden) {
    closeLightbox();
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");

  const submitButton = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const email = formValue(data, "email");

  const payload = {
    designChoice: formValue(data, "designChoice"),
    opacityPreference: formValue(data, "opacityPreference"),
    packPreference: formValue(data, "packPreference"),
    idea: formValue(data, "idea"),
    email,
    emailConsent: Boolean(email),
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
