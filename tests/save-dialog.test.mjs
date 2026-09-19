import assert from "node:assert/strict";
import { test } from "node:test";
import { downloadOptions, normalizeSettings } from "../src/js/settings.js";

test("old opt-out settings cannot suppress Save As", () => {
  for (const kind of ["image", "video"]) {
    const settings = { dontAskFilename: true, [`${kind}Folder`]: "Media" };
    assert.equal(normalizeSettings(settings).dontAskFilename, undefined);
    assert.deepEqual(downloadOptions("photo.png", settings, kind), {
      filename: "Media/photo.png", conflictAction: "uniquify", saveAs: true
    });
    assert.equal(downloadOptions("photo.png", { ...settings, [`${kind}DirectoryId`]: "old-folder" }, kind).filename, "photo.png");
    assert.equal(downloadOptions("photo.png", { ...settings, [`${kind}Folder`]: "C:\\Pictures" }, kind).saveAs, true);
  }
});

test("original images and videos request the normal save dialog", async () => {
  const event = { addListener() {} };
  const downloads = [];
  let onClick;
  globalThis.chrome = {
    storage: { local: { get: async () => ({ dontAskFilename: true }) }, onChanged: event },
    runtime: { onInstalled: event, onStartup: event, onMessage: event },
    contextMenus: { onClicked: { addListener: callback => { onClick = callback; } } },
    scripting: { executeScript: async () => [] },
    downloads: { download: async options => downloads.push(options) }
  };
  await import("../src/js/background.js");
  for (const kind of ["image", "video"]) {
    await onClick({ menuItemId: `md-${kind}-original`, srcUrl: "https://example.com/media.png" }, { id: 1 });
  }
  assert.equal(downloads.length, 2);
  assert.ok(downloads.every(options => options.saveAs === true));
});

for (const savedFolder of [false, true]) {
  test(`converted PNG opens Save As without folder APIs (saved folder: ${savedFolder})`, { timeout: 2000 }, async () => {
    const elements = new Map();
    const downloads = [];
    globalThis.window = {};
    globalThis.document = {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { addEventListener() {} });
        return elements.get(id);
      },
      createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: callback => callback(new Blob(["png"], { type: "image/png" })) })
    };
    globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
    globalThis.fetch = async () => ({ ok: true, blob: async () => new Blob(["image"]) });
    globalThis.location = { hash: `#${encodeURIComponent(JSON.stringify({
      url: "https://example.com/photo.jpg", format: "png", kind: "image",
      settings: { dontAskFilename: true, imageDirectoryId: savedFolder ? "old-folder" : "" }
    }))}` };
    let resolveDone, rejectDone;
    const done = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
    globalThis.chrome = {
      runtime: { sendMessage: async () => resolveDone() },
      tabs: { getCurrent: async () => ({ id: 1 }), update: async () => rejectDone(new Error(document.getElementById("status").textContent)) },
      downloads: {
        download: async options => { downloads.push(options); return 1; },
        search: async () => [{ state: "complete" }],
        onChanged: { addListener() {}, removeListener() {} }
      }
    };
    await import(`../src/js/converter.js?folder=${savedFolder}`);
    await done;
    assert.equal(downloads.length, 1);
    assert.equal(downloads[0].saveAs, true);
    assert.equal(downloads[0].filename, "photo.png");
  });
}
