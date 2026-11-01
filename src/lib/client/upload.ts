'use client';

import { api } from '@/lib/client/api';
import { createClient } from '@/lib/supabase/client';
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES } from '@/lib/rentals/documents';

const EXT_TYPES: Record<string, string> = { heic: 'image/heic', pdf: 'application/pdf', csv: 'text/csv', txt: 'text/plain', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

/** The file's type, or a plain-words reason it can't be uploaded. */
export function checkFile(file: File): { contentType: string } | { problem: string } {
  const contentType = file.type || EXT_TYPES[file.name.split('.').pop()?.toLowerCase() ?? ''] || '';
  if (!(DOCUMENT_TYPES as readonly string[]).includes(contentType)) return { problem: 'Upload a PDF, photo, Word, Excel or text file.' };
  if (file.size > MAX_DOCUMENT_BYTES) return { problem: 'Files can be up to 25 MB.' };
  return { contentType };
}

/**
 * Saves a file to a home's private documents: asks for a one-time upload link, sends the file
 * straight to Storage, then records it. Returns an error message, or null when it worked.
 */
export async function uploadHomeDocument(
  propertyId: string,
  file: File,
  details: { kind: string; name?: string; notes?: string; transactionId?: string },
): Promise<string | null> {
  const checked = checkFile(file);
  if ('problem' in checked) return checked.problem;
  const meta = { fileName: file.name, contentType: checked.contentType, size: file.size };
  const ticket = await api<{ path: string; token: string }>(`/api/properties/${propertyId}/documents/upload`, { body: meta });
  if (!ticket.ok || !ticket.data) return ticket.message;
  const { path, token } = ticket.data;
  const sent = await createClient().storage.from('rentals-documents').uploadToSignedUrl(path, token, file, { contentType: checked.contentType });
  if (sent.error) return `The upload didn't finish: ${sent.error.message}`;
  const saved = await api(`/api/properties/${propertyId}/documents`, {
    body: { ...meta, path, kind: details.kind, name: details.name?.trim() || file.name.replace(/\.[^.]+$/, ''), notes: details.notes ?? '', transactionId: details.transactionId },
  });
  return saved.ok ? null : saved.message;
}
