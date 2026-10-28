import { requireBackend } from '../../services/supabase';
import { MAX_PRESENTATION_BYTES, PPTX_MIME, validatePresentation } from './materials';
export async function uploadPresentation(
  itemId: string,
  file: File,
  onProgress: (n: number) => void,
): Promise<string> {
  if (file.size > MAX_PRESENTATION_BYTES) throw Error('Presentation must be at most 25 MiB.');
  const contents = await file.arrayBuffer();
  validatePresentation(file.name, file.type, new Uint8Array(contents));
  const client = requireBackend();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) throw Error('Sign in again before uploading.');
  const body = new FormData();
  body.append('itemId', itemId);
  // Copy validated bytes: WebKit can otherwise send an empty file after input changes.
  body.append('file', new Blob([contents], { type: PPTX_MIME }), file.name);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', import.meta.env.VITE_SUPABASE_URL + '/functions/v1/learning-material');
    xhr.setRequestHeader('Authorization', 'Bearer ' + session.access_token);
    xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
    xhr.timeout = 120000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onerror = () =>
      reject(
        Error(
          'Upload connection failed. The session draft was not replaced. Retry after checking connectivity.',
        ),
      );
    xhr.ontimeout = () =>
      reject(
        Error('Upload timed out. Refresh the session to check its saved material before retrying.'),
      );
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText);
        if (xhr.status < 200 || xhr.status >= 300 || !result.id)
          throw Error(result.error || 'Upload was not accepted.');
        onProgress(100);
        resolve(result.id);
      } catch (e) {
        reject(e);
      }
    };
    xhr.send(body);
  });
}
export async function presentationURL(item: string, download = false, materialId?: string) {
  const c = requireBackend();
  const { data, error } = materialId
    ? await c.from('learning_materials').select('path,name').eq('id', materialId).single()
    : await c.rpc('learning_presentation', { p_item: item });
  if (error) throw error;
  if (!data) throw Error('No presentation is currently available.');
  const signed = await c.storage
    .from('learning-presentations')
    .createSignedUrl(data.path, 120, download ? { download: data.name } : undefined);
  if (signed.error) throw signed.error;
  return signed.data.signedUrl;
}
