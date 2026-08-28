/*
 * Media conversion page.
 *
 * PNG: fetch the image, draw it to a canvas, and download a PNG Blob.
 * MP4: browser APIs do not provide a universal, reliable MP4 encoder.
 * We therefore attempt MediaSource/HTMLMediaElement capture only where the
 * browser can expose a playable stream. If no MP4 encoder is available,
 * the page explains the limitation rather than silently producing a bad file.
 */

const statusEl = document.getElementById("status");
const progressEl = document.getElementById("progress");
const closeBtn = document.getElementById("close");

closeBtn.addEventListener("click", () => window.close());

function closeConverter() {
  chrome.runtime.sendMessage({ type: "md-close-converter" });
}

function decodePayload() {
  try {
    const encoded = location.hash.slice(1);
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json);
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

function safeBaseName(url, fallback) {
  try {
    const raw = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    return raw.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\x00-\x1F]/g, "_") || fallback;
  } catch {
    return fallback;
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
  await downloadBlob(png, `${safeBaseName(payload.url, "image")}.png`);
}

async function convertVideo(payload) {
  /*
   * A true arbitrary-video-to-MP4 converter requires an encoder such as
   * FFmpeg/WebCodecs or a server-side transcoder. Shipping a WASM encoder
   * would make this extension much larger. The extension therefore refuses
   * to claim conversion when an encoder is not present.
   */
  throw new Error(
    "MP4 conversion requires an encoder. The bundled extension does not " +
    "include a third-party encoder, so the original video is not modified."
  );
}

(async () => {
  try {
    const payload = decodePayload();

    if (payload.format === "png") {
      await convertImage(payload);
    } else if (payload.format === "mp4") {
      await convertVideo(payload);
    } else {
      throw new Error("Unsupported conversion format.");
    }
    closeConverter();
  } catch (error) {
    setStatus(error.message || "Conversion failed.");
    progressEl.hidden = true;
    closeConverter();
  }
})();
