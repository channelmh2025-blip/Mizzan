-- ميزان: مخطط قاعدة البيانات (مولَّد آلياً من js/schema.js — لا تعدّله يدوياً)
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

-- ───────────── settings ─────────────
create table if not exists public.settings (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  base_currency text,
  display_currency text,
  rates jsonb,
  rates_updated_at timestamptz,
  rates_source text,
  currencies jsonb,
  prefs jsonb
);
create index if not exists settings_user_sync_idx on public.settings (user_id, synced_at);
alter table public.settings enable row level security;
drop policy if exists settings_select on public.settings;
drop policy if exists settings_insert on public.settings;
drop policy if exists settings_update on public.settings;
drop policy if exists settings_delete on public.settings;
create policy settings_select on public.settings for select to authenticated using (user_id = (select auth.uid()));
create policy settings_insert on public.settings for insert to authenticated with check (user_id = (select auth.uid()));
create policy settings_update on public.settings for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy settings_delete on public.settings for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before insert or update on public.settings for each row execute function public.mizan_touch();

-- ───────────── accounts ─────────────
create table if not exists public.accounts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  name text,
  type text,
  currency text,
  opening_balance numeric(18,3),
  opening_date date,
  archived boolean,
  sort integer,
  notes text
);
create index if not exists accounts_user_sync_idx on public.accounts (user_id, synced_at);
alter table public.accounts enable row level security;
drop policy if exists accounts_select on public.accounts;
drop policy if exists accounts_insert on public.accounts;
drop policy if exists accounts_update on public.accounts;
drop policy if exists accounts_delete on public.accounts;
create policy accounts_select on public.accounts for select to authenticated using (user_id = (select auth.uid()));
create policy accounts_insert on public.accounts for insert to authenticated with check (user_id = (select auth.uid()));
create policy accounts_update on public.accounts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy accounts_delete on public.accounts for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists accounts_touch on public.accounts;
create trigger accounts_touch before insert or update on public.accounts for each row execute function public.mizan_touch();

-- ───────────── categories ─────────────
create table if not exists public.categories (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  name text,
  icon text,
  color text,
  archived boolean,
  sort integer
);
create index if not exists categories_user_sync_idx on public.categories (user_id, synced_at);
alter table public.categories enable row level security;
drop policy if exists categories_select on public.categories;
drop policy if exists categories_insert on public.categories;
drop policy if exists categories_update on public.categories;
drop policy if exists categories_delete on public.categories;
create policy categories_select on public.categories for select to authenticated using (user_id = (select auth.uid()));
create policy categories_insert on public.categories for insert to authenticated with check (user_id = (select auth.uid()));
create policy categories_update on public.categories for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy categories_delete on public.categories for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists categories_touch on public.categories;
create trigger categories_touch before insert or update on public.categories for each row execute function public.mizan_touch();

-- ───────────── debts ─────────────
create table if not exists public.debts (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  name text,
  creditor text,
  kind text,
  currency text,
  total numeric(18,3),
  paid_before numeric(18,3),
  monthly numeric(18,3),
  start_date date,
  due_day integer,
  end_date date,
  notes text
);
create index if not exists debts_user_sync_idx on public.debts (user_id, synced_at);
alter table public.debts enable row level security;
drop policy if exists debts_select on public.debts;
drop policy if exists debts_insert on public.debts;
drop policy if exists debts_update on public.debts;
drop policy if exists debts_delete on public.debts;
create policy debts_select on public.debts for select to authenticated using (user_id = (select auth.uid()));
create policy debts_insert on public.debts for insert to authenticated with check (user_id = (select auth.uid()));
create policy debts_update on public.debts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy debts_delete on public.debts for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists debts_touch on public.debts;
create trigger debts_touch before insert or update on public.debts for each row execute function public.mizan_touch();

-- ───────────── jamiyas ─────────────
create table if not exists public.jamiyas (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  name text,
  type text,
  currency text,
  monthly numeric(18,3),
  members integer,
  months integer,
  start_date date,
  pay_day integer,
  my_turn integer,
  payout_amount numeric(18,3),
  status text,
  notes text
);
create index if not exists jamiyas_user_sync_idx on public.jamiyas (user_id, synced_at);
alter table public.jamiyas enable row level security;
drop policy if exists jamiyas_select on public.jamiyas;
drop policy if exists jamiyas_insert on public.jamiyas;
drop policy if exists jamiyas_update on public.jamiyas;
drop policy if exists jamiyas_delete on public.jamiyas;
create policy jamiyas_select on public.jamiyas for select to authenticated using (user_id = (select auth.uid()));
create policy jamiyas_insert on public.jamiyas for insert to authenticated with check (user_id = (select auth.uid()));
create policy jamiyas_update on public.jamiyas for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy jamiyas_delete on public.jamiyas for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists jamiyas_touch on public.jamiyas;
create trigger jamiyas_touch before insert or update on public.jamiyas for each row execute function public.mizan_touch();

