'use client';
import { useActionState, useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { saveResource, deleteResource } from '@/app/admin/[section]/actions';
import type { AdminRow, Option, Resource } from '@/lib/admin-resources';
import type { ActionState } from '@/lib/media';
export function ResourceForm({ resource, row, options }: { resource: Resource; row?: AdminRow; options: Record<string, Option[]> }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveResource.bind(null, resource.slug, row?.id ?? null), {} as ActionState);
  const creating = !row;
  // Refreshed server props contain a new row object. Depending on that object
  // would keep refreshing after every successful edit, including mix updates.
  useEffect(() => {
    if (!state.id) return;
    if (creating) router.replace(`/admin/${resource.slug}/${state.id}?saved=1`);
    else router.refresh();
  }, [state, creating, resource.slug, router]);
  return <form action={action} className="panel form-panel" aria-busy={pending}>
    <fieldset disabled={pending}>{resource.fields.filter(f => resource.mode !== 'update' || f.key === 'weight').map(f => <div className="field" key={f.key}>
      <label htmlFor={f.key}>{f.label}{f.required ? ' *' : ' (optional)'}</label>
      {f.reference ? <select id={f.key} name={f.key} defaultValue={String(row?.[f.key] ?? '')} required={f.required}>
        <option value="">{f.required ? 'Choose a record' : 'None'}</option>
        {(options[f.key] ?? []).map(o => <option value={o.id} key={o.id}>{o.label}</option>)}
      </select> : f.kind === 'long' ? <textarea id={f.key} name={f.key} defaultValue={String(row?.[f.key] ?? '')} required={f.required} maxLength={f.max} rows={6}/> :
        <input id={f.key} name={f.key} defaultValue={String(row?.[f.key] ?? '')} required={f.required} maxLength={f.max} type={f.kind === 'weight' ? 'number' : f.kind === 'email' ? 'email' : 'text'} min={f.kind === 'weight' ? 0 : undefined} max={f.kind === 'weight' ? 1000000 : undefined} step={f.kind === 'weight' ? '0.0001' : undefined}/>}
    </div>)}<button className="button primary" type="submit">{pending ? 'Saving…' : row ? 'Save changes' : 'Create record'}</button></fieldset>
    {state.error && <p className="notice error" role="alert">{state.error}</p>}{state.message && <p className="notice success" role="status">{state.message}</p>}
  </form>;
}
export function ResourceDelete({ slug, id }: { slug: string; id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  const [confirmation, setConfirmation] = useState('');
  const [state, action, pending] = useActionState(deleteResource.bind(null, slug, id), {} as ActionState);
  useEffect(() => { if (state.message) { router.replace(`/admin/${slug}?deleted=1`); router.refresh(); } }, [state, router, slug]);
  return <section className="panel danger-panel"><h2>Delete record</h2><p>Related records can prevent deletion. This cannot be undone.</p>
    <button className="button danger" type="button" onClick={() => setOpen(true)}>Delete record</button>
    <dialog ref={dialog} onCancel={() => setOpen(false)} aria-labelledby="delete-title" className="panel form-panel delete-dialog">
      <h2 id="delete-title">Confirm deletion</h2><p className="mono">{id}</p><form action={action}><label htmlFor="confirmation">Enter this record ID to permanently delete it</label><input autoFocus id="confirmation" name="confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} disabled={pending}/><div className="form-actions"><button type="button" className="button secondary" disabled={pending} onClick={() => setOpen(false)}>Cancel</button><button className="button danger" disabled={pending || confirmation !== id}>{pending ? 'Deleting…' : 'Confirm deletion'}</button></div></form>
      {state.error && <p role="alert" className="notice error">{state.error}</p>}
    </dialog>
  </section>;
}
