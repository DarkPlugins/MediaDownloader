/*
 * Media conversion page.
 *
 * Convert images locally and transcode supported videos to MP4.
 * Failures remain visible until the user closes the page.
 */

import { buildFilename } from "./filename.js";
import { downloadOptions, normalizeSettings } from "./settings.js";
import { toMp4 } from "./video.js";
import { getDirectory, writeFile } from "./directories.js";

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
    if (!["png", "jpg", "webp", "mp4", "original"].includes(payload.format) || typeof payload.url !== "string" || !payload.url.trim()) {
      throw new Error();
    }
    new URL(payload.url);
    payload.settings = normalizeSettings(payload.settings);
    payload.kind = payload.kind === "video" || payload.format === "mp4" ? "video" : "image";
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

async function requestAction(message, label, action) {
  setStatus(message);
  progressEl.hidden = true;
  const button = document.getElementById("action");
  button.textContent = label;
  button.disabled = false;
  button.hidden = false;
  const tab = await chrome.tabs.getCurrent();
  if (tab?.id != null) await chrome.tabs.update(tab.id, { active: true });
  return new Promise((resolve, reject) => {
    button.onclick = async () => {
      button.disabled = true;
      try { resolve(await action()); } catch (error) { reject(error); }
      finally { button.hidden = true; button.onclick = null; }
    };
  });
}

async function downloadBlob(blob, filename, settings, kind) {
  const directoryId = settings[`${kind}DirectoryId`];
  if (directoryId && typeof window.showSaveFilePicker === "function") {
    const directory = await getDirectory(directoryId);
    const file = await requestAction("Choose the filename and location for your download.", "Save file…", () =>
      window.showSaveFilePicker({ suggestedName: filename, startIn: directory }));
    await writeFile(file, blob);
    return;
  }
  setStatus("Starting download…", 95);
  const url = URL.createObjectURL(blob);
  try {
    const id = await chrome.downloads.download({
      url,
      ...downloadOptions(filename, settings, kind)
    });
    // Keep the converter and Blob alive until the browser has saved the file.
    await new Promise((resolve, reject) => {
      const finish = item => {
        const state = item.state?.current || item.state;
        if (state !== "complete" && state !== "interrupted") return;
        chrome.downloads.onChanged.removeListener(onChanged);
        if (state === "complete") resolve();
        else reject(new Error(`Download interrupted: ${item.error?.current || item.error || "unknown error"}`));
      };
      const onChanged = delta => { if (delta.id === id) finish(delta); };
      chrome.downloads.onChanged.addListener(onChanged);
      chrome.downloads.search({ id }).then(items => {
        if (items[0]) finish(items[0]);
        else {
          chrome.downloads.onChanged.removeListener(onChanged);
          reject(new Error("Download could not be found."));
        }
      }).catch(error => {
        chrome.downloads.onChanged.removeListener(onChanged);
        reject(error);
      });
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function convertImage(payload) {
  setStatus("Fetching image…", 10);

  const response = await fetch(payload.url, { credentials: "include" });
  if (!response.ok) throw new Error(`Image request failed: ${response.status}`);

  const blob = await response.blob();
  setStatus(`Rendering ${payload.format.toUpperCase()}…`, 55);

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;

  const context = canvas.getContext("2d", { alpha: payload.format !== "jpg" });
  if (!context) { bitmap.close(); throw new Error("Image rendering is unavailable."); }
  if (payload.format === "jpg") {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();

  const mime = payload.format === "jpg" ? "image/jpeg" : `image/${payload.format}`;
  const output = await new Promise((resolve, reject) => {
    canvas.toBlob(result => result?.type === mime ? resolve(result) : reject(new Error(`${payload.format.toUpperCase()} encoding failed.`)), mime, .95);
  });

  setStatus("Starting download…", 90);
  await downloadBlob(output, buildFilename(payload.url, "image", payload.format), payload.settings, "image");
}

async function convertVideo(payload) {
  setStatus("Fetching video…", 5);
  const response = await fetch(payload.url, { credentials: "include" });
  if (!response.ok) throw new Error(`Video request failed: ${response.status}`);
  const output = await toMp4(await response.blob(), setStatus);
  setStatus("Saving MP4…", 95);
  await downloadBlob(output, buildFilename(payload.url, "video", "mp4"), payload.settings, "video");
}

async function downloadOriginal(payload) {
  setStatus(`Fetching ${payload.kind}…`, 10);
  const response = await fetch(payload.url, { credentials: "include" });
  if (!response.ok) throw new Error(`Media request failed: ${response.status}`);
  await downloadBlob(await response.blob(), buildFilename(payload.url, payload.kind), payload.settings, payload.kind);
}

(async () => {
  try {
    const payload = decodePayload();

    if (payload.error) throw new Error(payload.error);
    if (payload.format === "original") await downloadOriginal(payload);
    else if (payload.format === "mp4") await convertVideo(payload);
    else await convertImage(payload);
    await closeConverter();
  } catch (error) {
    setStatus(error.name === "AbortError" ? "Save cancelled. No download was completed." : error.message || "Conversion failed.");
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
