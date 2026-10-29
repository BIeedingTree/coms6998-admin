import 'server-only';
import { requireAdmin } from '@/lib/auth';
import { searchOptions, type SearchParams } from '@/lib/data';
import { adminError } from '@/lib/admin-resources';
export const IMAGE_FIELDS = 'id,title,alt_text,storage_path,mime_type,size_bytes,created_at';
export type AdminImage = { id: string; title: string; alt_text: string | null; storage_path: string; mime_type: string; size_bytes: number; created_at: string; url: string };
export const managedPath = (path: string) => /^admin-images\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/.test(path);
export async function listImages(params: SearchParams) {
  const { db } = await requireAdmin();
  const options = searchOptions(params);
  let query = db.from('admin_images').select(IMAGE_FIELDS, { count: 'exact' }).order('created_at', { ascending: false }).order('id');
  if (options.q) query = query.or(`title.ilike.%${options.q}%,alt_text.ilike.%${options.q}%`);
  const { data, error, count } = await query.range(options.from, options.to);
  const rows = (data ?? []).map(row => ({ ...row, url: db.storage.from('avatars').getPublicUrl(row.storage_path).data.publicUrl })) as AdminImage[];
  return { rows, error: error ? adminError(error) : undefined, count: count ?? 0, ...options };
}
// Validate signatures as well as browser-supplied MIME type; reject SVG/HTML.
export function imageExtension(bytes: Uint8Array, mime: string): string | null {
  const starts = (...values: number[]) => values.every((v, i) => bytes[i] === v);
  if (mime === 'image/png' && starts(137,80,78,71,13,10,26,10)) return 'png';
  if (mime === 'image/jpeg' && starts(255,216,255)) return 'jpg';
  if (mime === 'image/gif' && starts(71,73,70,56) && [55,57].includes(bytes[4]) && bytes[5] === 97) return 'gif';
  if (mime === 'image/webp' && starts(82,73,70,70) && [87,69,66,80].every((v,i) => bytes[i+8] === v)) return 'webp';
  return null;
}
export function imageMetadata(form: FormData) {
  const title = form.get('title'), alt = form.get('alt_text');
  if (typeof title !== 'string' || !title.trim() || title.trim().length > 200 || (alt !== null && typeof alt !== 'string') || (typeof alt === 'string' && alt.trim().length > 1000)) return null;
  return { title: title.trim(), alt_text: typeof alt === 'string' && alt.trim() ? alt.trim() : null };
}
