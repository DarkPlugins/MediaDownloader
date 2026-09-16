# MediaDownloader

MediaDownloader is a Manifest V3 extension for Chromium-based browsers.

## Use

Right-click an image or video and choose the desired MediaDownloader command. Every download opens the browser's native **Save As** dialog, where you choose the name and destination. There is no settings page or completion page.

PNG images are converted locally before the Save As dialog opens. The converter opens in an inactive tab and closes automatically after starting the download. If a download or conversion fails, an error tab is brought to the foreground and stays open until you close it. MP4 conversion is not offered because this version does not include a video encoder; videos can be downloaded in their original format.

## Installation

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this directory.

## Permissions

- `contextMenus`: adds the right-click commands.
- `downloads`: opens and handles browser downloads.
- `scripting` and `tabs`: resolves media URLs on the current page.
- `<all_urls>`: permits resolving media on arbitrary websites.

Only download media you are authorized to download. The extension does not bypass DRM, authentication, paywalls, or access controls.
