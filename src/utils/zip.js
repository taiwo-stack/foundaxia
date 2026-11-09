// Minimal zip reader for .xlsx / .pptx files, using the browser's DecompressionStream.

export async function unzip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This file is not a valid Office (.xlsx / .pptx) file.');
  const entries = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const files = {};
  for (let n = 0; n < entries; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOff = dv.getUint32(p + 42, true);
    const fname = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    files[fname] = { method, compSize, localOff };
    p += 46 + nameLen + extraLen + commentLen;
  }
  const read = async (fname) => {
    const f = files[fname];
    if (!f) return null;
    const lo = f.localOff;
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    const data = bytes.subarray(start, start + f.compSize);
    if (f.method === 0) return dec.decode(data);
    if (f.method !== 8) throw new Error('Unsupported compression in this file.');
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot read this file type here. Please update your browser, or save the sheet as CSV.');
    }
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return await new Response(stream).text();
  };
  return { files, read };
}
