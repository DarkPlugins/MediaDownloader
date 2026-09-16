import { getSettings, isAbsoluteFolder } from "./settings.js";
import { rememberDirectory, getDirectory } from "./directories.js";

const kind = location.hash.slice(1) === "video" ? "video" : "image";
const status = document.getElementById("folder-status");
const choose = document.getElementById("choose-folder");
let startIn = "downloads";
document.getElementById("folder-title").textContent = `Choose ${kind === "image" ? "image" : "video"} folder`;
document.getElementById("close").addEventListener("click", () => window.close());

choose.addEventListener("click", async () => {
  choose.disabled = true;
  try {
    if (!window.showDirectoryPicker) throw new Error("Folder selection is unavailable in this browser. Use Downloads instead.");
    // The picker needs this direct click in a stable tab, not a toolbar popup
    // that may close when the native dialog receives focus.
    const handle = await window.showDirectoryPicker({ id: `md-${kind}`, mode: "readwrite", startIn });
    const id = await rememberDirectory(handle);
    await chrome.storage.local.set({ [`${kind}Folder`]: handle.name, [`${kind}DirectoryId`]: id });
    startIn = handle;
    status.textContent = `${kind === "image" ? "Images" : "Videos"} will be saved to “${handle.name}”. Your selection is saved.`;
    document.getElementById("requested-path").hidden = true;
    choose.textContent = "Choose another folder…";
  } catch (error) {
    status.textContent = error.name === "AbortError" ? "No folder selected. Your previous setting is unchanged." : error.message;
  } finally {
    choose.disabled = false;
  }
});

try {
  const settings = await getSettings();
  const path = settings[`${kind}Folder`];
  if (settings[`${kind}DirectoryId`]) {
    startIn = await getDirectory(settings[`${kind}DirectoryId`]);
  } else if (isAbsoluteFolder(path)) {
    const requested = document.getElementById("requested-path");
    requested.textContent = `Select this folder in the dialog: ${path}`;
    requested.hidden = false;
  }
} catch {
  status.textContent = "Choose a folder to reconnect access.";
}
