/*
 * MediaDownloader
 * Background service worker.
 *
 * The extension creates separate context-menu entries for images and videos.
 * For an image, the browser-provided srcUrl is preferred. If it is a thumbnail
 * or a link, the content script tries to resolve a higher-resolution candidate.
 */

const MENU_IDS = {
  imageOriginal: "md-image-original",
  imagePng: "md-image-png",
  videoOriginal: "md-video-original",
  videoMp4: "md-video-mp4"
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

    chrome.contextMenus.create({
      id: MENU_IDS.videoMp4,
      title: "MediaDownloader: Download video as MP4",
      contexts: ["video"]
    });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  try {
    const isImage = info.menuItemId === MENU_IDS.imageOriginal ||
                    info.menuItemId === MENU_IDS.imagePng;
    const isVideo = info.menuItemId === MENU_IDS.videoOriginal ||
                    info.menuItemId === MENU_IDS.videoMp4;

    if (!isImage && !isVideo) return;

    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: resolveMediaUrl,
      args: [{
        kind: isImage ? "image" : "video",
        url: info.srcUrl || "",
        pageUrl: tab.url || "",
        mode: info.menuItemId
      }]
    });

    const resolved = result?.[0]?.result;
    if (!resolved?.url) {
      throw new Error("Could not resolve the media URL.");
    }

    const wantsConversion =
      info.menuItemId === MENU_IDS.imagePng ||
      info.menuItemId === MENU_IDS.videoMp4;

    // Browser downloads can save original files. PNG/MP4 conversion is
    // performed by a local page because the Downloads API itself cannot
    // transcode arbitrary remote media.
    if (wantsConversion) {
      await openConverterTab(tab, resolved, isImage ? "png" : "mp4");
      return;
    }

    const filename = buildFilename(
      resolved.url,
      isImage ? "image" : "video",
      true
    );

    await chrome.downloads.download({
      url: resolved.url,
      filename,
      conflictAction: "uniquify",
      saveAs: true
    });
  } catch (error) {
    console.error("MediaDownloader:", error);
  }
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "md-close-converter" && sender.tab?.id) {
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
    try { return new URL(value, location.href).href; }
    catch { return ""; }
  };

  const clean = (value) => absolute((value || "").trim());

  if (request.kind === "image") {
    const clicked = [...document.images].find(img =>
      img.currentSrc === request.url ||
      img.src === request.url ||
      absolute(img.getAttribute("src")) === request.url
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

      if (clicked.dataset?.src) return { url: clean(clicked.dataset.src) };

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

    return { url: clean(request.url) };
  }

  const clickedVideo = [...document.querySelectorAll("video")].find(video =>
    video.currentSrc === request.url ||
    video.src === request.url
  );

  if (clickedVideo) {
    if (clickedVideo.currentSrc) return { url: clickedVideo.currentSrc };

    const source = [...clickedVideo.querySelectorAll("source[src]")][0];
    if (source?.src) return { url: source.src };

    if (clickedVideo.src) return { url: clickedVideo.src };
  }

  return { url: clean(request.url) };
}

async function openConverterTab(tab, media, format) {
  const payload = {
    url: media.url,
    format,
    sourcePage: tab.url || ""
  };

  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = chrome.runtime.getURL(`src/html/converter.html#${encoded}`);
  await chrome.tabs.create({ url, active: false });
}

function buildFilename(mediaUrl, type, preserveName) {
  let base = `${type}-${Date.now()}`;
  try {
    const parsed = new URL(mediaUrl);
    const raw = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    if (preserveName && raw) {
      base = raw.replace(/\.[^.]+$/, "") || base;
    }
  } catch (_) {}

  const extension = type === "image" ? getExtension(mediaUrl, "bin") : getExtension(mediaUrl, "bin");
  return `${sanitize(base)}.${extension}`;
}

function getExtension(url, fallback) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-z0-9]{2,8})$/i);
    return match ? match[1].toLowerCase() : fallback;
  } catch {
    return fallback;
  }
}

function sanitize(value) {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").slice(0, 180);
}
