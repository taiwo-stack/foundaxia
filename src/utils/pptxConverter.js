import JSZip from 'jszip';

// Converts an uploaded .pptx into a standalone HTML slide deck, entirely client-side:
// a .pptx is just a ZIP of XML files (the Office Open XML format), so this unzips it with
// JSZip and reads the XML with the browser's own DOMParser - no server, no AI, no account,
// no cost. It extracts each slide's title, body text, and images, and lays that content into
// a FoundaXia-branded template with the same `go(n)` navigation pattern the rest of this
// app's hand-built slide decks use, so converted decks are automatically compatible with the
// whiteboard's realtime slide-nav sync. It does NOT attempt to clone the original PowerPoint's
// exact visual layout (custom shape positions, charts, animations, fonts) - only the content
// survives, re-flowed into the platform's own consistent look.

const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships'
};

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']);
const MAX_OUTPUT_BYTES = 15 * 1024 * 1024; // matches the html_slide upload cap in TutorDashboard/AdminDashboard
const MAX_IMAGE_DIMENSION = 900; // px - a slide image never renders taller than 340px, this covers retina displays with room to spare
const JPEG_QUALITY = 0.72;

// PowerPoint frequently embeds full camera-resolution photos (several MB each) even though
// they're displayed small on a slide - re-embedding those as-is made converted/saved decks
// slow to fetch and render. This decodes the image onto an offscreen canvas, downsizes it if
// it's bigger than a slide will ever need, and re-encodes it - usually a 10-20x size drop for
// real photos. PNG/GIF sources stay PNG (keeps transparency for logos/diagrams); everything
// else re-encodes as JPEG for much better compression. Falls back to the original data URL
// untouched if decoding ever fails, rather than losing the image.
export const compressImageDataUrl = (dataUrl, preferPng = false) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => {
    let { width, height } = img;
    if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(preferPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', JPEG_QUALITY));
    } catch (_) {
      resolve(dataUrl);
    }
  };
  img.onerror = () => resolve(dataUrl);
  img.src = dataUrl;
});

const parseXml = (text) => new DOMParser().parseFromString(text, 'application/xml');

const resolveRelPath = (basePath, target) => {
  if (target.startsWith('/')) return target.slice(1);
  const stack = basePath.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '..') stack.pop();
    else if (part !== '.') stack.push(part);
  }
  return stack.join('/');
};

const getSlideOrder = async (zip) => {
  const fallback = () => Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => parseInt(a.match(/slide(\d+)\.xml/)[1], 10) - parseInt(b.match(/slide(\d+)\.xml/)[1], 10));

  try {
    const presFile = zip.file('ppt/presentation.xml');
    const relsFile = zip.file('ppt/_rels/presentation.xml.rels');
    if (!presFile || !relsFile) return fallback();

    const presDoc = parseXml(await presFile.async('text'));
    const relsDoc = parseXml(await relsFile.async('text'));

    const relMap = {};
    Array.from(relsDoc.getElementsByTagName('Relationship')).forEach((rel) => {
      relMap[rel.getAttribute('Id')] = rel.getAttribute('Target');
    });

    const order = Array.from(presDoc.getElementsByTagNameNS(NS.p, 'sldId'))
      .map((node) => {
        const rId = node.getAttributeNS(NS.r, 'id');
        const target = relMap[rId];
        return target ? resolveRelPath('ppt/presentation.xml', target) : null;
      })
      .filter(Boolean);

    return order.length > 0 ? order : fallback();
  } catch (_) {
    return fallback();
  }
};

const extractSlideContent = (slideDoc) => {
  let title = '';
  const bullets = [];

  Array.from(slideDoc.getElementsByTagNameNS(NS.p, 'sp')).forEach((sp) => {
    const ph = sp.getElementsByTagNameNS(NS.p, 'ph')[0];
    const phType = ph ? ph.getAttribute('type') : null;
    const txBody = sp.getElementsByTagNameNS(NS.p, 'txBody')[0];
    if (!txBody) return;

    const paragraphTexts = Array.from(txBody.getElementsByTagNameNS(NS.a, 'p'))
      .map((para) => Array.from(para.getElementsByTagNameNS(NS.a, 't')).map((t) => t.textContent).join(''))
      .map((t) => t.trim())
      .filter(Boolean);

    if (phType === 'title' || phType === 'ctrTitle') {
      title = title || paragraphTexts.join(' ');
    } else {
      bullets.push(...paragraphTexts);
    }
  });

  // No recognized title placeholder (custom-built title text box, etc.) - fall back to
  // treating the first line of body text as the title instead of losing it entirely.
  if (!title && bullets.length > 0) {
    title = bullets.shift();
  }

  return { title, bullets };
};

