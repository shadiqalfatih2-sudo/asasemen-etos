-- ETOS Assessment Center — security hardening
-- Move SECURITY DEFINER authorization helpers out of the exposed public schema.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.has_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (p.role = 'superadmin' or required_permission = any(p.permissions))
  );
$$;

revoke all on function private.has_permission(text) from public, anon;
grant execute on function private.has_permission(text) to authenticated;

create or replace function private.is_assigned_awardee(target_awardee uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and (
        p.role in ('superadmin','coordinator')
        or exists (
          select 1 from public.facilitator_assignments fa
          where fa.facilitator_id = auth.uid()
            and fa.awardee_id = target_awardee
        )
      )
  );
$$;

revoke all on function private.is_assigned_awardee(uuid) from public, anon;
grant execute on function private.is_assigned_awardee(uuid) to authenticated;

alter policy profiles_select_self on public.profiles using (id = auth.uid() or private.has_permission('assessment.manage'));
alter policy periods_select_internal on public.assessment_periods using (private.has_permission('assessment.view'));
alter policy modules_select_internal on public.assessment_modules using (private.has_permission('assessment.view'));
alter policy questions_select_internal on public.assessment_questions using (
  private.has_permission('assessment.view') and (
    sensitivity = 'standard' or private.has_permission('assessment.view_private')
  )
);
alter policy awardees_select_assigned on public.awardees using (
  private.has_permission('assessment.view') and private.is_assigned_awardee(id)
);
alter policy assignments_select_own on public.facilitator_assignments using (
  facilitator_id = auth.uid() or private.has_permission('assessment.manage')
);
alter policy sessions_select_assigned on public.assessment_sessions using (
  private.has_permission('assessment.view') and private.is_assigned_awardee(awardee_id)
);
alter policy results_select_assigned on public.assessment_results using (
  exists (
    select 1 from public.assessment_sessions s
    where s.id = assessment_results.session_id
      and private.is_assigned_awardee(s.awardee_id)
      and private.has_permission('assessment.view')
  )
);
alter policy answers_select_authorized on public.assessment_answers using (
  exists (
    select 1
    from public.assessment_sessions s
    join public.assessment_questions q on q.id = assessment_answers.question_id
    where s.id = assessment_answers.session_id
      and private.is_assigned_awardee(s.awardee_id)
      and private.has_permission('assessment.view')
      and (q.sensitivity = 'standard' or private.has_permission('assessment.view_private'))
  )
);
alter policy signals_select_private on public.assessment_signals using (
  private.has_permission('assessment.view_private') and exists (
    select 1 from public.assessment_sessions s
    where s.id = assessment_signals.session_id
      and private.is_assigned_awardee(s.awardee_id)
  )
);
alter policy followups_select_assigned on public.followups using (
  private.has_permission('assessment.view') and private.is_assigned_awardee(awardee_id)
);
alter policy followups_insert_assigned on public.followups with check (
  private.has_permission('assessment.manage')
  and private.is_assigned_awardee(awardee_id)
  and created_by = auth.uid()
);
alter policy followups_update_assigned on public.followups using (
  private.has_permission('assessment.manage') and private.is_assigned_awardee(awardee_id)
) with check (
  private.has_permission('assessment.manage') and private.is_assigned_awardee(awardee_id)
);
alter policy documents_select_export on public.generated_documents using (
  private.has_permission('assessment.export') and private.is_assigned_awardee(awardee_id)
);
alter policy audit_select_admin on public.audit_logs using (private.has_permission('assessment.manage'));

drop function public.has_permission(text);
drop function public.is_assigned_awardee(uuid);
