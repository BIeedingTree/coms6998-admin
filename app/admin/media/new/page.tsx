import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { CreateMediaForm } from "@/components/media-forms";
export default async function NewMedia() {
  await requireAdmin();
  return <><PageHeader eyebrow="MEDIA / NEW" title="Create media" description="Generate media and save it to Supabase."/><div className="editor-layout"><CreateMediaForm/><aside className="editor-note"><h3>AI generation</h3><p>Generate an email, a text message, or another short piece of writing using the same AI model as Say It Better.</p><h3>Private by default</h3><p>The new record belongs to you. Publishing remains available through the original application.</p></aside></div></>;
}
