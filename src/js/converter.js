/*
 * Media conversion page.
 *
 * PNG: fetch the image, draw it to a canvas, and download a PNG Blob.
 * Failures remain visible until the user closes the page.
 */

import { buildFilename } from "./filename.js";

const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const closeBtn = document.getElementById("close");

closeBtn.addEventListener("click", () => window.close());

async function closeConverter() {
  await chrome.runtime.sendMessage({ type: "md-close-converter" });
}

function decodePayload() {
  try {
    const encoded = location.hash.slice(1);
    const payload = JSON.parse(decodeURIComponent(encoded));
    if (!payload || typeof payload !== "object") throw new Error();
    if (typeof payload.error === "string" && payload.error.trim()) return payload;
    if (payload.format !== "png" || typeof payload.url !== "string" || !payload.url.trim()) {
      throw new Error();
    }
    new URL(payload.url);
    return payload;
  } catch (error) {
    throw new Error("Invalid conversion request.");
  }
}

function setStatus(message, progress = null) {
  statusEl.textContent = message;
  if (progress !== null) {
    progressEl.hidden = false;
    progressEl.value = progress;
  }
}

async function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    await chrome.downloads.download({
      url,
      filename,
      conflictAction: "uniquify",
      saveAs: true
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

async function convertImage(payload) {
  setStatus("Fetching image…", 10);

  const response = await fetch(payload.url, { credentials: "include" });
  if (!response.ok) throw new Error(`Image request failed: ${response.status}`);

  const blob = await response.blob();
  setStatus("Rendering PNG…", 55);

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d", { alpha: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const png = await new Promise((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error("PNG encoding failed.")), "image/png");
  });

  setStatus("Starting download…", 90);
  await downloadBlob(png, buildFilename(payload.url, "image", "png"));
}

(async () => {
  try {
    const payload = decodePayload();

    if (payload.error) throw new Error(payload.error);
    await convertImage(payload);
    await closeConverter();
  } catch (error) {
    setStatus(error.message || "Conversion failed.");
    progressEl.hidden = true;
    document.title = "MediaDownloader — Download failed";
    // Bring an inactive converter tab to the foreground so the error is seen.
    try {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id != null) await chrome.tabs.update(tab.id, { active: true });
    } catch (activationError) {
      console.error("MediaDownloader: Could not activate error tab.", activationError);
    }
  }
})();
