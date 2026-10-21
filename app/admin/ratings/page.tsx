import Link from "next/link";
import { getRatings, type SearchParams } from "@/lib/data";
import { dateLabel, displayName } from "@/lib/media";
import { Empty, PageHeader, Pagination } from "@/components/ui";
export default async function Ratings({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const data = await getRatings(params);
  return <><PageHeader title="Ratings" description="Understand the feedback behind every caption."/><section className="panel"><div className="panel-heading"><h2>All feedback <span className="count">{data.count}</span></h2><span className="pill">Read only</span></div><div className="toolbar"><form className="filter-form"><label htmlFor="vote">Rating</label><select name="vote" id="vote" defaultValue={params.vote ?? ""}><option value="">All ratings</option><option value="1">Upvotes · Send it</option><option value="-1">Downvotes · Needs work</option></select><button className="button secondary">Apply filter</button></form></div>{!data.rows.length ? <Empty title="No ratings to show">Feedback will appear here as users rate captions.</Empty> : <div className="table-scroll"><table><thead><tr><th>Rating</th><th>User</th><th>Media</th><th>Created</th></tr></thead><tbody>{data.rows.map(row => {
    const profile = data.profiles.find(p => p.id === row.user_id);
    const caption = data.captions.find(c => String(c.id) === String(row.caption_id));
    return <tr key={row.id}><td><span className={`pill ${row.vote === 1 ? "green" : "red"}`}>{row.vote === 1 ? "↑ Send it" : "↓ Needs work"}</span><small>Rating #{row.id}</small></td><td><strong>{profile ? displayName(profile) : "Profile unavailable"}</strong><small className="mono" title={row.user_id}>{row.user_id}</small></td><td><Link href={`/admin/media/${row.caption_id}`} className="text-link truncate">{caption?.subject || caption?.caption_text || `Caption #${row.caption_id}`}</Link><small>#{row.caption_id}</small></td><td className="nowrap">{dateLabel(row.created_at)}</td></tr>;
  })}</tbody></table></div>}<Pagination count={data.count} page={data.page} path="/admin/ratings" vote={params.vote}/></section></>;
}
