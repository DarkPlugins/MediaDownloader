/** Recognize MP4 brands, rather than trusting a URL extension or MIME header. */
export async function isMp4(blob) {
  const bytes = new Uint8Array(await blob.slice(0, 4096).arrayBuffer());
  const text = offset => String.fromCharCode(...bytes.slice(offset, offset + 4));
  const view = new DataView(bytes.buffer);
  for (let offset = 0; offset + 16 <= bytes.length;) {
    const size = view.getUint32(offset);
    if (size < 8) return false;
    if (text(offset + 4) === "ftyp") {
      const brands = [text(offset + 8)];
      for (let i = offset + 16; i + 4 <= Math.min(offset + size, bytes.length); i += 4) brands.push(text(i));
      return brands.some(brand => /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |dash)$/.test(brand));
    }
    offset += size;
  }
  return false;
}

export async function toMp4(blob, setStatus) {
  if (await isMp4(blob)) return blob;
  const mime = ["video/mp4;codecs=avc1.42001E,mp4a.40.2", "video/mp4"]
    .find(type => globalThis.MediaRecorder?.isTypeSupported(type));
  if (!mime) throw new Error("This browser cannot encode MP4. Select Original in the popup to download this video.");

  const video = document.createElement("video");
  const url = URL.createObjectURL(blob);
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  let stream;
  let recorder;
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error("Video loading timed out. Try Original format.")), 30_000);
      function finish(error) {
        clearTimeout(timeout);
        video.onloadeddata = null;
        video.onerror = null;
        error ? reject(error) : resolve();
      }
      video.onloadeddata = () => finish();
      video.onerror = () => finish(new Error("This video cannot be decoded. Select Original in the popup."));
      video.src = url;
    });
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) {
      throw new Error("This source is not a finite, playable video. Try Original format.");
    }
    if (!video.captureStream) throw new Error("Video conversion is unavailable. Select Original in the popup.");
    stream = video.captureStream();
    if (!stream.getVideoTracks().length) throw new Error("Could not capture the video. Select Original in the popup.");
    recorder = new MediaRecorder(stream, { mimeType: mime });
    setStatus("Converting to MP4… This can take as long as the video.", 10);
    const result = await new Promise((resolve, reject) => {
      const chunks = [];
      let failure;
      // Abort a stalled decoder, but allow long videos to continue making progress.
      let lastProgress = Date.now();
      let lastTime = 0;
      const watchdog = setInterval(() => {
        if (Date.now() - lastProgress > 60_000) fail(new Error("Video conversion stalled. Try Original format."));
      }, 10_000);
      function fail(error) {
        failure = error;
        clearInterval(watchdog);
        if (recorder.state !== "inactive") recorder.stop();
        reject(error);
      }
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onerror = () => fail(new Error("MP4 encoding failed. Try Original format."));
      recorder.onstop = () => {
        clearInterval(watchdog);
        if (failure) return;
        if (!video.ended) { reject(new Error("Video conversion ended early. Try Original format.")); return; }
        const output = new Blob(chunks, { type: "video/mp4" });
        output.size ? resolve(output) : reject(new Error("The converted video is empty."));
      };
      video.ontimeupdate = () => {
        if (video.currentTime > lastTime) lastProgress = Date.now();
        lastTime = video.currentTime;
        setStatus("Converting to MP4…", Math.min(90, 10 + video.currentTime / video.duration * 80));
      };
      video.onerror = () => fail(new Error("Video decoding failed. Try Original format."));
      video.onended = () => { if (recorder.state !== "inactive") recorder.stop(); };
      try {
        recorder.start(1000);
        video.play().catch(() => fail(new Error("Video playback was blocked. Select Original in the popup.")));
      } catch (error) { fail(error); }
    });
    if (!await isMp4(result)) throw new Error("The browser did not produce valid MP4 output. Try Original format.");
    return result;
  } finally {
    video.onended = video.onerror = video.ontimeupdate = null;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    video.pause();
    stream?.getTracks().forEach(track => track.stop());
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
