'use client';
import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { uploadImage, updateImage, deleteImage } from '@/app/admin/images/actions';
import type { ActionState } from '@/lib/media';
import type { AdminImage } from '@/lib/admin-images';
export function ImageForm({ image }: { image?: AdminImage }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(image ? updateImage.bind(null, image.id) : uploadImage, {} as ActionState);
  useEffect(() => { if (state.message) router.refresh(); }, [state, router]);
  const suffix = image?.id ?? 'new';
  return <form action={action} aria-busy={pending}><fieldset disabled={pending}>
    <div className="field"><label htmlFor={`title-${suffix}`}>Title</label><input id={`title-${suffix}`} name="title" required maxLength={200} defaultValue={image?.title}/></div>
    <div className="field"><label htmlFor={`alt-${suffix}`}>Alt text (optional)</label><textarea id={`alt-${suffix}`} name="alt_text" maxLength={1000} defaultValue={image?.alt_text ?? ''} rows={2}/></div>
    {!image && <div className="field"><label htmlFor="file">Image file · JPG, PNG, WebP, GIF · up to 4 MB</label><input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required/></div>}
    <button className="button primary">{pending ? 'Saving…' : image ? 'Save metadata' : 'Upload image'}</button>
  </fieldset>{state.error && <p role="alert" className="notice error">{state.error}</p>}{state.message && <p role="status" className="notice success">{state.message}</p>}</form>;
}
export function ImageDelete({ id }: { id: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteImage.bind(null, id), {} as ActionState);
  useEffect(() => { if (state.message) router.refresh(); }, [state, router]);
  return <details className="danger-panel"><summary>Delete image</summary><p>This cannot be undone. Images referenced by profiles cannot be deleted.</p><p className="mono">{id}</p><form action={action} onSubmit={e => { if (!window.confirm('Permanently delete this standalone image and its metadata?')) e.preventDefault(); }}><label htmlFor={`delete-${id}`}>Enter this image ID to confirm</label><input id={`delete-${id}`} name="confirmation" required pattern={id} disabled={pending}/><button className="button danger" disabled={pending}>{pending ? 'Deleting…' : 'Delete image'}</button></form>{state.error && <p role="alert" className="notice error">{state.error}</p>}</details>;
}
