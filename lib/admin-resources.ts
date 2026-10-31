// Explicit application allowlist. Neither table nor field names come from requests.
export type Field = { key: string; label: string; kind?: 'text' | 'long' | 'uuid' | 'media' | 'weight' | 'domain' | 'email'; required?: boolean; max?: number; reference?: string };
export type Resource = { slug: string; table: string; title: string; mode: 'read' | 'update' | 'crud'; fields: Field[]; search: string[]; description: string; source?: 'media-prompt' | 'media-output'; notice?: string };
const name: Field = { key: 'name', label: 'Name', required: true, max: 120 };
const chain: Field = { key: 'chain_id', label: 'Prompt chain', kind: 'uuid', reference: 'prompt-chains' };
const model: Field = { key: 'model_id', label: 'LLM model', kind: 'uuid', reference: 'llm-models' };
const media: Field = { key: 'media_id', label: 'Media', kind: 'media', reference: 'media' };
export const resources: Resource[] = [
  { slug: 'prompt-chains', table: 'prompt_chains', title: 'Prompt Chains', mode: 'read', fields: [name, { key: 'description', label: 'Description', kind: 'long' }], search: ['name','description'], description: 'Inspect chains and their configuration.' },
  { slug: 'prompt-chain-steps', table: 'prompt_chain_steps', title: 'Prompt Chain Steps', mode: 'read', fields: [chain, name, { key: 'step_order', label: 'Execution order' }, { key: 'prompt', label: 'Prompt', kind: 'long' }, model], search: ['name','prompt'], description: 'Read execution order, prompts, and model references. Steps cannot be edited here.' },
  { slug: 'prompt-chain-mix', table: 'prompt_chain_mix', title: 'Prompt Chain Mix', mode: 'update', fields: [chain, { key: 'weight', label: 'Relative weight', kind: 'weight', required: true }], search: [], description: 'Relative weights from 0 to 1,000,000 (up to four decimal places). Zero disables a chain. Values do not need to sum to 1 or 100. Configuration only; this does not change the existing generator.' },
  { slug: 'generation-requests', table: 'captions', source: 'media-prompt', title: 'Generation Requests', mode: 'read', fields: [
    { key: 'id', label: 'Media ID', kind: 'media', reference: 'media' },
    { key: 'user_id', label: 'User', kind: 'uuid', reference: 'users' },
    { key: 'message_type', label: 'Media type' }, { key: 'category', label: 'Category' },
    { key: 'prompt', label: 'Stored generation prompt', kind: 'long' },
  ], search: ['prompt'], description: 'Prompts saved with Say It Better media.',
    notice: 'Only saved prompts appear. Failed attempts, request status, timing, usage and model history are unavailable.' },
  { slug: 'llm-responses', table: 'captions', source: 'media-output', title: 'LLM Responses', mode: 'read', fields: [
    { key: 'id', label: 'Media ID', kind: 'media', reference: 'media' },
    { key: 'subject', label: 'Saved subject' }, { key: 'caption_text', label: 'Saved output', kind: 'long' },
    { key: 'user_id', label: 'User', kind: 'uuid', reference: 'users' },
    { key: 'message_type', label: 'Media type' }, { key: 'category', label: 'Category' },
    { key: 'prompt', label: 'Stored generation prompt', kind: 'long' },
  ], search: ['caption_text','subject'], description: 'Saved subjects and output from Say It Better media.',
    notice: 'Outputs may have been edited. This is saved content, not an immutable response archive.' },
  { slug: 'terms', table: 'terms', title: 'Terms', mode: 'crud', fields: [{ key: 'term', label: 'Term', required: true, max: 200 }, { key: 'definition', label: 'Definition', kind: 'long', required: true, max: 10000 }], search: ['term','definition'], description: 'Manage terms and definitions.' },
  { slug: 'generation-examples', table: 'ai_generation_examples', title: 'Generation Examples', mode: 'crud', fields: [name, { key: 'input', label: 'Example input', kind: 'long', required: true, max: 50000 }, { key: 'output', label: 'Example output', kind: 'long', required: true, max: 50000 }, chain, model, media], search: ['name','input','output'], description: 'Manage reference examples and optional chain, model, and media associations. Deleting linked media clears its link; the example input and output are retained.' },
  { slug: 'llm-models', table: 'llm_models', title: 'LLM Models', mode: 'crud', fields: [name, { key: 'provider_id', label: 'Provider', kind: 'uuid', required: true, reference: 'llm-providers' }, { key: 'model_key', label: 'Provider model identifier', required: true, max: 200 }], search: ['name','model_key'], description: 'Metadata for existing API models. Editing these records does not host a model or change the Gemini integration. The model key is a catalog identifier, not a credential.' },
  { slug: 'llm-providers', table: 'llm_providers', title: 'LLM Providers', mode: 'crud', fields: [name], search: ['name'], description: 'Provider metadata, such as Google. This catalog does not configure or replace the generation API. Providers referenced by models cannot be deleted.' },
  { slug: 'allowed-signup-domains', table: 'allowed_signup_domains', title: 'Allowed Signup Domains', mode: 'crud', fields: [{ key: 'domain', label: 'Domain', kind: 'domain', required: true, max: 253 }], search: ['domain'], description: 'Manage the domain list. These records do not change current signup rules or grant admin access.' },
  { slug: 'whitelisted-emails', table: 'whitelisted_emails', title: 'Whitelisted Emails', mode: 'crud', fields: [{ key: 'email', label: 'Email address', kind: 'email', required: true, max: 254 }], search: ['email'], description: 'Manage the email list. These records do not change current signup rules or grant admin access.' },
];
export function resourceFor(slug: string) { return resources.find(r => r.slug === slug); }
export type AdminRow = { id: string; created_at?: string; [key: string]: string | number | null | undefined };
export type Option = { id: string; label: string };
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const domainValid = (s: string) => s.length <= 253 && /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(s);
export function emailValid(s: string) {
  const [local, domain, extra] = s.split('@');
  return extra === undefined && !!local && local.length <= 64 && s.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) && !/(^\.|\.$|\.\.)/.test(local) && !!domain && domainValid(domain);
}
export function parseResource(resource: Resource, form: FormData): { values?: Record<string, string | number | null>; error?: string } {
  const values: Record<string, string | number | null> = {};
  for (const field of resource.fields) {
    if (resource.mode === 'update' && field.key !== 'weight') continue;
    const raw = form.get(field.key);
    if (raw !== null && typeof raw !== 'string') return { error: `${field.label} must be text.` };
    let value = (raw ?? '').trim();
    if (!value) { if (field.required) return { error: `${field.label} is required.` }; values[field.key] = null; continue; }
    if (value.length > (field.max ?? 50000)) return { error: `${field.label} is too long (maximum ${field.max ?? 50000} characters).` };
    if (field.kind === 'domain' || field.kind === 'email') value = value.toLowerCase();
    if (field.kind === 'domain' && !domainValid(value)) return { error: 'Enter a domain such as example.edu, without a URL or @.' };
    if (field.kind === 'email' && !emailValid(value)) return { error: 'Enter a valid email address.' };
    if (field.kind === 'uuid' && !isUuid(value)) return { error: `Choose a valid ${field.label.toLowerCase()}.` };
    if (field.kind === 'media' && (!/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > BigInt("9223372036854775807"))) return { error: 'Choose a valid media ID.' };
    if (field.kind === 'weight') {
      if (!/^\d+(\.\d{1,4})?$/.test(value) || Number(value) > 1000000) return { error: 'Weight must be between 0 and 1,000,000 with at most four decimal places.' };
      values[field.key] = Number(value);
    } else values[field.key] = value;
  }
  return { values };
}
export function adminError(error: { code?: string } | null) {
  switch (error?.code) {
    case '42P01': case '42703': case 'PGRST204': case 'PGRST205': return 'Week 7 database setup is missing or outdated. Run supabase/migrations/202610290001_week7_admin.sql and refresh.';
    case '23505': return 'This record already exists. Use a unique value.';
    case '23001': case '23503': return 'A related record is missing, or other records still reference this item. Refresh the selections; remove those associations before deleting.';
    case '23514': case '23502': case '22P02': case '22003': return 'The values do not satisfy the database constraints. Check the fields and try again.';
    case '42501': return 'Database permission denied. Check the server configuration; no permissions were changed.';
    default: return 'The database operation could not be completed. Refresh and try again.';
  }
}
