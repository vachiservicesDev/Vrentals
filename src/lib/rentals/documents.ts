import { z } from 'zod';

export const DOCUMENT_KINDS = [
  { value: 'insurance', label: 'Insurance policy' },
  { value: 'hoa', label: 'HOA' },
  { value: 'tax', label: 'Property tax' },
  { value: 'mortgage', label: 'Mortgage or loan' },
  { value: 'deed', label: 'Deed or closing papers' },
  { value: 'lease', label: 'Signed lease' },
  { value: 'bill', label: 'Bill or invoice' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'warranty', label: 'Warranty or manual' },
  { value: 'inspection', label: 'Inspection or permit' },
  { value: 'other', label: 'Other' },
] as const;

/** PDFs, photos and office files; the Storage bucket enforces the same list. */
export const DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/csv',
] as const;
export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;

const kinds = DOCUMENT_KINDS.map((k) => k.value) as [string, ...string[]];

export const uploadRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.enum(DOCUMENT_TYPES, { errorMap: () => ({ message: 'Upload a PDF, photo, Word, Excel or text file.' }) }),
  size: z.number().int().positive().max(MAX_DOCUMENT_BYTES, 'Files can be up to 25 MB.'),
});

export const documentSchema = uploadRequestSchema.extend({
  path: z.string().min(1).max(500),
  kind: z.enum(kinds, { errorMap: () => ({ message: 'Choose what kind of document this is.' }) }),
  name: z.string().trim().min(1, 'Give it a name, like "2026 homeowners policy".').max(200),
  expiresOn: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a full date.')]).optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** Where a home's file goes in the bucket: under its owner and home, with a random part so names never clash. */
export function documentPath(ownerId: string, propertyId: string, id: string, fileName: string): string {
  const safe = fileName.normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(-100) || 'file';
  return `${ownerId}/${propertyId}/${id}-${safe}`;
}
