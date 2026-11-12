// Build a PDF from JPEG images, one image per page, with no external library.
// pages: [{ dataUrl: 'data:image/jpeg;base64,...', width, height }]  (width/height in pixels)
// Returns a Blob (application/pdf).

const MAX_SIDE_PT = 1190; // keep pages around A3 at most; viewers zoom anyway

const base64ToBytes = (b64) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

export function imagesToPdf(pages, { title = 'FoundaXia whiteboard' } = {}) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const startObj = (n) => { offsets[n] = length; push(`${n} 0 obj\n`); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-\u00ff]/g, 'x'));

  // Object numbers: 1 catalog, 2 page tree, 3 info, then 3 objects per page.
  const pageObjNums = pages.map((_, i) => 4 + i * 3);

  startObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pageObjNums.map(n => `${n} 0 R`).join(' ')}] >>\nendobj\n`);
  startObj(3);
  const safeTitle = String(title).replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '');
  push(`<< /Title (${safeTitle}) /Producer (FoundaXia) >>\nendobj\n`);

  pages.forEach((p, i) => {
    const pageNum = pageObjNums[i], contentNum = pageNum + 1, imgNum = pageNum + 2;
    const jpeg = base64ToBytes(p.dataUrl.split(',')[1]);
    let w = p.width * 0.75, h = p.height * 0.75; // CSS px -> PDF points
    const scale = Math.min(1, MAX_SIDE_PT / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale * 100) / 100);
    h = Math.max(1, Math.round(h * scale * 100) / 100);

    startObj(pageNum);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im${i} ${imgNum} 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`);

    const content = `q ${w} 0 0 ${h} 0 0 cm /Im${i} Do Q`;
    startObj(contentNum);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

    startObj(imgNum);
    push(`<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg);
    push('\nendstream\nendobj\n');
  });

  const xrefStart = length;
  const count = 4 + pages.length * 3;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let n = 1; n < count; n++) xref += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);

  return new Blob(chunks, { type: 'application/pdf' });
}