const extractSlideImages = async (zip, slidePath) => {
  const slideFileName = slidePath.split('/').pop();
  const relsFile = zip.file(`ppt/slides/_rels/${slideFileName}.rels`);
  if (!relsFile) return [];

  const relsDoc = parseXml(await relsFile.async('text'));
  const imageRels = Array.from(relsDoc.getElementsByTagName('Relationship'))
    .filter((rel) => (rel.getAttribute('Type') || '').toLowerCase().includes('/image'));

  const images = [];
  for (const rel of imageRels) {
    const target = rel.getAttribute('Target');
    const path = resolveRelPath(slidePath, target);
    const ext = path.split('.').pop().toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) continue; // skip vector formats (emf/wmf) browsers can't render directly

    const imgFile = zip.file(path);
    if (!imgFile) continue;
    const base64 = await imgFile.async('base64');
    const mime = ext === 'jpg' ? 'jpeg' : ext;
    const rawDataUrl = `data:image/${mime};base64,${base64}`;
    images.push(await compressImageDataUrl(rawDataUrl, ext === 'png' || ext === 'gif'));
  }
  return images;
};

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const convertPptxToSlideHtml = async (file, deckTitle) => {
  const zip = await JSZip.loadAsync(file);
  const slidePaths = await getSlideOrder(zip);
  if (slidePaths.length === 0) {
    throw new Error('No slides found in this file - is it a valid .pptx?');
  }

  const slides = [];
  for (const slidePath of slidePaths) {
    const slideFile = zip.file(slidePath);
    if (!slideFile) continue;
    const slideDoc = parseXml(await slideFile.async('text'));
    const { title, bullets } = extractSlideContent(slideDoc);
    const images = await extractSlideImages(zip, slidePath);
    if (!title && bullets.length === 0 && images.length === 0) continue; // skip genuinely blank slides
    slides.push({ title, bullets, images });
  }

  if (slides.length === 0) {
    throw new Error('Could not find any readable text or images in this file.');
  }

  return buildSlideDeckHtml(deckTitle, slides);
};

// Shared by the PPTX converter above and the manual slide-deck editor page: takes raw
// (unescaped) { title, bullets, images } slide objects and produces the final standalone
// HTML file - same FoundaXia-branded template, same `go(n)` navigation, for both.
export const buildSlideDeckHtml = (deckTitle, slides) => {
  const escapedSlides = slides.map((s) => ({
    title: escapeHtml(s.title || ''),
    bullets: (s.bullets || []).map(escapeHtml),
    images: s.images || []
  }));

  // Guards against a literal "</script>" in extracted/typed text (or an embedded image's
  // base64 data, vanishingly unlikely but free to guard) from prematurely closing the tag.
  const slidesJson = JSON.stringify(escapedSlides).replace(/<\/script/gi, '<\\/script');

  const html = buildTemplateHtml(escapeHtml(deckTitle || 'Lesson Slides'), slidesJson);

  const sizeBytes = new Blob([html]).size;
  if (sizeBytes > MAX_OUTPUT_BYTES) {
    throw new Error(
      `Slide deck is ${(sizeBytes / (1024 * 1024)).toFixed(1)}MB, over the ${(MAX_OUTPUT_BYTES / (1024 * 1024)).toFixed(0)}MB limit - ` +
      'try compressing or removing some images.'
    );
  }

  return html;
};

const buildTemplateHtml = (deckTitle, slidesJson) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${deckTitle}</title>
<style>
  :root{--navy:#002050;--navy2:#0A3170;--slate:#8994AB;--orange:#FE6B0F;--paper:#F1F4F9;--line:#D7DEEA;--card:#fff;--ink:#002050;--ink-soft:#5D6B85}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%}
  body{background:var(--paper);font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:var(--ink);display:flex;flex-direction:column;min-height:100vh}
  .wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto}
  .slide{width:100%;max-width:880px;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:44px 48px;display:flex;flex-direction:column;gap:18px;box-shadow:0 20px 50px rgba(0,32,80,.08)}
  .badge{display:inline-block;background:var(--orange);color:#fff;font-weight:700;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase;padding:6px 14px;border-radius:999px;align-self:flex-start}
  h1{font-size:1.9rem;margin:0;color:var(--navy);line-height:1.25}
  ul{margin:0;padding-left:1.3em;display:flex;flex-direction:column;gap:10px;font-size:1.08rem;line-height:1.55;color:var(--ink-soft)}
  .slide-img{max-width:100%;max-height:340px;border-radius:10px;object-fit:contain;align-self:center}
  .bar{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;background:#fff;border-top:1px solid var(--line)}
  .btn{background:var(--navy);color:#fff;border:none;border-radius:8px;padding:10px 22px;font-weight:700;cursor:pointer;font-size:.92rem}
  .btn:disabled{opacity:.35;cursor:not-allowed}
  .progress{font-size:.85rem;color:var(--ink-soft);font-weight:600}
</style>
</head>
<body>
<div class="wrap"><section class="slide" id="slide" tabindex="-1"></section></div>
<div class="bar">
  <button class="btn" id="prev">Prev</button>
  <span class="progress" id="progress"></span>
  <button class="btn" id="next">Next</button>
</div>
<script>
var SL = ${slidesJson};
var i = 0;
var el = document.getElementById('slide');
function render(){
  var s = SL[i];
  var html = '<span class="badge">Slide ' + (i + 1) + '</span>';
  if (s.title) html += '<h1>' + s.title + '</h1>';
  if (s.images && s.images.length) html += '<img class="slide-img" src="' + s.images[0] + '" alt="">';
  if (s.bullets && s.bullets.length) {
    html += '<ul>' + s.bullets.map(function (b) { return '<li>' + b + '</li>'; }).join('') + '</ul>';
  }
  el.innerHTML = html;
  document.getElementById('progress').textContent = (i + 1) + ' / ' + SL.length;
  document.getElementById('prev').disabled = (i === 0);
  document.getElementById('next').disabled = (i === SL.length - 1);
}
function go(n){ i = Math.max(0, Math.min(SL.length - 1, n)); render(); }
document.getElementById('prev').onclick = function () { go(i - 1); };
document.getElementById('next').onclick = function () { go(i + 1); };
render();
</script>
</body>
</html>
`;
