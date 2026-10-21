import Link from "next/link";
import { getDashboard } from "@/lib/data";
import { Empty, PageHeader, Stat } from "@/components/ui";

export default async function Dashboard() {
  const data = await getDashboard();
  const rated = data.positive + data.negative;
  const percentage = rated ? Math.round(data.positive / rated * 100) : null;
  return (
    <>
      <PageHeader title="Dashboard" description="Users, captions, and ratings from Say It Better." action={<Link className="button primary" href="/admin/media/new">Create media</Link>} />
      <div className="stats-grid">
        <Stat label="Total users" value={data.users.toLocaleString()} detail="User profiles" icon="users" />
        <Stat label="Media items" value={data.media.toLocaleString()} detail={`${data.published.toLocaleString()} shared with the community`} icon="media" />
        <Stat label="Total ratings" value={data.ratings.toLocaleString()} detail="Across all captions" icon="ratings" />
        <Stat label="Positive ratings" value={percentage === null ? "—" : `${percentage}%`} detail={rated ? `${data.positive.toLocaleString()} of ${rated.toLocaleString()} ratings` : "No ratings yet"} icon="ratings" />
      </div>
      <section className="panel rating-summary">
        <div className="panel-heading"><h2>Upvotes and downvotes</h2><Link href="/admin/ratings" className="text-link">View ratings</Link></div>
        <div className="rating-chart">
          <div className="rating-labels"><span>Upvotes: <strong>{data.positive.toLocaleString()}</strong></span><span>Downvotes: <strong>{data.negative.toLocaleString()}</strong></span></div>
          <div className="rating-bar" role="img" aria-label={rated ? `${data.positive} upvotes, ${data.negative} downvotes; ${percentage}% positive` : "No ratings yet"}>
            {rated > 0 && <><span style={{ width: `${data.positive / rated * 100}%` }} /><span style={{ width: `${data.negative / rated * 100}%` }} /></>}
          </div>
          <p className="data-note">{rated ? "Upvotes are shown in blue; downvotes in gray." : "The rating breakdown will appear when users leave feedback."}</p>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading"><div><h2>Most-rated content</h2><p>Ranked by total ratings, then upvotes.</p></div><Link href="/admin/media" className="text-link">View media</Link></div>
        {!data.top.length ? <Empty title="No rated content yet">Captions will appear here once they receive ratings.</Empty> : (
          <div className="table-scroll"><table>
            <thead><tr><th>Caption</th><th>Category</th><th>Ratings</th><th>Positive</th><th><span className="sr-only">Action</span></th></tr></thead>
            <tbody>{data.top.map(item => <tr key={item.id}>
              <td><strong className="truncate">{item.caption?.subject || item.caption?.caption_text || `Caption #${item.id}`}</strong><small>#{item.id} · {item.caption?.message_type ?? "Unavailable"}</small></td>
              <td><span className="pill capitalize">{item.caption?.category ?? "Unavailable"}</span></td>
              <td>{item.total.toLocaleString()}</td>
              <td>{Math.round(item.positive / item.total * 100)}%</td>
              <td><Link href={`/admin/media/${item.id}`} className="text-link">Review</Link></td>
            </tr>)}</tbody>
          </table></div>
        )}
      </section>
      <p className="data-note">All-time totals. Refresh the page to see new activity.</p>
    </>
  );
}
