"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { generateMedia, updateMedia, deleteMedia } from "@/app/admin/media/actions";
import { CATEGORIES, MESSAGE_TYPES, type ActionState, type Caption } from "@/lib/media";
import { Icon } from "@/components/icons";

function Feedback({ state }: { state: ActionState }) {
  return <>{state.error && <p className="notice error" role="alert">{state.error}</p>}{state.message && <p className="notice success" role="status">{state.message}</p>}</>;
}
function MetadataFields({ type, category, onType }: { type: string; category: string; onType: (value: string) => void }) {
  return <div className="form-grid"><div className="field"><label htmlFor="message_type">Message type</label><select id="message_type" name="message_type" value={type} onChange={event => onType(event.target.value)}>{MESSAGE_TYPES.map(value => <option key={value} value={value}>{value === "message" ? "Text / Message" : value === "email" ? "Email" : "Other"}</option>)}</select></div><div className="field"><label htmlFor="category">Category</label><select id="category" name="category" defaultValue={category}>{CATEGORIES.map(value => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></div></div>;
}
export function CreateMediaForm() {
  const [state, action, pending] = useActionState(generateMedia, {});
  const [type, setType] = useState("message");
  return <form action={action} className="panel form-panel" aria-busy={pending}><fieldset disabled={pending}>
    <div className="form-intro"><span className="icon-tile"><Icon name="sparkles"/></span><div><h2>Create with AI</h2><p>Describe the message you want to generate.</p></div></div>
    <MetadataFields type={type} category="other" onType={setType}/>
    <div className="field"><label htmlFor="situation">What would you like to say?</label><textarea id="situation" name="situation" required maxLength={1000} rows={6} placeholder="Describe the situation, who you’re writing to, and the tone you have in mind." aria-describedby="situation-help"/><small id="situation-help">Up to 1,000 characters. New media items are saved privately under your account.</small></div>
    <Feedback state={state}/>
    {state.id && !state.error && <Link href={`/admin/media/${state.id}`} className="text-link">Review the saved media item <Icon name="arrow"/></Link>}
    <div className="form-actions"><Link href="/admin/media" className="button secondary">Back to media</Link><button className="button primary" disabled={pending}><Icon name="sparkles"/>{pending ? "Generating and saving…" : "Generate & save"}</button></div>
  </fieldset></form>;
}
export function EditMediaForm({ caption }: { caption: Caption }) {
  const [state, action, pending] = useActionState(updateMedia, {});
  const [deletion, deleteAction, deleting] = useActionState(deleteMedia, {});
  const [type, setType] = useState<string>(caption.message_type);
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  if (deletion.message) return <div className="panel form-panel"><Feedback state={deletion}/><Link href="/admin/media" className="button primary">Return to media</Link></div>;
  return <><form action={action} className="panel form-panel" aria-busy={pending}><fieldset disabled={pending || deleting}>
    <input type="hidden" name="id" value={String(caption.id)}/>
    <div className="form-intro"><span className="icon-tile"><Icon name="media"/></span><div><h2>Media details</h2><p>Changes are reflected in the original application.</p></div></div>
    <MetadataFields type={type} category={caption.category} onType={setType}/>
    {type === "email" && <div className="field"><label htmlFor="subject">Email subject</label><input id="subject" name="subject" defaultValue={caption.subject ?? ""} required maxLength={200}/></div>}
    <div className="field"><label htmlFor="caption_text">Media content</label><textarea id="caption_text" name="caption_text" defaultValue={caption.caption_text} required maxLength={2000} rows={10}/><small>Up to 2,000 characters. The owner and visibility are preserved.</small></div>
    <Feedback state={state}/><div className="form-actions"><Link href="/admin/media" className="button secondary">Back to media</Link><button className="button primary" disabled={pending || deleting}>{pending ? "Saving…" : "Save changes"}</button></div>
  </fieldset></form>
  <section className="panel danger-panel"><div><h2>Delete media</h2><p>This permanently deletes the media item and all its associated ratings, including upvotes and downvotes. This cannot be undone. The stored request and response views disappear with the media. Linked generation examples keep their input and output, with the media link cleared.</p></div>{!confirming ? <button type="button" className="button danger" disabled={pending} onClick={() => setConfirming(true)}>Delete media</button> : <form action={deleteAction} aria-busy={deleting}><input type="hidden" name="id" value={String(caption.id)}/><label htmlFor="confirmation">Type <strong>{caption.id}</strong> to confirm deletion of this media item and all its ratings</label><input autoFocus id="confirmation" name="confirmation" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} required disabled={deleting}/><Feedback state={deletion}/><div className="form-actions"><button type="button" className="button secondary" disabled={deleting} onClick={() => { setConfirming(false); setConfirmation(""); }}>Cancel</button><button className="button danger" disabled={deleting || pending || confirmation !== String(caption.id)}>{deleting ? "Deleting…" : "Delete media and ratings"}</button></div></form>}</section></>;
}
