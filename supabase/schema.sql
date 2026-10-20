-- TechJob AI — Supabase schema
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste this file → Run.
-- Every table is protected by Row Level Security: a signed-in user can read and change only their own rows.

-- ---------- profiles ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  exp_years     int check (exp_years between 0 and 60),
  skills        text[] not null default '{}',
  roles         text[] not null default '{}',
  region        text not null default 'all',
  work_model    text not null default 'any',
  salary_min    int,
  cv_path       text,
  cv_name       text,
  cv_size_kb    int,
  cv_uploaded_at timestamptz,
  alerts_on     boolean not null default true,
  alerts_freq   text not null default 'יומית',
  terms_accepted_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- saved searches ----------
create table if not exists public.saved_searches (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name       text not null,
  role       text,
  query_text text not null default '',
  region     text not null default 'all',
  work_model text not null default 'any',
  created_at timestamptz not null default now()
);
create index if not exists saved_searches_user on public.saved_searches(user_id);

-- ---------- saved jobs (snapshot kept so the list survives when a job closes) ----------
create table if not exists public.saved_jobs (
  user_id  uuid not null references auth.users(id) on delete cascade default auth.uid(),
  job_id   text not null,
  job      jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- ---------- applications tracker ----------
create table if not exists public.applications (
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  job_id     text not null,
  job        jsonb not null,
  status     text not null default 'נשלח' check (status in ('נשלח','ראיון','משימה','הצעה','נדחה')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- ---------- likes / dislikes (features snapshot feeds the learning) ----------
create table if not exists public.job_feedback (
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  job_id     text not null,
  value      smallint not null check (value in (-1, 1)),
  features   jsonb not null,          -- {roles, skills, company, seniority, model, groups}
  created_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- ---------- alerts already seen ----------
create table if not exists public.alert_seen (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  job_id  text not null,
  seen_at timestamptz not null default now(),
  primary key (user_id, job_id)
);

-- ---------- Row Level Security ----------
alter table public.profiles       enable row level security;
alter table public.saved_searches enable row level security;
alter table public.saved_jobs     enable row level security;
alter table public.applications   enable row level security;
alter table public.job_feedback   enable row level security;
alter table public.alert_seen     enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['saved_searches','saved_jobs','applications','job_feedback','alert_seen'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------- create a profile row on sign-up ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, terms_accepted_at)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          now())
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- let a user delete their own account and all data ----------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- the app removes the CV file from Storage before calling this function
  delete from auth.users where id = auth.uid();   -- cascades to every table above
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------- private storage for CVs: files live under "<user id>/..." ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 10485760,
        array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

drop policy if exists "cv owner read"   on storage.objects;
drop policy if exists "cv owner write"  on storage.objects;
drop policy if exists "cv owner update" on storage.objects;
drop policy if exists "cv owner delete" on storage.objects;
create policy "cv owner read"   on storage.objects for select using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cv owner write"  on storage.objects for insert with check (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cv owner update" on storage.objects for update using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "cv owner delete" on storage.objects for delete using (bucket_id = 'cvs' and (storage.foldername(name))[1] = auth.uid()::text);
