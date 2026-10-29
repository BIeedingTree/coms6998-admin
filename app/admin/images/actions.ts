'use server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/auth';
import { adminError, isUuid } from '@/lib/admin-resources';
import { imageExtension, imageMetadata, managedPath } from '@/lib/admin-images';
import type { ActionState } from '@/lib/media';
import { revalidatePath } from 'next/cache';
export async function uploadImage(_state: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const metadata = imageMetadata(form), file = form.get('file');
  if (!metadata) return { error: 'Enter a title of 1–200 characters and alt text up to 1,000 characters.' };
  if (!(file instanceof File) || file.size < 1 || file.size > 4 * 1024 * 1024) return { error: 'Choose a JPG, PNG, WebP, or GIF image up to 4 MB.' };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = imageExtension(bytes, file.type);
  if (!extension) return { error: 'The file content does not match a supported image format.' };
  // Fail before uploading if the metadata table is not installed.
  const check = await db.from('admin_images').select('id').limit(1);
  if (check.error) return { error: adminError(check.error) };
  const id = randomUUID(), storage_path = `admin-images/${id}.${extension}`;
  try {
    await requireAdmin();
    const { error: uploadError } = await db.storage.from('avatars').upload(storage_path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) return { error: 'Upload failed. Check the existing avatars bucket settings.' };
    const { error } = await db.from('admin_images').insert({ id, ...metadata, storage_path, mime_type: file.type, size_bytes: file.size }).select('id').single();
    if (error) {
      const cleanup = await db.storage.from('avatars').remove([storage_path]);
      return { error: `${adminError(error)}${cleanup.error ? ` Uploaded object ${storage_path} needs manual cleanup; no profile uses this newly generated path.` : ' Uploaded file was removed.'}` };
    }
    revalidatePath('/admin/images');
    return { message: 'Image uploaded and saved.', id };
  } catch { return { error: `Could not confirm the upload. Refresh Images before retrying. If no record appears, inspect storage path ${storage_path} for cleanup.` }; }
}
export async function updateImage(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const values = imageMetadata(form);
  if (!isUuid(id) || !values) return { error: 'Enter a valid title (1–200 characters) and alt text (up to 1,000 characters).' };
  try {
    const { data, error } = await db.from('admin_images').update(values).eq('id', id).select('id').maybeSingle();
    if (error) return { error: adminError(error) };
    if (!data) return { error: 'Image record not found.' };
    revalidatePath('/admin/images');
    return { message: 'Image metadata saved.', id };
  } catch { return { error: 'Could not confirm saving. Refresh before retrying.' }; }
}
export async function deleteImage(id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  if (!isUuid(id) || form.get('confirmation') !== id) return { error: 'Enter the exact image ID to confirm deletion.' };
  try {
    const { data: row, error } = await db.from('admin_images').select('id,storage_path').eq('id', id).maybeSingle();
    if (error) return { error: adminError(error) };
    if (!row || !managedPath(row.storage_path)) return { error: 'Managed image not found. Profile avatar paths cannot be deleted here.' };
    const url = db.storage.from('avatars').getPublicUrl(row.storage_path).data.publicUrl;
    // Check all profile links, including transformed/signed URLs and URL parameters.
    // Match the immutable path as well as exact public URL; do not trust client URLs.
    const linked = await db.from('profiles').select('id', { count: 'exact', head: true }).or(`avatar_url.eq.${url},avatar_url.ilike.%${row.storage_path}%`);
    if (linked.error) return { error: 'Could not verify profile references. Nothing was deleted.' };
    if (linked.count) return { error: 'This image is referenced by a profile and cannot be deleted.' };
    await requireAdmin();
    const removed = await db.storage.from('avatars').remove([row.storage_path]);
    if (removed.error) return { error: 'Storage deletion failed. The metadata was retained; retry later.' };
    const deleted = await db.from('admin_images').delete().eq('id', id).select('id').maybeSingle();
    if (deleted.error) return { error: 'The file was removed but metadata cleanup failed. Retry deletion to finish cleanup.' };
    revalidatePath('/admin/images');
    return { message: 'Image deleted.', id };
  } catch { return { error: 'Could not confirm deletion. Refresh before retrying.' }; }
}
