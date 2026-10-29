import type { SignedUpload } from './types';

/**
 * The browser's half of an upload: a PUT of the bytes to a URL our server
 * issued (lib/storage, `signedUploadUrl`), after it checked who may write
 * there. No client library and no bucket credentials here, so whichever
 * backend issued the URL, this does not change.
 *
 * Never throws for a refusal: it comes back as `{ message, statusCode }`, the
 * shape the composers' error wording reads (`uploadFailure`). A dropped
 * connection still throws, as `fetch` does.
 */
export async function putSigned(
  upload: SignedUpload,
  body: Blob,
): Promise<{ message: string; statusCode: number } | null> {
  const response = await fetch(upload.url, { method: 'PUT', headers: upload.headers, body });
  if (response.ok) return null;
  let message = response.statusText;
  try {
    const said = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof said.message === 'string') message = said.message;
    else if (typeof said.error === 'string') message = said.error;
  } catch {
    // A body that is not JSON: the status text stands.
  }
  return { message, statusCode: response.status };
}
