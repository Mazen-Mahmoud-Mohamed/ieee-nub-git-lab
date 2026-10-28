export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const MAX_PRESENTATION_BYTES = 25 * 1024 * 1024;
export type LearningDocument = {
  title: string;
  body: string;
  links: Array<{ label: string; url: string }>;
  session_number?: number;
  display_order?: number;
  topics?: string[];
  video_url?: string;
  presentation_id?: string | null;
  related_assessment_id?: string | null;
};
export function driveVideo(value: string): { id: string; preview: string; open: string } | null {
  if (!value.trim()) return null;
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw Error('Use a Google Drive file-sharing link.');
  }
  if (
    u.protocol !== 'https:' ||
    u.hostname !== 'drive.google.com' ||
    u.username ||
    u.password ||
    u.port
  )
    throw Error('Use an HTTPS link on drive.google.com.');
  const match = /^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/(?:view|preview|edit))?\/?$/.exec(
    u.pathname,
  );
  const id =
    match?.[1] || (['/open', '/uc'].includes(u.pathname) ? u.searchParams.get('id') : null);
  if (!id || !/^[A-Za-z0-9_-]{10,200}$/.test(id))
    throw Error('This Drive link does not identify a supported video file.');
  const key = u.searchParams.get('resourcekey');
  if (key && !/^[A-Za-z0-9_-]{1,200}$/.test(key))
    throw Error('This Drive resource key is invalid.');
  const suffix = key ? '?resourcekey=' + encodeURIComponent(key) : '';
  return {
    id,
    preview: `https://drive.google.com/file/d/${id}/preview${suffix}`,
    open: `https://drive.google.com/file/d/${id}/view${suffix}`,
  };
}
// Structural OOXML validation, shared by browser and trusted upload endpoint.
// Does not execute or extract any presentation content.
export function validatePresentation(name: string, type: string, bytes: Uint8Array) {
  if (!/\.pptx$/i.test(name) || ![PPTX_MIME, 'application/octet-stream', ''].includes(type))
    throw Error('Choose a .pptx PowerPoint presentation.');
  if (bytes.length < 22 || bytes.length > MAX_PRESENTATION_BYTES)
    throw Error('Presentation must be a valid PPTX of at most 25 MiB.');
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      v.getUint32(i, true) === 0x06054b50 &&
      i + 22 + v.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  if (end < 0 || v.getUint16(end + 4, true) !== 0 || v.getUint16(end + 6, true) !== 0)
    throw Error('This file is not a supported PPTX archive.');
  const count = v.getUint16(end + 10, true),
    start = v.getUint32(end + 16, true),
    size = v.getUint32(end + 12, true);
  if (!count || count > 10000 || start + size !== end) throw Error('Invalid PowerPoint package.');
  const names = new Set<string>();
  let pos = start,
    expanded = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > end || v.getUint32(pos, true) !== 0x02014b50)
      throw Error('Invalid PowerPoint directory.');
    const flags = v.getUint16(pos + 8, true),
      method = v.getUint16(pos + 10, true),
      nl = v.getUint16(pos + 28, true),
      ex = v.getUint16(pos + 30, true),
      co = v.getUint16(pos + 32, true),
      local = v.getUint32(pos + 42, true),
      compressed = v.getUint32(pos + 20, true),
      uncompressed = v.getUint32(pos + 24, true);
    if (
      pos + 46 + nl + ex + co > end ||
      local + 30 > start ||
      v.getUint32(local, true) !== 0x04034b50 ||
      flags & 1 ||
      ![0, 8].includes(method)
    )
      throw Error('Encrypted or malformed presentations are not supported.');
    const entry = new TextDecoder().decode(bytes.subarray(pos + 46, pos + 46 + nl));
    const localName = new TextDecoder().decode(
      bytes.subarray(local + 30, local + 30 + v.getUint16(local + 26, true)),
    );
    if (
      entry !== localName ||
      local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true) + compressed >
        start ||
      /(^\/|\\|(^|\/)\.\.(\/|$)|vbaProject\.bin$)/i.test(entry) ||
      names.has(entry)
    )
      throw Error('Unsafe or invalid PowerPoint package.');
    names.add(entry);
    expanded += uncompressed;
    pos += 46 + nl + ex + co;
  }
  if (
    pos !== end ||
    expanded > 150 * 1024 * 1024 ||
    !['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml'].every((n) => names.has(n))
  )
    throw Error('This archive is not a supported PowerPoint presentation.');
}
