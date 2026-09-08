-- ETOS Assessment Center — initial schema
-- New standalone Supabase project only.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('superadmin','coordinator','facilitator')) default 'facilitator',
  permissions text[] not null default array['assessment.view']::text[],
  region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.awardees (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  full_name text not null,
  campus text,
  major text,
  cohort text,
  region text,
  status text not null default 'active',
  photo_url text,
  phone_last4_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.facilitator_assignments (
  id uuid primary key default gen_random_uuid(),
  facilitator_id uuid not null references public.profiles(id) on delete cascade,
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  unique(facilitator_id, awardee_id)
);

create table public.assessment_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  academic_year text not null,
  semester smallint not null check (semester in (1,2)),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(academic_year, semester)
);

create table public.assessment_modules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  subtitle text,
  reflection_question text,
  sort_order integer not null,
  is_restricted boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.assessment_modules(id) on delete cascade,
  code text not null unique,
  statement text not null,
  dimension text not null,
  direction smallint not null default 1 check (direction in (-1,1)),
  weight numeric(7,3) not null default 1,
  sensitivity text not null default 'standard' check (sensitivity in ('standard','private','signal')),
  interpretation_group text,
  sort_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  period_id uuid not null references public.assessment_periods(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress','completed','expired')),
  verification_expires_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_activity_at timestamptz not null default now(),
  unique(awardee_id, period_id)
);

create table public.assessment_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions(id) on delete cascade,
  question_id uuid not null references public.assessment_questions(id) on delete cascade,
  selected boolean not null,
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(session_id, question_id)
);

create table public.assessment_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.assessment_sessions(id) on delete cascade,
  summary jsonb not null default '{}'::jsonb,
  dimensions jsonb not null default '{}'::jsonb,
  career_orientation jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  scoring_version text not null default 'v1'
);

create table public.assessment_signals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions(id) on delete cascade,
  question_id uuid references public.assessment_questions(id) on delete set null,
  signal_code text not null,
  title text not null,
  severity text not null default 'review' check (severity in ('info','review','priority')),
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id)
);

