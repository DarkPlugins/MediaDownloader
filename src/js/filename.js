/** Build a safe, bounded filename for original media and converted images. */
export function buildFilename(mediaUrl, type, outputExtension) {
  const fallback = `${type}-${Date.now()}`;
  let raw = "";
  try {
    const parsed = new URL(mediaUrl);
    // Data and blob URLs do not contain useful original filenames.
    if (parsed.protocol !== "data:" && parsed.protocol !== "blob:") {
      raw = decodeURIComponent(parsed.pathname.split("/").pop() || "");
    }
  } catch { /* Use the fallback when the URL or its encoding is invalid. */ }

  const match = raw.match(/\.([a-z0-9]{2,8})$/i);
  const extension = outputExtension || match?.[1].toLowerCase() || "bin";
  let base = (match ? raw.slice(0, -match[0].length) : raw)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/^[. ]+|[. ]+$/g, "");

  // Windows reserves these names even when an extension is present.
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `_${base}`;
  base = Array.from(base).slice(0, 180).join("").replace(/[. ]+$/g, "") || fallback;
  return `${base}.${extension}`;
}
