import Image from 'next/image';
import Link from 'next/link';
import { listImages } from '@/lib/admin-images';
import { getUsers, type SearchParams } from '@/lib/data';
import { displayName } from '@/lib/media';
import { Empty, PageHeader, Pagination, Search } from '@/components/ui';
import { ImageForm, ImageDelete } from '@/components/image-forms';
export default async function Images({ searchParams }: { searchParams: Promise<SearchParams & { view?: string }> }) {
  const params = await searchParams;
  if (params.view === 'avatars') {
    const data = await getUsers(params);
    return <><PageHeader title="Profile Avatars" description="Existing profile image references are read-only. Manage standalone images separately."/><Link href="/admin/images" className="text-link back-link">← Standalone images</Link><section className="panel"><div className="panel-heading"><h2>Profile image references</h2></div><div className="toolbar"><form className="search"><input type="hidden" name="view" value="avatars"/><label className="sr-only" htmlFor="q">Search profiles</label><input id="q" name="q" defaultValue={data.q} placeholder="Search profiles"/><button className="button secondary">Search</button></form></div><div className="table-scroll"><table><thead><tr><th>Profile</th><th>Avatar</th></tr></thead><tbody>{data.rows.map(p => <tr key={p.id}><td>{displayName(p)}<small>{p.id}</small></td><td>{p.avatar_url && /^https:\/\//.test(p.avatar_url) ? <a className="text-link" href={p.avatar_url} target="_blank" rel="noopener noreferrer">View avatar ↗</a> : 'No image'}</td></tr>)}</tbody></table></div>{!data.rows.length && <Empty title="No matching profiles">Try another search.</Empty>}<Pagination count={data.count} page={data.page} path="/admin/images" q={data.q} view="avatars"/></section></>;
  }
  const data = await listImages(params);
  return <><PageHeader title="Images" description="Manage standalone images in the existing public avatars bucket. Uploaded files are publicly viewable." action={<Link className="button secondary" href="/admin/images?view=avatars">View profile avatars</Link>}/>
    {data.error ? <p role="alert" className="notice error">{data.error}</p> : <>
      <details className="panel form-panel"><summary>Upload new image</summary><div className="form-actions"/><ImageForm/></details>
      <section className="panel" style={{ marginTop: 24 }}><div className="panel-heading"><h2>Standalone images <span className="count">{data.count}</span></h2></div><div className="toolbar"><Search q={data.q} placeholder="Search title or alt text"/></div>{!data.rows.length && <Empty title="No images found">Upload an image or try another search.</Empty>}<Pagination count={data.count} page={data.page} path="/admin/images" q={data.q}/></section>
      <div className="image-grid">{data.rows.map(row => <article className="panel image-card" key={row.id}><a href={row.url} target="_blank" rel="noopener noreferrer"><Image className="image-preview" src={row.url} alt={row.alt_text ?? row.title} width={180} height={140} unoptimized/></a><h2>{row.title}</h2><p className="data-note">{row.mime_type} · {Math.ceil(row.size_bytes / 1024)} KB</p><details><summary>Edit metadata</summary><ImageForm image={row}/></details><ImageDelete id={row.id}/></article>)}</div>
    </>}
  </>;
}
