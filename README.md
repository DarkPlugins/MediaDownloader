# MediaDownloader

MediaDownloader is a Manifest V3 extension for Chromium-based browsers.

## Use

Open the toolbar popup to configure your downloads. Every change is saved immediately in `chrome.storage.local`, without a Save button or expiry. Settings survive popup closes, service-worker restarts, browser restarts, and extension updates; uninstalling the extension clears them.

- **Default save folders:** independent destinations for Images and Videos, both defaulting to Downloads. Previously saved shared-folder preferences apply to both until you change them. Enter a relative subfolder such as `Media/Images`, or use **Browse** to authorize any folder through the browser. Browse opens a stable extension tab; click **Browse folder…** there and paste a full path into the system folder dialog if desired. A full path typed into the popup is saved but must be authorized with Browse before downloading. The browser returns only the selected folder name, not its absolute system path, so that name replaces the text after selection. No local helper is needed.
- **Default format:** PNG for images (also JPG, WebP, or Original), MP4 for videos (also Original).
- **Don't ask for filename:** off by default. Enable it to save immediately with an automatic filename. Duplicate filenames get a number instead of overwriting existing files. When disabled, the native Save As dialog lets you choose the final name and location. For an authorized folder, the converter shows a **Save file…** button first because the browser requires a direct click to open that picker; the picker starts in the selected folder.

Authorized folder handles are stored in IndexedDB and survive browser restarts. If the browser needs renewed permission, the converter asks for **Allow folder access** before continuing; it never silently switches destinations. Files written through folder access do not appear in the browser's download history. Clearing extension data or uninstalling removes the preferences and saved folder handles.

Right-click an image or video and choose the MediaDownloader command. **Download image as PNG (configured)** (or the configured image/video format) follows your popup settings and updates its label when you change the format. **Download image as original** and **Download video as original** always remain available and preserve the source format and extension. Both commands use the corresponding image/video folder and respect **Don't ask for filename**.

Images are converted locally. Existing MP4 files keep their original bytes; other playable videos are encoded to MP4 using the browser's MediaRecorder when supported. Video conversion runs at playback speed and holds the media in memory, so long videos can take time and substantial memory. Unsupported codecs, streams, or browsers show an error with guidance to choose Original; files are never merely renamed to MP4. JPG uses a white background for transparent images.

The converter opens in an inactive tab and closes after the download completes. If conversion or downloading fails, its error tab comes to the foreground. Keep the tab open while it is working.

## Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this directory.

## Permissions

- `contextMenus`: adds the right-click commands.
- `downloads`: opens and handles browser downloads.
- `storage`: persists your download preferences on this device.
- `unlimitedStorage`: protects saved folder handles in IndexedDB from automatic storage eviction.
- `scripting` and `tabs`: resolves media URLs on the current page.
- `<all_urls>`: permits resolving media on arbitrary websites.

Only download media you are authorized to download. The extension does not bypass DRM, authentication, paywalls, or access controls.
