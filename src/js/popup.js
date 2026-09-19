import { getSettings, normalizeFolder, isAbsoluteFolder } from "./settings.js";

const fields = document.getElementById("settings-fields");
const status = document.getElementById("save-status");
const folders = Object.fromEntries(["image", "video"].map(kind => [kind, {
  input: document.getElementById(`${kind}-folder`),
  error: document.getElementById(`${kind}-folder-error`),
  browse: document.getElementById(`browse-${kind}`)
}]));
let pending = 0;
const failedKeys = new Set();

function setStatus(message, state) {
  status.textContent = message;
  status.dataset.state = state;
}

function updateStatus() {
  if (failedKeys.size) setStatus("Could not save. Change the setting to retry.", "error");
  else if (Object.values(folders).some(field => !field.error.hidden)) setStatus("Check the folder settings above.", "error");
  else if (!pending) setStatus("All changes saved automatically", "saved");
}

async function save(values) {
  pending++;
  setStatus("Saving…", "saving");
  try {
    // Immediate writes survive popup close, including each field's destination type.
    await chrome.storage.local.set(values);
    Object.keys(values).forEach(key => failedKeys.delete(key));
  } catch {
    Object.keys(values).forEach(key => failedKeys.add(key));
  } finally {
    pending--;
    updateStatus();
  }
}

function folderNotice(kind, value, directoryId = "") {
  const field = folders[kind];
  const needsAccess = !directoryId && isAbsoluteFolder(value);
  field.error.textContent = needsAccess
    ? (typeof window.showDirectoryPicker === "function"
      ? "Use Browse to select and allow access to this folder."
      : "This browser cannot use an absolute folder path. Leave empty for Downloads or enter a relative subfolder.")
    : "";
  field.error.hidden = !needsAccess;
  field.input.title = directoryId ? `Selected folder: ${value}. The browser hides the full system path.` : value;
  field.input.dataset.selected = directoryId ? "true" : "false";
}

document.getElementById("settings-form").addEventListener("submit", event => event.preventDefault());
for (const [kind, field] of Object.entries(folders)) {
  field.input.addEventListener("input", () => {
    try {
      const value = normalizeFolder(field.input.value);
      field.input.removeAttribute("aria-invalid");
      folderNotice(kind, value);
      void save({ [`${kind}Folder`]: value, [`${kind}DirectoryId`]: "" });
    } catch (error) {
      field.error.textContent = error.message;
      field.error.hidden = false;
      field.input.setAttribute("aria-invalid", "true");
      setStatus("Folder not saved. Your previous folder is still in use.", "error");
    }
  });
  field.browse.addEventListener("click", async () => {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL(`src/html/folder.html#${kind}`) });
    } catch {
      setStatus("Could not open the folder picker. Please try again.", "error");
    }
  });
}
for (const kind of ["image", "video"]) {
  const select = document.getElementById(`${kind}-format`);
  select.addEventListener("change", () => void save({ [`${kind}Format`]: select.value }));
}
// Folder browsing is optional; the normal Save As dialog remains available.
if (typeof window.showDirectoryPicker !== "function") {
  document.getElementById("folder-help").textContent = "Leave empty for Downloads or enter a relative subfolder such as Media/Images. Absolute folder paths are unavailable in this browser.";
  for (const field of Object.values(folders)) {
    field.browse.disabled = true;
    field.browse.title = "Folder browsing is unavailable in this browser. Use Downloads or a relative subfolder.";
  }
}

function render(settings) {
  for (const [kind, field] of Object.entries(folders)) {
    field.input.value = settings[`${kind}Folder`];
    folderNotice(kind, settings[`${kind}Folder`], settings[`${kind}DirectoryId`]);
    document.getElementById(`${kind}-format`).value = settings[`${kind}Format`];
  }
}

try {
  render(await getSettings());
  fields.disabled = false;
  updateStatus();
} catch {
  setStatus("Could not load settings. Please reopen the popup.", "error");
}
