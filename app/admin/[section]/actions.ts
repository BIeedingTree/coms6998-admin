'use server';
import { requireAdmin } from '@/lib/auth';
import { adminError, isUuid, parseResource, resourceFor } from '@/lib/admin-resources';
import type { ActionState } from '@/lib/media';
import { revalidatePath } from 'next/cache';
export async function saveResource(slug: string, id: string | null, _state: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const r = resourceFor(slug);
  if (!r || r.mode === 'read' || (!id && r.mode !== 'crud') || (id !== null && !isUuid(id))) return { error: 'This operation is not allowed.' };
  const parsed = parseResource(r, form); if (!parsed.values) return { error: parsed.error };
  try {
    const query = id ? db.from(r.table).update(parsed.values).eq('id', id) : db.from(r.table).insert(parsed.values);
    const { data, error } = await query.select('id').maybeSingle();
    if (error) return { error: adminError(error) };
    if (!data) return { error: 'Record no longer exists. Refresh and try again.' };
    revalidatePath('/admin', 'layout');
    return { message: 'Saved to Supabase.', id: String(data.id) };
  } catch { return { error: 'Could not confirm saving. Refresh before retrying.' }; }
}
export async function deleteResource(slug: string, id: string, _state: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const r = resourceFor(slug);
  if (!r || r.mode !== 'crud' || !isUuid(id) || form.get('confirmation') !== id) return { error: 'Enter the exact record ID to confirm deletion.' };
  try {
    // Explicit provider dependency message; the database FK also prevents races.
    if (slug === 'llm-providers') {
      const { count, error } = await db.from('llm_models').select('id', { count: 'exact', head: true }).eq('provider_id', id);
      if (error) return { error: adminError(error) };
      if (count) return { error: `${count} LLM model(s) reference this provider. Reassign or delete those models first.` };
    }
    const { data, error } = await db.from(r.table).delete().eq('id', id).select('id').maybeSingle();
    if (error) return { error: adminError(error) };
    if (!data) return { error: 'Record no longer exists. Refresh the list.' };
    revalidatePath('/admin', 'layout');
    return { message: 'Record deleted.', id };
  } catch { return { error: 'Could not confirm deletion. Refresh before retrying.' }; }
}
