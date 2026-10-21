"use server";
import { GoogleGenAI } from "@google/genai";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { databaseMessage, isId, metadata, parseGeneration, type ActionState } from "@/lib/media";

function refresh() { revalidatePath("/admin", "layout"); }

export async function generateMedia(_state: ActionState, form: FormData): Promise<ActionState> {
  const { db, user } = await requireAdmin();
  const meta = metadata(form);
  const situation = form.get("situation");
  if (!meta || typeof situation !== "string" || !situation.trim() || situation.trim().length > 1000) return { error: "Choose a valid type and category, and enter a request of 1–1,000 characters." };
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { error: "AI generation is not configured. Set the server-only GEMINI_API_KEY." };
  // Retain Assignment 5's prompt markers so original requests render in that app.
  const prompt = `You are an expert at helping people phrase difficult or awkward messages clearly and naturally.\n\nThe user needs help writing a ${meta.message_type}.\nCategory: ${meta.category}.\n\nSituation:\n${situation.trim()}\n\nRecipient:\nNot specified\n\nDesired tone:\nNatural\n\nWrite exactly one ready-to-send message under 2000 characters. Preserve the user's intent. Do not invent facts or names. Return JSON with exactly subject and message. ${meta.message_type === "email" ? "Subject must be a nonempty single line under 200 characters; message is the email body." : "Subject must be JSON null."}`;
  let generated: ReturnType<typeof parseGeneration>;
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash-lite", contents: prompt,
      config: { httpOptions: { timeout: 30_000 }, responseMimeType: "application/json", responseJsonSchema: {
        type: "object", additionalProperties: false,
        properties: { subject: { type: meta.message_type === "email" ? "string" : "null" }, message: { type: "string" } }, required: ["subject", "message"],
      } },
    });
    generated = parseGeneration(response.text, meta.message_type);
    if (!generated) return { error: "The AI returned invalid media content. Nothing was saved; please try again." };
  } catch { return { error: "AI generation failed. Check the provider connection and try again." }; }
  // Keep redirects outside catch blocks, including this check after generation.
  await requireAdmin();
  try {
    const { data, error } = await db.from("captions").insert({ ...meta, ...generated, prompt, user_id: user.id, is_public: false, published_at: null }).select("id::text").single();
    if (error || !data) return { error: databaseMessage(error, "The media item could not be saved. Please try again.") };
    refresh();
    return { message: "AI media created and saved privately.", id: String(data.id) };
  } catch { return { error: "Saving failed. Check the database connection and try again." }; }
}

export async function updateMedia(_state: ActionState, form: FormData): Promise<ActionState> {
  const { db } = await requireAdmin();
  const id = form.get("id");
  const meta = metadata(form);
  const text = form.get("caption_text");
  const subject = form.get("subject");
  if (!isId(id) || !meta || typeof text !== "string" || !text.trim() || text.trim().length > 2000) return { error: "Enter valid media content (1–2,000 characters), type, and category." };
  if (meta.message_type === "email" && (typeof subject !== "string" || !subject.trim() || subject.trim().length > 200 || /[\r\n]/.test(subject))) return { error: "Email requires a single-line subject of 1–200 characters." };
  try {
    // Explicit allowlist: ownership, prompts, roles and publication are never writable.
    const { data, error } = await db.from("captions").update({ ...meta, caption_text: text.trim(), subject: meta.message_type === "email" ? (subject as string).trim() : null }).eq("id", id).select("id::text").maybeSingle();
    if (error) return { error: databaseMessage(error) };
    if (!data) return { error: "Media item not found or permission denied. Refresh and try again." };
    refresh();
    return { message: "Changes saved to Supabase.", id: String(data.id) };
  } catch { return { error: "Could not save changes. Check your connection and try again." }; }
}

export async function deleteMedia(_state: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = form.get("id");
  if (!isId(id) || form.get("confirmation") !== id) return { error: "Confirm deletion by entering the media ID exactly." };
  try {
    // Use the verified user's session, so the atomic RPC independently checks
    // auth.uid() and profiles.is_superadmin. Never pass a caller-supplied user ID.
    const session = await createClient();
    const { data, error } = await session.rpc("admin_delete_media", {
      p_media_id: id, p_confirmation: form.get("confirmation"),
    });
    if (error?.code === "PGRST202" || error?.code === "42883") return { error: "Media deletion is not configured yet. Ask the project owner to install the reviewed deletion SQL. Nothing was deleted." };
    if (error?.code === "P0001") return { error: "Database dependencies need review before this media item can be deleted. Nothing was deleted." };
    if (error) return { error: databaseMessage(error, error.code ? "Media deletion failed. No changes were committed." : "Could not confirm deletion. Refresh the media list before trying again.") };
    if (!data || data.id !== id) return { error: "Media item not found or deletion could not be confirmed. Refresh the media list before trying again." };
  } catch { return { error: "Could not confirm deletion. Check your connection and refresh the media list before trying again." }; }
  // Redirect away from the removed record before rendering its editor again.
  // These invalidations cover media, ratings, and dashboard totals.
  refresh();
  revalidatePath("/admin/media");
  revalidatePath("/admin/ratings");
  redirect("/admin/media?deleted=1");
}
