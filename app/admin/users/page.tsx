import { getUsers, type SearchParams } from "@/lib/data";
import { ProfileAvatar } from "@/components/profile-avatar";
import { displayName } from "@/lib/media";
import { Empty, PageHeader, Pagination, Search } from "@/components/ui";
export default async function Users({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const data = await getUsers(await searchParams);
  return <><PageHeader title="Users" description="View and search user profiles."/><section className="panel"><div className="panel-heading"><h2>All profiles <span className="count">{data.count}</span></h2><span className="pill">Read only</span></div><div className="toolbar"><Search q={data.q} placeholder="Search first name, last name, or exact user ID"/></div>{!data.rows.length ? <Empty title={data.q ? "No matching profiles" : "No profiles yet"}>Try a different search or return after someone signs up.</Empty> : <div className="table-scroll"><table><thead><tr><th>User</th><th>User ID</th><th>Access</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td><div className="user-cell"><ProfileAvatar url={row.avatar_url} name={displayName(row)} /><strong>{displayName(row)}</strong></div></td><td className="mono">{row.id}</td><td><span className={`pill ${row.is_superadmin ? "green" : ""}`}>{row.is_superadmin ? "Superadmin" : "Member"}</span></td></tr>)}</tbody></table></div>}<Pagination count={data.count} page={data.page} path="/admin/users" q={data.q}/></section></>;
}
