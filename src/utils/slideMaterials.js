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
