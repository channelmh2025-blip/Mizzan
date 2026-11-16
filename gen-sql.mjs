// يولّد supabase/schema.sql من js/schema.js حتى لا يختلف تعريف القاعدة عن التطبيق
import { TABLES } from '../js/schema.js';
import { writeFileSync } from 'node:fs';

const T = { text: 'text', numeric: 'numeric(18,3)', int: 'integer', boolean: 'boolean', date: 'date', timestamptz: 'timestamptz', jsonb: 'jsonb' };
let out = `-- ميزان: مخطط قاعدة البيانات (مولَّد آلياً من js/schema.js — لا تعدّله يدوياً)
-- شغّل هذا الملف مرة واحدة في Supabase: SQL Editor > New query > Run
-- آمن لإعادة التشغيل (idempotent).

-- دالة مشتركة: ختم وقت الخادم + حسم التعارض (آخر تعديل يفوز)
create or replace function public.mizan_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.updated_at < old.updated_at then
      return null;               -- تعديل أقدم من الموجود: يُتجاهل
    end if;
    new.user_id := old.user_id;  -- لا يمكن نقل صف إلى مستخدم آخر
    new.created_at := old.created_at;
  end if;
  new.synced_at := now();
  return new;
end $$;
`;
for (const [name, cols] of Object.entries(TABLES)) {
  const lines = [
    '  id uuid primary key',
    '  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade',
    '  created_at timestamptz not null default now()',
    '  updated_at timestamptz not null default now()',
    '  deleted boolean not null default false',
    '  synced_at timestamptz not null default now()',
  ];
  for (const [c, t] of Object.entries(cols)) {
    const [type, ref] = t.split('>');
    lines.push(`  ${c} ${ref ? `uuid references public.${ref}(id)` : T[type]}`);
  }
  out += `
-- ───────────── ${name} ─────────────
create table if not exists public.${name} (
${lines.join(',\n')}
);
create index if not exists ${name}_user_sync_idx on public.${name} (user_id, synced_at);
alter table public.${name} enable row level security;
drop policy if exists ${name}_select on public.${name};
drop policy if exists ${name}_insert on public.${name};
drop policy if exists ${name}_update on public.${name};
drop policy if exists ${name}_delete on public.${name};
create policy ${name}_select on public.${name} for select to authenticated using (user_id = (select auth.uid()));
create policy ${name}_insert on public.${name} for insert to authenticated with check (user_id = (select auth.uid()));
create policy ${name}_update on public.${name} for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy ${name}_delete on public.${name} for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists ${name}_touch on public.${name};
create trigger ${name}_touch before insert or update on public.${name} for each row execute function public.mizan_touch();
`;
}
out += `
create index if not exists transactions_user_date_idx on public.transactions (user_id, date);

-- المزامنة الفورية (Realtime)
do $$
declare t text;
begin
  foreach t in array array[${Object.keys(TABLES).map(n => `'${n}'`).join(', ')}] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
`;
writeFileSync(new URL('../supabase/schema.sql', import.meta.url), out);
console.log('schema.sql written', out.length);