create table public.followups (
  id uuid primary key default gen_random_uuid(),
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  session_id uuid references public.assessment_sessions(id) on delete set null,
  category text not null,
  signal text,
  notes text,
  action_plan text,
  pic uuid references public.profiles(id),
  deadline date,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.generated_documents (
  id uuid primary key default gen_random_uuid(),
  awardee_id uuid not null references public.awardees(id) on delete cascade,
  session_id uuid references public.assessment_sessions(id) on delete cascade,
  document_type text not null check (document_type in ('raw_answers','comprehensive_report')),
  storage_path text not null,
  classification text not null default 'CONFIDENTIAL',
  generated_by uuid references public.profiles(id),
  generated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index awardees_name_idx on public.awardees using gin (to_tsvector('simple', full_name));
create index assignments_facilitator_idx on public.facilitator_assignments(facilitator_id);
create index answers_session_idx on public.assessment_answers(session_id);
create index signals_session_idx on public.assessment_signals(session_id, is_resolved);
create index followups_awardee_idx on public.followups(awardee_id, status);
create index audit_created_idx on public.audit_logs(created_at desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger awardees_touch before update on public.awardees for each row execute function public.touch_updated_at();
create trigger answers_touch before update on public.assessment_answers for each row execute function public.touch_updated_at();
create trigger followups_touch before update on public.followups for each row execute function public.touch_updated_at();

-- Authorization helper. Authorization data comes from database-controlled profile rows,
-- never from user-editable auth user metadata.
create or replace function public.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (p.role = 'superadmin' or required_permission = any(p.permissions))
  );
$$;

revoke all on function public.has_permission(text) from public;
grant execute on function public.has_permission(text) to authenticated;

create or replace function public.is_assigned_awardee(target_awardee uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true
      and (
        p.role in ('superadmin','coordinator')
        or exists (
          select 1 from public.facilitator_assignments fa
          where fa.facilitator_id = auth.uid() and fa.awardee_id = target_awardee
        )
      )
  );
$$;

revoke all on function public.is_assigned_awardee(uuid) from public;
grant execute on function public.is_assigned_awardee(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.awardees enable row level security;
alter table public.facilitator_assignments enable row level security;
alter table public.assessment_periods enable row level security;
alter table public.assessment_modules enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.assessment_answers enable row level security;
alter table public.assessment_results enable row level security;
alter table public.assessment_signals enable row level security;
alter table public.followups enable row level security;
alter table public.generated_documents enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: authenticated users can read only themselves; management happens server-side/admin.
create policy profiles_select_self on public.profiles for select to authenticated using (id = auth.uid() or public.has_permission('assessment.manage'));

-- Non-sensitive definitions are readable by authenticated internal users.
create policy periods_select_internal on public.assessment_periods for select to authenticated using (public.has_permission('assessment.view'));
create policy modules_select_internal on public.assessment_modules for select to authenticated using (public.has_permission('assessment.view'));
create policy questions_select_internal on public.assessment_questions for select to authenticated using (
  public.has_permission('assessment.view') and (
    sensitivity = 'standard' or public.has_permission('assessment.view_private')
  )
);

-- Awardee records are visible only when assigned / coordinator / superadmin.
create policy awardees_select_assigned on public.awardees for select to authenticated using (
  public.has_permission('assessment.view') and public.is_assigned_awardee(id)
);
create policy assignments_select_own on public.facilitator_assignments for select to authenticated using (
  facilitator_id = auth.uid() or public.has_permission('assessment.manage')
);

-- Session/result visibility follows awardee assignment.
create policy sessions_select_assigned on public.assessment_sessions for select to authenticated using (
  public.has_permission('assessment.view') and public.is_assigned_awardee(awardee_id)
);
create policy results_select_assigned on public.assessment_results for select to authenticated using (
  exists (
    select 1 from public.assessment_sessions s
    where s.id = assessment_results.session_id
      and public.is_assigned_awardee(s.awardee_id)
      and public.has_permission('assessment.view')
  )
);

-- Raw answers: standard questions need assessment.view; private/signal answers additionally need view_private.
create policy answers_select_authorized on public.assessment_answers for select to authenticated using (
  exists (
    select 1
    from public.assessment_sessions s
    join public.assessment_questions q on q.id = assessment_answers.question_id
    where s.id = assessment_answers.session_id
      and public.is_assigned_awardee(s.awardee_id)
      and public.has_permission('assessment.view')
      and (q.sensitivity = 'standard' or public.has_permission('assessment.view_private'))
  )
);

create policy signals_select_private on public.assessment_signals for select to authenticated using (
  public.has_permission('assessment.view_private') and exists (
    select 1 from public.assessment_sessions s
    where s.id = assessment_signals.session_id and public.is_assigned_awardee(s.awardee_id)
  )
);

create policy followups_select_assigned on public.followups for select to authenticated using (
  public.has_permission('assessment.view') and public.is_assigned_awardee(awardee_id)
);
create policy followups_insert_assigned on public.followups for insert to authenticated with check (
  public.has_permission('assessment.manage') and public.is_assigned_awardee(awardee_id) and created_by = auth.uid()
);
create policy followups_update_assigned on public.followups for update to authenticated using (
  public.has_permission('assessment.manage') and public.is_assigned_awardee(awardee_id)
) with check (
  public.has_permission('assessment.manage') and public.is_assigned_awardee(awardee_id)
);

create policy documents_select_export on public.generated_documents for select to authenticated using (
  public.has_permission('assessment.export') and public.is_assigned_awardee(awardee_id)
);
create policy audit_select_admin on public.audit_logs for select to authenticated using (public.has_permission('assessment.manage'));

-- Intentionally no anon policies and no client INSERT/UPDATE policies for sessions/answers.
-- Awardee verification and autosave must run through protected server endpoints using the server secret.
