-- ETOS Assessment Center — performance hardening

create index if not exists assessment_answers_question_idx on public.assessment_answers(question_id);
create index if not exists assessment_periods_created_by_idx on public.assessment_periods(created_by);
create index if not exists assessment_questions_module_idx on public.assessment_questions(module_id);
create index if not exists assessment_sessions_period_idx on public.assessment_sessions(period_id);
create index if not exists assessment_signals_question_idx on public.assessment_signals(question_id);
create index if not exists assessment_signals_resolved_by_idx on public.assessment_signals(resolved_by);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);
create index if not exists facilitator_assignments_awardee_idx on public.facilitator_assignments(awardee_id);
create index if not exists followups_created_by_idx on public.followups(created_by);
create index if not exists followups_pic_idx on public.followups(pic);
create index if not exists followups_session_idx on public.followups(session_id);
create index if not exists generated_documents_awardee_idx on public.generated_documents(awardee_id);
create index if not exists generated_documents_generated_by_idx on public.generated_documents(generated_by);
create index if not exists generated_documents_session_idx on public.generated_documents(session_id);

alter policy profiles_select_self on public.profiles
using (id = (select auth.uid()) or private.has_permission('assessment.manage'));

alter policy assignments_select_own on public.facilitator_assignments
using (facilitator_id = (select auth.uid()) or private.has_permission('assessment.manage'));

alter policy followups_insert_assigned on public.followups
with check (
  private.has_permission('assessment.manage')
  and private.is_assigned_awardee(awardee_id)
  and created_by = (select auth.uid())
);
