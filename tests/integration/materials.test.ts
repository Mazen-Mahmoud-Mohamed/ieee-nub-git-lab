import { describe, it, expect, vi } from 'vitest';
import {
  driveVideo,
  validatePresentation,
  PPTX_MIME,
  MAX_PRESENTATION_BYTES,
} from '../../src/features/learning/materials';
import {
  handleMaterial,
  type UploadServices,
} from '../../supabase/functions/learning-material/handler';
import { pptxBytes } from '../helpers/presentation';
const origin = 'https://example.test';
const item = '70000000-0000-4000-8000-000000000011';
function services(): UploadServices {
  return {
    authorize: vi.fn(async () => item),
    upload: vi.fn(async () => {}),
    register: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
}
function request(file = new File([pptxBytes()], 'Session 1.pptx', { type: PPTX_MIME })) {
  const body = new FormData();
  body.append('itemId', item);
  body.append('file', file);
  return new Request(origin, {
    method: 'POST',
    headers: { Origin: origin, Authorization: 'Bearer synthetic' },
    body,
  });
}
describe('learning materials validation and trusted upload handler', () => {
  it('accepts common Drive sharing links and canonicalizes without credentials', () => {
    for (const url of [
      'https://drive.google.com/file/d/abcdefghij123/view?usp=sharing',
      'https://drive.google.com/open?id=abcdefghij123',
      'https://drive.google.com/uc?export=download&id=abcdefghij123',
    ])
      expect(driveVideo(url)?.preview).toBe(
        'https://drive.google.com/file/d/abcdefghij123/preview',
      );
    for (const url of [
      'javascript:alert(1)',
      'https://drive.google.com.evil.test/file/d/abcdefghij123/view',
      'https://evil@drive.google.com/file/d/abcdefghij123/view',
      'http://drive.google.com/open?id=abcdefghij123',
      'https://drive.google.com/drive/folders/abcdefghij123',
    ])
      expect(() => driveVideo(url)).toThrow();
    expect(
      driveVideo('https://drive.google.com/open?id=abcdefghij123&resourcekey=0-Safe_Key')?.preview,
    ).toBe('https://drive.google.com/file/d/abcdefghij123/preview?resourcekey=0-Safe_Key');
    expect(() =>
      driveVideo('https://drive.google.com/open?id=abcdefghij123&resourcekey=bad%20key'),
    ).toThrow();
    expect(driveVideo('')).toBeNull();
  });
  it('validates OOXML structure, extension, mime, size and rejects corrupt files', () => {
    expect(() => validatePresentation('Slides.PPTX', PPTX_MIME, pptxBytes())).not.toThrow();
    for (const [name, type, bytes] of [
      ['bad.ppt', PPTX_MIME, pptxBytes()],
      ['bad.pptx', 'text/html', pptxBytes()],
      ['bad.pptx', PPTX_MIME, new TextEncoder().encode('not a zip file, just fake text')],
      ['huge.pptx', PPTX_MIME, new Uint8Array(MAX_PRESENTATION_BYTES + 1)],
    ] as const)
      expect(() => validatePresentation(name, type, bytes)).toThrow();
    const broken = pptxBytes();
    broken[0] = 0;
    expect(() => validatePresentation('bad.pptx', PPTX_MIME, broken)).toThrow();
  });
  it('rejects missing or wrong authorization and foreign origins before storing bytes', async () => {
    const s = services();
    s.authorize = vi.fn(async () => null);
    expect((await handleMaterial(request(), origin, s)).status).toBe(403);
    expect(s.upload).not.toHaveBeenCalled();
    expect((await handleMaterial(new Request(origin, { method: 'POST' }), origin, s)).status).toBe(
      401,
    );
    expect((await handleMaterial(request(), 'https://other.test', s)).status).toBe(403);
  });
  it('stores validated files at unique non-overwriting paths then registers metadata', async () => {
    const s = services();
    const first = await handleMaterial(request(), origin, s),
      second = await handleMaterial(request(), origin, s);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const a = await first.json(),
      b = await second.json();
    expect(a.id).not.toBe(b.id);
    expect(s.upload).toHaveBeenCalledWith(item + '/' + a.id + '.pptx', pptxBytes());
    expect(s.register).toHaveBeenCalledWith(item, a.id, item, 'Session 1.pptx', pptxBytes().length);
  });
  it('does not register rejected files and cleans up only its own failed upload', async () => {
    const s = services();
    expect(
      (
        await handleMaterial(
          request(new File(['fake'], 'bad.pptx', { type: PPTX_MIME })),
          origin,
          s,
        )
      ).status,
    ).toBe(400);
    expect(s.upload).not.toHaveBeenCalled();
    s.register = vi.fn(async () => {
      throw Error('stale');
    });
    expect((await handleMaterial(request(), origin, s)).status).toBe(409);
    expect(s.remove).toHaveBeenCalledTimes(1);
    const failed = services();
    failed.upload = vi.fn(async () => {
      throw Error('storage');
    });
    expect((await handleMaterial(request(), origin, failed)).status).toBe(400);
    expect(failed.register).not.toHaveBeenCalled();
  });
});
