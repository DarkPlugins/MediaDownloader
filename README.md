# MediaDownloader

MediaDownloader is a Manifest V3 extension for Chromium-based browsers.

## Use

Open the toolbar popup to configure your downloads. Every change is saved immediately in `chrome.storage.local`, without a Save button or expiry. Settings survive popup closes, service-worker restarts, browser restarts, and extension updates; uninstalling the extension clears them.

- **Default save folders:** independent suggestions for Images and Videos, both defaulting to Downloads. Relative subfolders such as Media/Images are suggested in the browser's Save As dialog. Where supported, **Browse** lets you select a folder as the starting location for the native file picker. It opens a stable extension tab for folder selection. The browser exposes only the selected folder name, not its full path.
- **Default format:** PNG for images (also JPG, WebP, or Original), MP4 for videos (also Original).

Every download opens a native **Save As** dialog so you can choose the filename and final location.

Right-click an image or video and choose the MediaDownloader command. **Download image as PNG (configured)** (or the configured image/video format) follows your popup settings and updates its label when you change the format. **Download image as original** and **Download video as original** preserve the source format and extension. All commands ask where to save the file.

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
