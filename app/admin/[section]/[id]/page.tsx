import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { getResource, referenceOptions } from '@/lib/admin-data';
import { resourceFor } from '@/lib/admin-resources';
import { PageHeader } from '@/components/ui';
import { ResourceForm, ResourceDelete } from '@/components/resource-form';
export default async function ResourceDetail({ params, searchParams }: { params: Promise<{ section: string; id: string }>; searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { section, id } = await params;
  const r = resourceFor(section); if (!r || (id === 'new' && r.mode !== 'crud')) notFound();
  const row = id === 'new' ? undefined : (await getResource(section, id)).row;
  const options = await referenceOptions(r, row);
  const { saved } = await searchParams;
  return <><PageHeader title={`${row ? r.mode === 'read' ? 'View' : 'Edit' : 'Create'} · ${r.title}`} description={r.description}/>
    {r.notice && <p className="notice">{r.notice}</p>}
    <Link className="text-link back-link" href={`/admin/${section}`}>← Back to {r.title}</Link>
    {saved === '1' && r.mode === 'crud' && <p className="notice success" role="status">Record created in Supabase.</p>}
    {row && <section className="panel form-panel record-detail"><dl>{!r.source && <><dt>Record ID</dt><dd className="mono">{row.id}</dd></>}{r.fields.map(f => <div key={f.key}><dt>{f.label}</dt><dd>{f.reference && row[f.key] ? <Link className="text-link" href={f.reference === 'users' ? `/admin/users?q=${row[f.key]}` : `/admin/${f.reference}/${row[f.key]}`}>{options[f.key]?.find(o => o.id === row[f.key])?.label ?? String(row[f.key])}</Link> : String(row[f.key] ?? 'Not recorded')}</dd></div>)}<dt>{r.source ? 'Media saved' : 'Created'}</dt><dd>{row.created_at ?? 'Not recorded'}</dd></dl>
      {r.source === 'media-prompt' && <Link className="text-link" href={`/admin/llm-responses/${row.id}`}>View saved output →</Link>}
      {r.source === 'media-output' && row.prompt && <Link className="text-link" href={`/admin/generation-requests/${row.id}`}>View stored request prompt →</Link>}
      {section === 'prompt-chains' && <Link className="text-link" href={`/admin/prompt-chain-steps?chain=${row.id}`}>View this chain’s steps →</Link>}
    </section>}
    {r.mode !== 'read' && <ResourceForm resource={r} row={row} options={options}/>}
    {row && r.mode === 'crud' && <ResourceDelete slug={section} id={row.id}/>}
  </>;
}
