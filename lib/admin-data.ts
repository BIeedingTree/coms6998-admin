import 'server-only';
import { requireAdmin } from '@/lib/auth';
import { searchOptions, type SearchParams } from '@/lib/data';
import { adminError, isUuid, resourceFor, type AdminRow, type Resource, type Option } from '@/lib/admin-resources';
import { notFound } from 'next/navigation';
export function fieldsFor(r: Resource) { return ['id', 'created_at', ...r.fields.map(f => f.kind === 'media' ? `${f.key}::text` : f.key)].join(','); }
export async function listResource(slug: string, params: SearchParams & { chain?: string }) {
  const { db } = await requireAdmin();
  const resource = resourceFor(slug); if (!resource) notFound();
  const options = searchOptions(params);
  let query = db.from(resource.table).select(fieldsFor(resource), { count: 'exact' });
  if (options.q) {
    if (isUuid(options.q)) query = query.eq('id', options.q);
    else if (resource.search.length) query = query.or(resource.search.map(f => `${f}.ilike.%${options.q}%`).join(','));
    else return { resource, rows: [] as AdminRow[], count: 0, error: undefined, ...options };
  }
  if (slug === 'prompt-chain-steps' && params.chain) {
    if (!isUuid(params.chain)) return { resource, rows: [] as AdminRow[], count: 0, error: undefined, ...options };
    query = query.eq('chain_id', params.chain);
  }
  query = slug === 'prompt-chain-steps' ? query.order('chain_id').order('step_order').order('id') : query.order('created_at', { ascending: false }).order('id');
  const { data, count, error } = await query.range(options.from, options.to);
  return { resource, rows: (data ?? []) as unknown as AdminRow[], count: count ?? 0, error: error ? adminError(error) : undefined, ...options };
}
export async function getResource(slug: string, id: string) {
  const { db } = await requireAdmin();
  const resource = resourceFor(slug); if (!resource || !isUuid(id)) notFound();
  const { data, error } = await db.from(resource.table).select(fieldsFor(resource)).eq('id', id).maybeSingle();
  if (error) throw new Error(adminError(error));
  if (!data) notFound();
  return { resource, row: data as unknown as AdminRow };
}
// Paginate reference options so the PostgREST row cap cannot silently hide choices.
export async function referenceOptions(resource: Resource) {
  const { db } = await requireAdmin();
  const result: Record<string, Option[]> = {};
  for (const f of resource.fields.filter(f => f.reference)) {
    const r = resourceFor(f.reference!);
    const table = r?.table ?? (f.reference === 'media' ? 'captions' : 'profiles');
    const label = r?.fields.find(f => !f.reference)?.key ?? (f.reference === 'media' ? 'caption_text' : 'first_name');
    const projection = `${f.reference === 'media' ? 'id::text' : 'id'},${label}${f.reference === 'users' ? ',last_name' : ''}`;
    const values: Option[] = [];
    let after: string | null = null;
    while (true) {
      let query = db.from(table).select(projection).order('id').limit(500);
      if (after !== null) query = query.gt('id', after);
      const { data, error } = await query;
      if (error) throw new Error(adminError(error));
      if (!data?.length) break;
      for (const item of data as unknown as AdminRow[]) values.push({ id: String(item.id), label: `${String(item[label] ?? 'Unnamed').slice(0,100)}${item.last_name ? ` ${item.last_name}` : ''} · ${item.id}` });
      after = String((data as unknown as AdminRow[])[data.length - 1].id);
    }
    result[f.key] = values;
  }
  return result;
}
