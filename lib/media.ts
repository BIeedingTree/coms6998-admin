export const CATEGORIES = ["academic", "career", "clubs", "housing", "social", "other"] as const;
export const MESSAGE_TYPES = ["email", "message", "other"] as const;
export type MessageType = typeof MESSAGE_TYPES[number];
export type Category = typeof CATEGORIES[number];
export type Profile = { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null; is_superadmin: boolean | null };
export type Caption = { id: number | string; caption_text: string; subject: string | null; message_type: MessageType; category: Category; user_id: string | null; created_at: string | null; is_public: boolean; published_at: string | null };
export type Rating = { id: number | string; caption_id: number | string; user_id: string; vote: number; created_at: string | null };
export const CAPTION_FIELDS = "id::text,caption_text,subject,message_type,category,user_id,created_at,is_public,published_at";
export const PROFILE_FIELDS = "id,first_name,last_name,avatar_url,is_superadmin";
export type ActionState = { error?: string; message?: string; id?: string };

export function isId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= BigInt("9223372036854775807");
}
export function metadata(form: FormData) {
  const messageType = form.get("message_type");
  const category = form.get("category");
  if (!MESSAGE_TYPES.includes(messageType as MessageType) || !CATEGORIES.includes(category as Category)) return null;
  return { message_type: messageType as MessageType, category: category as Category };
}
export function parseGeneration(text: string | undefined, type: MessageType) {
  try {
    const value: unknown = JSON.parse(text ?? "");
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (typeof item.message !== "string" || !item.message.trim() || item.message.trim().length > 2000) return null;
    if (type === "email") {
      if (typeof item.subject !== "string" || !item.subject.trim() || item.subject.trim().length > 200 || /[\r\n]/.test(item.subject)) return null;
    } else if (item.subject !== null) return null;
    return { caption_text: item.message.trim(), subject: type === "email" ? (item.subject as string).trim() : null };
  } catch { return null; }
}
export function displayName(profile?: Pick<Profile, "first_name" | "last_name"> | null) {
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Unnamed user";
}
export function dateLabel(value: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(date);
}
export function databaseMessage(error: { code?: string } | null, fallback = "The database operation failed. Please try again.") {
  if (error?.code === "42501" || error?.code === "PGRST301") return "Permission denied by Supabase. Check the server credential and database permissions; no policies were changed.";
  if (error?.code === "23503") return "Additional related records prevent deletion of this media item. Nothing was deleted; ask the project owner to review the database dependencies.";
  if (error?.code === "42703" || error?.code === "42P01" || error?.code === "PGRST204") return "The database does not match the existing app’s schema. Verify its tables and columns; this app does not alter them.";
  return fallback;
}
