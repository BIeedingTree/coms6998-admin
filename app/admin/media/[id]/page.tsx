import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getCaption } from "@/lib/data";
import { dateLabel, isId } from "@/lib/media";
import { PageHeader } from "@/components/ui";
import { EditMediaForm } from "@/components/media-forms";
export default async function EditMedia({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isId(id)) notFound();
  const caption = await getCaption(id);
  if (!caption) notFound();
  return <><PageHeader eyebrow={`MEDIA / ITEM #${id}`} title="Edit media" description="Update the media item’s content, type, or category."/><div className="editor-layout"><div><EditMediaForm caption={caption}/></div><aside className="editor-note"><h3>Record details</h3><dl><dt>Media ID</dt><dd>#{id}</dd><dt>Created</dt><dd>{dateLabel(caption.created_at)}</dd><dt>Visibility</dt><dd>{caption.is_public ? "Shared with community" : "Private"}</dd><dt>Owner ID</dt><dd className="mono">{caption.user_id ?? "No owner recorded"}</dd></dl><p>Updates persist in the same database used by Assignment 5.</p></aside></div></>;
}
