-- Secure per-user P.E.D.R.O. conversation history.
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists "ai_conversations_own_read" on public.ai_conversations;
create policy "ai_conversations_own_read"
on public.ai_conversations for select to authenticated
using (user_id = auth.uid());

drop policy if exists "ai_conversations_own_insert" on public.ai_conversations;
create policy "ai_conversations_own_insert"
on public.ai_conversations for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists "ai_conversations_own_update" on public.ai_conversations;
create policy "ai_conversations_own_update"
on public.ai_conversations for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "ai_conversations_own_delete" on public.ai_conversations;
create policy "ai_conversations_own_delete"
on public.ai_conversations for delete to authenticated
using (user_id = auth.uid());

drop policy if exists "ai_messages_own_read" on public.ai_messages;
create policy "ai_messages_own_read"
on public.ai_messages for select to authenticated
using (exists (
  select 1 from public.ai_conversations c
  where c.conversations_id = ai_messages.conversatioon_id
    and c.user_id = auth.uid()
));

drop policy if exists "ai_messages_own_insert" on public.ai_messages;
create policy "ai_messages_own_insert"
on public.ai_messages for insert to authenticated
with check (exists (
  select 1 from public.ai_conversations c
  where c.conversations_id = ai_messages.conversatioon_id
    and c.user_id = auth.uid()
));

drop policy if exists "ai_messages_own_delete" on public.ai_messages;
create policy "ai_messages_own_delete"
on public.ai_messages for delete to authenticated
using (exists (
  select 1 from public.ai_conversations c
  where c.conversations_id = ai_messages.conversatioon_id
    and c.user_id = auth.uid()
));

create index if not exists ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc);

create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (conversatioon_id, created_at);
