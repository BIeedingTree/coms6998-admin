import Image from "next/image";
import Link from "next/link";
import { getAvatarProfiles, type SearchParams } from "@/lib/data";
import { displayName } from "@/lib/media";
import { Empty, PageHeader, Pagination, Search } from "@/components/ui";

export default async function AvatarImages({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const data = await getAvatarProfiles(await searchParams);
  return <>
    <PageHeader title="Avatar Images" description="Profile photos used by Say It Better members." />
    <section className="panel">
      <div className="panel-heading"><h2>Profile avatars <span className="count">{data.count}</span></h2><span className="pill">Read only</span></div>
      <div className="toolbar"><Search q={data.q} placeholder="Search profiles" /></div>
      {data.rows.length ? <div className="avatar-grid">{data.rows.map(profile => {
        const name = displayName(profile);
        return <article className="avatar-card" key={profile.id}>
          <Link href={`/admin/users?q=${encodeURIComponent(profile.id)}`} aria-label={`View ${name} in Users`}>
            {profile.avatar_url && /^https:\/\//i.test(profile.avatar_url) && <Image src={profile.avatar_url} alt={`${name}'s avatar`} width={180} height={180} unoptimized referrerPolicy="no-referrer" />}
            <strong>{name}</strong>
          </Link>
          <small className="mono" title={profile.id}>{profile.id}</small>
          <span className="pill">{profile.is_superadmin ? "Superadmin" : "Member"}</span>
        </article>;
      })}</div> : <Empty title={data.q ? "No matching avatars" : "No profile avatars yet"}>{data.q ? "Try another search." : null}</Empty>}
      <Pagination count={data.count} page={data.page} path="/admin/images" q={data.q} />
    </section>
  </>;
}
