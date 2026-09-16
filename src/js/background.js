/*
 * MediaDownloader
 * Background service worker.
 *
 * The extension creates separate context-menu entries for images and videos.
 * For an image, the browser-provided srcUrl is preferred. If it is a thumbnail
 * or a link, the content script tries to resolve a higher-resolution candidate.
 */

import { buildFilename } from "./filename.js";

const MENU_IDS = {
  imageOriginal: "md-image-original",
  imagePng: "md-image-png",
  videoOriginal: "md-video-original"
};

chrome.runtime.onInstalled.addListener(() => {
  createContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenus();
});

function createContextMenus() {
  chrome.contextMenus.removeAll().then(() => {
    chrome.contextMenus.create({
      id: MENU_IDS.imageOriginal,
      title: "MediaDownloader: Download image as original",
      contexts: ["image"]
    });

    chrome.contextMenus.create({
      id: MENU_IDS.imagePng,
      title: "MediaDownloader: Download image as PNG",
      contexts: ["image"]
    });

    chrome.contextMenus.create({
      id: MENU_IDS.videoOriginal,
      title: "MediaDownloader: Download video as original",
      contexts: ["video"]
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (tab?.id == null) return;

  try {
    const isImage = info.menuItemId === MENU_IDS.imageOriginal ||
                    info.menuItemId === MENU_IDS.imagePng;
    const isVideo = info.menuItemId === MENU_IDS.videoOriginal;

    if (!isImage && !isVideo) return;

    // Looking for a higher-resolution source is optional. A valid browser
    // source still works when the page cannot be inspected.
    const sourceUrl = typeof info.srcUrl === "string" ? info.srcUrl.trim() : "";
    let resolved = { url: sourceUrl };
    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
        func: resolveMediaUrl,
        args: [{ kind: isImage ? "image" : "video", url: sourceUrl }]
      });
      const candidate = result?.[0]?.result?.url;
      if (typeof candidate === "string" && candidate.trim()) {
        resolved = { url: candidate.trim() };
      }
    } catch (error) {
      console.warn("MediaDownloader: Could not inspect media; using the source URL.", error);
    }
    if (!resolved.url) {
      throw new Error("Could not resolve the media URL.");
    }

    if (info.menuItemId === MENU_IDS.imagePng) {
      await openConverterTab({ url: resolved.url, format: "png" });
      return;
    }

    const filename = buildFilename(
      resolved.url,
      isImage ? "image" : "video"
    );

    await chrome.downloads.download({
      url: resolved.url,
      filename,
      conflictAction: "uniquify",
      saveAs: true
    });
  } catch (error) {
    console.error("MediaDownloader:", error);
    await openConverterTab({ error: error.message || "Download failed." }, true)
      .catch(reportError => console.error("MediaDownloader: Could not show error.", reportError));
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "md-close-converter" && sender.tab?.id != null) {
    chrome.tabs.remove(sender.tab.id).catch(() => {});
  }
});

/**
 * Runs inside the target page. It tries to find a full-resolution media URL.
 * For images, linked originals and srcset/currentSrc are considered.
 * For videos, the clicked source/currentSrc and source elements are checked.
 */
function resolveMediaUrl(request) {
  const absolute = (value) => {
    if (typeof value !== "string" || !value.trim()) return "";
    try { return new URL(value.trim(), document.baseURI || location.href).href; }
    catch { return ""; }
  };

  const clean = absolute;
  const requestUrl = clean(request.url);
  if (!requestUrl) return { url: "" };

  if (request.kind === "image") {
    const clicked = [...document.images].find(img =>
      img.currentSrc === requestUrl ||
      img.src === requestUrl ||
      absolute(img.getAttribute("src")) === requestUrl
    );

    if (clicked) {
      const anchor = clicked.closest("a[href]");
      if (anchor?.href) {
        const href = anchor.href;
        // Follow likely direct media links when the anchor itself points to
        // an image/video file. Otherwise keep searching on the image element.
        if (/\.(?:avif|bmp|gif|jpe?g|png|svg|tiff?|webp)(?:[?#].*)?$/i.test(href)) {
          return { url: href };
        }
      }

      const lazySource = clean(clicked.dataset?.src);
      if (lazySource) return { url: lazySource };

      const sourceSet = clicked.getAttribute("srcset");
      if (sourceSet) {
        const candidates = sourceSet.split(",")
          .map(part => {
            const pieces = part.trim().split(/\s+/);
            const descriptor = pieces[1] || "1x";
            const score = descriptor.endsWith("w")
              ? parseInt(descriptor, 10)
              : parseFloat(descriptor) * Math.max(clicked.naturalWidth || 1, 1);
            return { url: clean(pieces[0]), score: Number.isFinite(score) ? score : 0 };
          })
          .filter(x => x.url)
          .sort((a, b) => b.score - a.score);

        if (candidates[0]) return { url: candidates[0].url };
      }

      if (clicked.currentSrc) return { url: clicked.currentSrc };
      if (clicked.src) return { url: clicked.src };
    }

    return { url: requestUrl };
  }

  const clickedVideo = [...document.querySelectorAll("video")].find(video =>
    video.currentSrc === requestUrl ||
    video.src === requestUrl
  );

  if (clickedVideo) {
    if (clickedVideo.currentSrc) return { url: clickedVideo.currentSrc };

    const source = [...clickedVideo.querySelectorAll("source[src]")][0];
    if (source?.src) return { url: source.src };

    if (clickedVideo.src) return { url: clickedVideo.src };
  }

  return { url: requestUrl };
}

async function openConverterTab(payload, active = false) {
  const encoded = encodeURIComponent(JSON.stringify(payload));
  const url = chrome.runtime.getURL(`src/html/converter.html#${encoded}`);
  await chrome.tabs.create({ url, active });
}
