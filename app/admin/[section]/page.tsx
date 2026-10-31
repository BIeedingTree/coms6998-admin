import Link from 'next/link';
import { listResource, referenceOptions } from '@/lib/admin-data';
import { Empty, PageHeader, Search } from '@/components/ui';
import { PAGE_SIZE, type SearchParams } from '@/lib/data';
import { dateLabel } from '@/lib/media';
export default async function ResourceList({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<SearchParams & { chain?: string; deleted?: string }> }) {
  const { section } = await params;
  const search = await searchParams;
  const result = await listResource(section, search);
  const { resource: r, rows, count, page, q, error } = result;
  // Reference labels are useful for mix and step records whose identity is a chain.
  let labels: Record<string, { id: string; label: string }[]> = {};
  if (!error && (section === 'prompt-chain-mix' || section === 'prompt-chain-steps')) labels = await referenceOptions(r);
  const columns = r.fields.slice(0, section === 'generation-requests' ? 5 : 4);
  const pages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const href = (p: number) => `/admin/${section}?${new URLSearchParams({ q, page: String(p), ...(search.chain ? { chain: search.chain } : {}) })}`;
  return <><PageHeader title={r.title} description={r.description} action={r.mode === 'crud' ? <Link className="button primary" href={`/admin/${section}/new`}>Create record</Link> : <span className="pill">{r.mode === 'read' ? 'Read only' : 'Read + update'}</span>}/>
    {r.notice && <p className="notice">{r.notice}</p>}
    {search.deleted === '1' && <p role="status" className="notice success">Record deleted.</p>}
    {error ? <p role="alert" className="notice error">{error}</p> : <section className="panel">
      <div className="panel-heading"><h2>All records <span className="count">{count}</span></h2></div>
      <div className="toolbar">{section !== 'prompt-chain-steps' ? <Search q={q} placeholder={r.search.length ? 'Search text or exact ID' : 'Search exact record ID'}/> :
        <form className="filter-form" role="search"><label htmlFor="chain">Chain</label><select name="chain" id="chain" defaultValue={search.chain ?? ''}><option value="">All chains</option>{labels.chain_id?.map(o => <option value={o.id} key={o.id}>{o.label}</option>)}</select><label className="sr-only" htmlFor="q">Search steps</label><input name="q" id="q" defaultValue={q} placeholder="Search steps"/><button className="button secondary">Filter</button></form>}
      </div>
      {!rows.length ? <Empty title={q || search.chain ? 'No matching records' : 'No records yet'}>{q || search.chain ? 'Try another search or filter.' : section === 'whitelisted-emails' ? 'No email addresses have been explicitly authorized.' : section === 'generation-examples' ? 'Add an example from an approved saved prompt and output.' : r.mode === 'crud' ? 'Create a record to get started.' : null}</Empty> :
        <div className="table-scroll"><table><thead><tr>{columns.map(f => <th key={f.key}>{f.label}</th>)}<th>{r.source ? 'Media saved' : 'Created'}</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map(row => <tr key={row.id}>{columns.map(f => <td key={f.key}><span className="truncate" title={String(row[f.key] ?? '')}>{labels[f.key]?.find(o => o.id === row[f.key])?.label ?? String(row[f.key] ?? '—')}</span></td>)}<td className="nowrap">{dateLabel(row.created_at ?? null)}</td><td><Link className="text-link" href={`/admin/${section}/${row.id}`}>{r.mode === 'read' ? 'View' : 'View / edit'}</Link></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>{count} records · Page {page} of {pages}</span><div>{page > 1 && <Link className="button secondary" href={href(Math.min(page - 1, pages))}>Previous</Link>}{page < pages && <Link className="button secondary" href={href(page + 1)}>Next</Link>}</div></div>
    </section>}
  </>;
}
