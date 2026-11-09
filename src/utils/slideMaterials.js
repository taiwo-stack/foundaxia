// PowerPoint files are kept exactly as uploaded and shown through Microsoft's free
// Office Online viewer, so they look the same as in PowerPoint (layout, fonts, charts,
// animations and transitions). HTML slides render in our own sandboxed frame.

const POWERPOINT_EXT = /\.(pptx|ppt|ppsx|pps)$/i;

// Microsoft's viewer refuses PowerPoint files over 10 MB.
export const POWERPOINT_MAX_BYTES = 10 * 1024 * 1024;

export const isPowerPointName = (name) => typeof name === 'string' && POWERPOINT_EXT.test(name);

export const isPowerPointUrl = (url) => {
  if (typeof url !== 'string') return false;
  try {
    return POWERPOINT_EXT.test(new URL(url, window.location.href).pathname);
  } catch {
    return false;
  }
};

// Anything that opens in the slide viewer (and can be attached to a whiteboard page).
export const isSlideMaterial = (m) =>
  !!m && (m.file_type === 'html_slide' || m.file_type === 'powerpoint' || isPowerPointUrl(m.file_url));

export const isPowerPointMaterial = (m) =>
  !!m && (m.file_type === 'powerpoint' || isPowerPointUrl(m.file_url));

export const officeViewerUrl = (fileUrl) =>
  `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;

// Slide shape (width / height) of a PowerPoint, read from ppt/presentation.xml so the
// viewer can be sized to fit the whole slide. Falls back to 16:9 (or 4:3 for old .ppt).
const aspectCache = new Map();
const DEFAULT_ASPECT = 16 / 9;

export const cachedPowerPointAspect = (url) => aspectCache.get(url) || (/\.(ppt|pps)(\?|#|$)/i.test(String(url)) ? 4 / 3 : DEFAULT_ASPECT);

export const getPowerPointAspect = async (url) => {
  if (aspectCache.has(url)) return aspectCache.get(url);
  let aspect = cachedPowerPointAspect(url);
  try {
    if (/\.(pptx|ppsx|pptm)(\?|#|$)/i.test(new URL(url, window.location.href).pathname)) {
      const res = await fetch(url);
      if (res.ok) {
        const { unzip } = await import('./zip.js');
        const zip = await unzip(new Uint8Array(await res.arrayBuffer()));
        const xml = await zip.read('ppt/presentation.xml');
        const m = xml && xml.match(/<p:sldSz\b[^>]*?\bcx="(\d+)"[^>]*?\bcy="(\d+)"/);
        if (m && +m[1] > 0 && +m[2] > 0) aspect = +m[1] / +m[2];
      }
    }
  } catch { /* keep the default shape */ }
  aspectCache.set(url, aspect);
  return aspect;
};
