import { createAdminClient } from '@/lib/supabase/admin';

/**
 * The private Supabase Storage bucket for landlords' documents. It has no public access and no
 * policies, so files are only reachable through the short-lived signed links made here, after the
 * API has checked the caller manages the home. Created by migration 0002.
 */
export const DOCUMENTS_BUCKET = 'rentals-documents';

const bucket = () => createAdminClient().storage.from(DOCUMENTS_BUCKET);

/** A one-time upload link for `path`; the browser sends the file straight to Storage with it. */
export async function createUploadUrl(path: string): Promise<{ path: string; token: string }> {
  const { data, error } = await bucket().createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Storage couldn't prepare the upload: ${error?.message ?? 'no data'}`);
  return { path: data.path, token: data.token };
}

/** Whether a file was uploaded at `path`, and its size. */
export async function storedFile(path: string): Promise<{ size: number } | null> {
  const slash = path.lastIndexOf('/');
  const { data, error } = await bucket().list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  const file = !error && data?.find((f) => f.name === path.slice(slash + 1));
  return file ? { size: Number(file.metadata?.size ?? 0) } : null;
}

/** A link that downloads the file for one minute. */
export async function downloadUrl(path: string, fileName: string): Promise<string> {
  const { data, error } = await bucket().createSignedUrl(path, 60, { download: fileName });
  if (error || !data) throw new Error(`Storage couldn't make a download link: ${error?.message ?? 'no data'}`);
  return data.signedUrl;
}

export async function removeFile(path: string): Promise<void> {
  const { error } = await bucket().remove([path]);
  if (error) throw new Error(`Storage couldn't delete the file: ${error.message}`);
}
