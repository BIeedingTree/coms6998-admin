import "server-only";
import { requireAdmin } from "@/lib/auth";
import { CAPTION_FIELDS, PROFILE_FIELDS, databaseMessage, type Caption, type Profile, type Rating } from "@/lib/media";

export type SearchParams = { q?: string; page?: string; vote?: string };
export const PAGE_SIZE = 25;
export function searchOptions(params: SearchParams) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1));
  // Prevent PostgREST filter operators and wildcard characters in user input.
  const q = (typeof params.q === "string" ? params.q : "").replace(/[^\p{L}\p{N}\s@.\-]/gu, "").trim().slice(0, 100);
  return { page, q, from: (page - 1) * PAGE_SIZE, to: page * PAGE_SIZE - 1 };
}
function fail(error: { code?: string } | null) { if (error) throw new Error(databaseMessage(error, "Could not load data from Supabase. Please retry.")); }

export async function getUsers(params: SearchParams) {
  const { db } = await requireAdmin();
  const options = searchOptions(params);
  let query = db.from("profiles").select(PROFILE_FIELDS, { count: "exact" }).order("id");
  if (options.q) {
    query = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(options.q)
      ? query.eq("id", options.q)
      : query.or(`first_name.ilike.%${options.q}%,last_name.ilike.%${options.q}%`);
  }
  const { data, error, count } = await query.range(options.from, options.to);
  fail(error);
  return { rows: (data ?? []) as Profile[], count: count ?? 0, ...options };
}

export async function getAvatarProfiles(params: SearchParams) {
  const { db } = await requireAdmin();
  const options = searchOptions(params);
  let query = db.from("profiles").select(PROFILE_FIELDS, { count: "exact" })
    .not("avatar_url", "is", null).neq("avatar_url", "").order("id");
  if (options.q) {
    query = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(options.q)
      ? query.eq("id", options.q)
      : query.or(`first_name.ilike.%${options.q}%,last_name.ilike.%${options.q}%`);
  }
  const { data, error, count } = await query.range(options.from, options.to);
  fail(error);
  return { rows: (data ?? []) as Profile[], count: count ?? 0, ...options };
}

export async function getMedia(params: SearchParams) {
  const { db } = await requireAdmin();
  const options = searchOptions(params);
  let query = db.from("captions").select(CAPTION_FIELDS, { count: "exact" }).order("id", { ascending: false });
  if (options.q) query = query.or(`caption_text.ilike.%${options.q}%,subject.ilike.%${options.q}%`);
  const { data, error, count } = await query.range(options.from, options.to);
  fail(error);
  return { rows: (data ?? []) as Caption[], count: count ?? 0, ...options };
}

export async function getCaption(id: string) {
  const { db } = await requireAdmin();
  const { data, error } = await db.from("captions").select(CAPTION_FIELDS).eq("id", id).maybeSingle();
  fail(error);
  return data as Caption | null;
}

export async function getRatings(params: SearchParams) {
  const { db } = await requireAdmin();
  const options = searchOptions(params);
  let query = db.from("caption_votes").select("id::text,caption_id::text,user_id,vote,created_at", { count: "exact" }).order("id", { ascending: false });
  if (params.vote === "1" || params.vote === "-1") query = query.eq("vote", Number(params.vote));
  const { data, error, count } = await query.range(options.from, options.to);
  fail(error);
  const rows = (data ?? []) as Rating[];
  if (!rows.length) return { rows, profiles: [] as Profile[], captions: [] as Caption[], count: count ?? 0, ...options };
  // Both foreign keys point through auth.users, not directly to profiles.
  // Resolve the known IDs explicitly instead of inventing a PostgREST relation.
  const [profiles, captions] = await Promise.all([
    db.from("profiles").select(PROFILE_FIELDS).in("id", [...new Set(rows.map(row => row.user_id))]),
    db.from("captions").select(CAPTION_FIELDS).in("id", [...new Set(rows.map(row => row.caption_id))]),
  ]);
  fail(profiles.error); fail(captions.error);
  return { rows, profiles: (profiles.data ?? []) as Profile[], captions: (captions.data ?? []) as Caption[], count: count ?? 0, ...options };
}

export async function getDashboard() {
  const { db } = await requireAdmin();
  const [users, media, ratings, positive, negative, published] = await Promise.all([
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("captions").select("id", { count: "exact", head: true }),
    db.from("caption_votes").select("id", { count: "exact", head: true }),
    db.from("caption_votes").select("id", { count: "exact", head: true }).eq("vote", 1),
    db.from("caption_votes").select("id", { count: "exact", head: true }).eq("vote", -1),
    db.from("captions").select("id", { count: "exact", head: true }).eq("is_public", true),
  ]);
  for (const result of [users, media, ratings, positive, negative, published]) fail(result.error);
  // No aggregate RPC in Assignment 5 includes private captions. Read all vote
  // pages so most-rated rankings aren't silently truncated by the API row cap.
  const scores = new Map<string, { total: number; positive: number }>();
  let after: number | string | null = null;
  while (true) {
    let query = db.from("caption_votes").select("id::text,caption_id::text,vote").order("id").limit(500);
    if (after !== null) query = query.gt("id", after);
    const { data, error } = await query;
    fail(error);
    if (!data?.length) break;
    for (const row of data) {
      const key = String(row.caption_id);
      const score = scores.get(key) ?? { total: 0, positive: 0 };
      score.total++; score.positive += Number(row.vote === 1); scores.set(key, score);
    }
    after = data[data.length - 1].id;
  }
  const ranked = [...scores].sort((a, b) => b[1].total - a[1].total || b[1].positive - a[1].positive).slice(0, 5);
  let captions: Caption[] = [];
  if (ranked.length) {
    const result = await db.from("captions").select(CAPTION_FIELDS).in("id", ranked.map(([id]) => id));
    fail(result.error); captions = (result.data ?? []) as Caption[];
  }
  return {
    users: users.count ?? 0, media: media.count ?? 0, ratings: ratings.count ?? 0,
    positive: positive.count ?? 0, negative: negative.count ?? 0, published: published.count ?? 0,
    top: ranked.map(([id, score]) => ({ id, ...score, caption: captions.find(c => String(c.id) === id) })),
  };
}
