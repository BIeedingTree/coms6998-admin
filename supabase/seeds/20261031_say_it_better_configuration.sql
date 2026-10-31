-- Optional descriptive Week 7 metadata. Review before running in Supabase SQL Editor.
-- Verified against coms6998e/app/actions.ts on 2026-10-31; this does not configure
-- or change the running Gemini integration. No historical requests or outputs copied.
begin;
do $$
declare
  v_provider uuid;
  v_model uuid;
  v_chain uuid;
begin
  insert into public.llm_providers(name) values ('Google Gemini')
  on conflict (name) do nothing;
  select id into v_provider from public.llm_providers where name = 'Google Gemini';
  insert into public.llm_models(provider_id, name, model_key)
  values (v_provider, 'Gemini 3.5 Flash Lite', 'gemini-3.5-flash-lite')
  on conflict (provider_id, model_key) do nothing;
  select id into v_model from public.llm_models
    where provider_id = v_provider and model_key = 'gemini-3.5-flash-lite';

  insert into public.prompt_chains(name, description)
  values ('Say It Better draft generation',
    'Descriptive catalog of the current coms6998e/app/actions.ts workflow: build one prompt from message type, category, situation, recipient, and tone; call Google Gemini once; parse JSON subject/message; save the result to captions. This database configuration is not executed by the app.')
  on conflict (name) do nothing;
  select id into v_chain from public.prompt_chains where name = 'Say It Better draft generation';
  insert into public.prompt_chain_steps(chain_id, name, step_order, prompt, model_id)
  values (v_chain, 'Build prompt and call Gemini', 1,
    'Current source: coms6998e/app/actions.ts. The single prompt begins "You are an expert at helping people phrase difficult or awkward messages clearly and naturally." It includes the selected message type and category, the user situation, recipient, desired tone, and instructions for one ready-to-send message. The API requests JSON with subject and message. This row documents the existing single call; it is not a runtime prompt template.',
    v_model)
  on conflict (chain_id, step_order) do nothing;
  -- Existing migration trigger creates this row for a new chain. Cover older or
  -- manually inserted chains without changing an existing weight.
  insert into public.prompt_chain_mix(chain_id, weight) values (v_chain, 1)
  on conflict (chain_id) do nothing;

  insert into public.terms(term, definition) values
    ('Situation', 'The user-provided context that the Say It Better prompt asks Gemini to turn into a ready-to-send message.'),
    ('Desired tone', 'The user-selected writing style included in the generation prompt; the prompt defaults to Natural when none is supplied.'),
    ('Message type', 'The email, message, or other format selected before generation; email output may include a subject.'),
    ('Saved output', 'The parsed message from the Gemini response stored as captions.caption_text after a successful generation.')
  on conflict (term) do nothing;

  insert into public.allowed_signup_domains(domain) values ('columbia.edu'), ('barnard.edu')
  on conflict (domain) do nothing;
end $$;
commit;
-- Intentionally no whitelisted emails or copied examples. Existing media may
-- contain private user text; select and approve any source rows before copying.
