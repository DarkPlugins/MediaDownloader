export const DEFAULT_SETTINGS = Object.freeze({
  imageFolder: "",
  videoFolder: "",
  imageDirectoryId: "",
  videoDirectoryId: "",
  imageFormat: "png",
  videoFormat: "mp4"
});

export const IMAGE_FORMATS = ["png", "jpg", "webp", "original"];
export const VIDEO_FORMATS = ["mp4", "original"];

export function isAbsoluteFolder(value) {
  return /^(?:[a-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/i.test(value);
}

/** Accept Windows absolute paths and relative paths inside Downloads. */
export function normalizeFolder(value) {
  if (typeof value !== "string") throw new Error("Enter a folder name.");
  let folder = value.trim().replace(/\\/g, "/");
  if (!folder) return "";
  let prefix = "";
  if (/^[a-z]:\//i.test(folder)) {
    prefix = folder.slice(0, 3).toUpperCase();
    folder = folder.slice(3);
  } else if (folder.startsWith("//")) {
    prefix = "//";
    folder = folder.slice(2);
    if (folder.split("/").filter(Boolean).length < 2) throw new Error("Enter a full network path, such as \\\\server\\share.");
  } else if (folder.startsWith("/")) {
    throw new Error("Enter a full Windows path, such as D:\\Pictures.");
  }
  const parts = folder.replace(/\/+$/, "").split("/");
  if (prefix && folder === "") return prefix.replace(/\//g, "\\");
  if (parts.some(part => !part || part === "." || part === ".." ||
      /[<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) || part.length > 100)) {
    throw new Error("Use valid folder names without .. or special characters.");
  }
  if (folder.length > 220) throw new Error("Please use a shorter folder path.");
  const result = prefix + parts.join("/");
  return prefix ? result.replace(/\//g, "\\") : result;
}

export function normalizeSettings(value = {}) {
  const folder = key => {
    try { return normalizeFolder(value[key] ?? value.saveFolder ?? ""); } catch { return ""; }
  };
  return {
    imageFolder: folder("imageFolder"),
    videoFolder: folder("videoFolder"),
    imageDirectoryId: typeof value.imageDirectoryId === "string" ? value.imageDirectoryId : "",
    videoDirectoryId: typeof value.videoDirectoryId === "string" ? value.videoDirectoryId : "",
    imageFormat: IMAGE_FORMATS.includes(value.imageFormat) ? value.imageFormat : "png",
    videoFormat: VIDEO_FORMATS.includes(value.videoFormat) ? value.videoFormat : "mp4"
  };
}

export async function getSettings() {
  return normalizeSettings(await chrome.storage.local.get([...Object.keys(DEFAULT_SETTINGS), "saveFolder"]));
}

export function downloadOptions(filename, settings, kind = "image") {
  const value = normalizeSettings(settings);
  const folder = value[`${kind}Folder`];
  // Other destinations can be chosen in the native Save As dialog.
  const relativeFolder = !value[`${kind}DirectoryId`] && !isAbsoluteFolder(folder) ? folder : "";
  return {
    filename: relativeFolder ? `${relativeFolder}/${filename}` : filename,
    conflictAction: "uniquify",
    saveAs: true
  };
}