-- ───────────── goals ─────────────
create table if not exists public.goals (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  name text,
  type text,
  currency text,
  target numeric(18,3),
  target_date date,
  monthly_plan numeric(18,3),
  archived boolean,
  notes text
);
create index if not exists goals_user_sync_idx on public.goals (user_id, synced_at);
alter table public.goals enable row level security;
drop policy if exists goals_select on public.goals;
drop policy if exists goals_insert on public.goals;
drop policy if exists goals_update on public.goals;
drop policy if exists goals_delete on public.goals;
create policy goals_select on public.goals for select to authenticated using (user_id = (select auth.uid()));
create policy goals_insert on public.goals for insert to authenticated with check (user_id = (select auth.uid()));
create policy goals_update on public.goals for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy goals_delete on public.goals for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists goals_touch on public.goals;
create trigger goals_touch before insert or update on public.goals for each row execute function public.mizan_touch();

-- ───────────── recurring ─────────────
create table if not exists public.recurring (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  kind text,
  name text,
  amount numeric(18,3),
  currency text,
  account_id uuid references public.accounts(id),
  category_id uuid references public.categories(id),
  income_type text,
  payment_method text,
  day integer,
  start_date date,
  end_date date,
  active boolean,
  notes text
);
create index if not exists recurring_user_sync_idx on public.recurring (user_id, synced_at);
alter table public.recurring enable row level security;
drop policy if exists recurring_select on public.recurring;
drop policy if exists recurring_insert on public.recurring;
drop policy if exists recurring_update on public.recurring;
drop policy if exists recurring_delete on public.recurring;
create policy recurring_select on public.recurring for select to authenticated using (user_id = (select auth.uid()));
create policy recurring_insert on public.recurring for insert to authenticated with check (user_id = (select auth.uid()));
create policy recurring_update on public.recurring for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy recurring_delete on public.recurring for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists recurring_touch on public.recurring;
create trigger recurring_touch before insert or update on public.recurring for each row execute function public.mizan_touch();

-- ───────────── budgets ─────────────
create table if not exists public.budgets (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  category_id uuid references public.categories(id),
  amount numeric(18,3),
  currency text,
  effective_from text
);
create index if not exists budgets_user_sync_idx on public.budgets (user_id, synced_at);
alter table public.budgets enable row level security;
drop policy if exists budgets_select on public.budgets;
drop policy if exists budgets_insert on public.budgets;
drop policy if exists budgets_update on public.budgets;
drop policy if exists budgets_delete on public.budgets;
create policy budgets_select on public.budgets for select to authenticated using (user_id = (select auth.uid()));
create policy budgets_insert on public.budgets for insert to authenticated with check (user_id = (select auth.uid()));
create policy budgets_update on public.budgets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy budgets_delete on public.budgets for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists budgets_touch on public.budgets;
create trigger budgets_touch before insert or update on public.budgets for each row execute function public.mizan_touch();

-- ───────────── transactions ─────────────
create table if not exists public.transactions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  synced_at timestamptz not null default now(),
  kind text,
  status text,
  date date,
  amount numeric(18,3),
  currency text,
  rates jsonb,
  account_id uuid references public.accounts(id),
  to_account_id uuid references public.accounts(id),
  to_amount numeric(18,3),
  category_id uuid references public.categories(id),
  payment_method text,
  income_type text,
  is_fixed boolean,
  description text,
  notes text,
  debt_id uuid references public.debts(id),
  jamiya_id uuid references public.jamiyas(id),
  goal_id uuid references public.goals(id),
  recurring_id uuid references public.recurring(id),
  period text
);
create index if not exists transactions_user_sync_idx on public.transactions (user_id, synced_at);
alter table public.transactions enable row level security;
drop policy if exists transactions_select on public.transactions;
drop policy if exists transactions_insert on public.transactions;
drop policy if exists transactions_update on public.transactions;
drop policy if exists transactions_delete on public.transactions;
create policy transactions_select on public.transactions for select to authenticated using (user_id = (select auth.uid()));
create policy transactions_insert on public.transactions for insert to authenticated with check (user_id = (select auth.uid()));
create policy transactions_update on public.transactions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy transactions_delete on public.transactions for delete to authenticated using (user_id = (select auth.uid()));
drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before insert or update on public.transactions for each row execute function public.mizan_touch();

create index if not exists transactions_user_date_idx on public.transactions (user_id, date);

-- المزامنة الفورية (Realtime)
do $$
declare t text;
begin
  foreach t in array array['settings', 'accounts', 'categories', 'debts', 'jamiyas', 'goals', 'recurring', 'budgets', 'transactions'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
