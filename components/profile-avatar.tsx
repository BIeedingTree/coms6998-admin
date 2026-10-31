"use client";
import Image from "next/image";

export function ProfileAvatar({ url, name }: { url?: string | null; name: string }) {
  return <span className="avatar profile-avatar" aria-hidden="true">
    {name.slice(0, 1)}
    {url && /^https:\/\//i.test(url) && <Image key={url} src={url} alt="" width={32} height={32} unoptimized referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
  </span>;
}
