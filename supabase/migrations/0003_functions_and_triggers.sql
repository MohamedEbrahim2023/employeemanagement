-- ============================================================================
-- Migration 0003: Atomic Transactional Functions & Immutability Triggers
-- ============================================================================

-- Prevent non-admin users from altering protected profile columns
CREATE OR REPLACE FUNCTION public.enforce_profile_column_security()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_admin(OLD.organization_id) THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.employee_number IS DISTINCT FROM OLD.employee_number
       OR NEW.account_status IS DISTINCT FROM OLD.account_status
       OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.department IS DISTINCT FROM OLD.department
       OR NEW.job_title IS DISTINCT FROM OLD.job_title THEN
      RAISE EXCEPTION 'UNAUTHORIZED_FIELD_MODIFICATION: Ordinary employees may only update full_name and avatar_url.';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_column_security ON public.profiles;
CREATE TRIGGER trg_profile_column_security
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_column_security();

-- Prevent any UPDATE or DELETE on append-only audit and progress history tables
CREATE OR REPLACE FUNCTION public.prevent_immutable_table_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RECORD_VIOLATION: Table % is append-only and cannot be modified or deleted.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_activity_logs ON public.activity_logs;
CREATE TRIGGER trg_immutable_activity_logs
  BEFORE UPDATE OR DELETE ON public.activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_table_mutation();

DROP TRIGGER IF EXISTS trg_immutable_progress_updates ON public.task_progress_updates;
CREATE TRIGGER trg_immutable_progress_updates
  BEFORE UPDATE OR DELETE ON public.task_progress_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_table_mutation();

DROP TRIGGER IF EXISTS trg_immutable_task_reviews ON public.task_reviews;
CREATE TRIGGER trg_immutable_task_reviews
  BEFORE UPDATE OR DELETE ON public.task_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_immutable_table_mutation();

-- Atomic RPC 1: Employee Starts an Assigned Task
CREATE OR REPLACE FUNCTION public.start_task_assignment(
  p_assignment_id UUID,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS public.task_assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.task_assignments;
  v_task public.tasks;
  v_actor_name TEXT;
  v_admin RECORD;
BEGIN
  SELECT * INTO v_assignment
  FROM public.task_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Task assignment does not exist.';
  END IF;

  IF v_assignment.employee_id <> auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN: You are not assigned to this task.';
  END IF;

  IF v_assignment.organization_id <> public.current_user_org_id() THEN
    RAISE EXCEPTION 'FORBIDDEN: Inactive or unauthorized account.';
  END IF;

  IF v_assignment.status <> 'not_started' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Only tasks in not_started status can be started.';
  END IF;

  IF p_expected_version IS NOT NULL AND v_assignment.version <> p_expected_version THEN
    RAISE EXCEPTION 'CONFLICT: Assignment was modified by another request.';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_assignment.task_id;
  IF v_task.task_status = 'canceled' THEN
    RAISE EXCEPTION 'INVALID_STATE: Cannot start a canceled task.';
  END IF;

  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = auth.uid();

  UPDATE public.task_assignments
  SET status = 'in_progress',
      started_at = COALESCE(started_at, now()),
      version = version + 1,
      updated_at = now()
  WHERE id = p_assignment_id
  RETURNING * INTO v_assignment;

  INSERT INTO public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_assignment.organization_id,
    auth.uid(),
    'task.started',
    'task_assignment',
    v_assignment.id,
    jsonb_build_object('task_id', v_task.id, 'task_title', v_task.title)
  );

  FOR v_admin IN
    SELECT ur.user_id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.organization_id = v_assignment.organization_id
      AND ur.role = 'admin'
      AND p.account_status = 'active'
      AND p.deleted_at IS NULL
  LOOP
    INSERT INTO public.notifications (
      organization_id, recipient_id, actor_id, event_type, title, body,
      related_task_id, related_assignment_id, idempotency_key
    ) VALUES (
      v_assignment.organization_id,
      v_admin.user_id,
      auth.uid(),
      'task_started',
      'Task Started: ' || v_task.title,
      v_actor_name || ' started working on "' || v_task.title || '".',
      v_task.id,
      v_assignment.id,
      'start:' || v_assignment.id || ':' || v_admin.user_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  RETURN v_assignment;
END;
$$;

-- Atomic RPC 2: Employee Updates Task Progress
CREATE OR REPLACE FUNCTION public.record_progress_update(
  p_assignment_id UUID,
  p_new_percentage INTEGER,
  p_description TEXT,
  p_blockers TEXT DEFAULT NULL,
  p_next_steps TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL,
  p_expected_version INTEGER DEFAULT NULL
)
RETURNS public.task_progress_updates
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.task_assignments;
  v_task public.tasks;
  v_update public.task_progress_updates;
  v_actor_name TEXT;
  v_admin RECORD;
BEGIN
  IF p_new_percentage < 0 OR p_new_percentage > 100 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Progress percentage must be between 0 and 100.';
  END IF;

  IF p_description IS NULL OR char_length(trim(p_description)) < 5 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: A meaningful work description (min 5 characters) is required.';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_update FROM public.task_progress_updates WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN v_update;
    END IF;
  END IF;

  SELECT * INTO v_assignment
  FROM public.task_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Task assignment not found.';
  END IF;

  IF v_assignment.employee_id <> auth.uid() OR v_assignment.organization_id <> public.current_user_org_id() THEN
    RAISE EXCEPTION 'FORBIDDEN: Unauthorized progress update attempt.';
  END IF;

  IF v_assignment.status NOT IN ('in_progress', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Task must be in_progress or rejected to update progress.';
  END IF;

  IF p_expected_version IS NOT NULL AND v_assignment.version <> p_expected_version THEN
    RAISE EXCEPTION 'CONFLICT: Stale progress update rejected due to concurrent modification.';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_assignment.task_id;
  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.task_progress_updates (
    organization_id, assignment_id, employee_id,
    previous_percentage, new_percentage, description,
    blockers, next_steps, idempotency_key
  ) VALUES (
    v_assignment.organization_id,
    v_assignment.id,
    auth.uid(),
    v_assignment.progress_percentage,
    p_new_percentage,
    trim(p_description),
    NULLIF(trim(p_blockers), ''),
    NULLIF(trim(p_next_steps), ''),
    p_idempotency_key
  ) RETURNING * INTO v_update;

  UPDATE public.task_assignments
  SET progress_percentage = p_new_percentage,
      status = 'in_progress',
      latest_progress_note = trim(p_description),
      version = version + 1,
      updated_at = now()
  WHERE id = v_assignment.id;

  INSERT INTO public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_assignment.organization_id,
    auth.uid(),
    'task.progress_updated',
    'task_assignment',
    v_assignment.id,
    jsonb_build_object(
      'task_id', v_task.id,
      'previous_percentage', v_update.previous_percentage,
      'new_percentage', v_update.new_percentage
    )
  );

  FOR v_admin IN
    SELECT ur.user_id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.organization_id = v_assignment.organization_id
      AND ur.role = 'admin'
      AND p.account_status = 'active'
      AND p.deleted_at IS NULL
  LOOP
    INSERT INTO public.notifications (
      organization_id, recipient_id, actor_id, event_type, title, body,
      related_task_id, related_assignment_id, idempotency_key
    ) VALUES (
      v_assignment.organization_id,
      v_admin.user_id,
      auth.uid(),
      'progress_updated',
      'Progress Updated (' || p_new_percentage || '%): ' || v_task.title,
      v_actor_name || ' updated "' || v_task.title || '" from ' || v_update.previous_percentage || '% to ' || p_new_percentage || '%.',
      v_task.id,
      v_assignment.id,
      'progress:' || v_update.id || ':' || v_admin.user_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  RETURN v_update;
END;
$$;

-- Atomic RPC 3: Employee Submits Task for Completion Review
CREATE OR REPLACE FUNCTION public.submit_task_for_review(
  p_assignment_id UUID,
  p_submission_summary TEXT,
  p_evidence_links JSONB DEFAULT '[]'::jsonb
)
RETURNS public.task_submissions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.task_assignments;
  v_task public.tasks;
  v_submission public.task_submissions;
  v_next_version INTEGER;
  v_actor_name TEXT;
  v_admin RECORD;
BEGIN
  IF p_submission_summary IS NULL OR char_length(trim(p_submission_summary)) < 10 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Completion summary must be at least 10 characters.';
  END IF;

  SELECT * INTO v_assignment
  FROM public.task_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Assignment not found.';
  END IF;

  IF v_assignment.employee_id <> auth.uid() OR v_assignment.organization_id <> public.current_user_org_id() THEN
    RAISE EXCEPTION 'FORBIDDEN: Unauthorized submission attempt.';
  END IF;

  IF v_assignment.progress_percentage <> 100 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Progress percentage must be 100% before submitting for completion review.';
  END IF;

  IF v_assignment.status NOT IN ('in_progress', 'rejected') THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Assignment cannot be submitted from status %.', v_assignment.status;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
  FROM public.task_submissions
  WHERE assignment_id = v_assignment.id;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_assignment.task_id;
  SELECT full_name INTO v_actor_name FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.task_submissions (
    organization_id, assignment_id, employee_id,
    submission_summary, evidence_links, version
  ) VALUES (
    v_assignment.organization_id,
    v_assignment.id,
    auth.uid(),
    trim(p_submission_summary),
    COALESCE(p_evidence_links, '[]'::jsonb),
    v_next_version
  ) RETURNING * INTO v_submission;

  UPDATE public.task_assignments
  SET status = 'awaiting_review',
      submitted_at = now(),
      version = version + 1,
      updated_at = now()
  WHERE id = v_assignment.id;

  INSERT INTO public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_assignment.organization_id,
    auth.uid(),
    'task.submitted_for_review',
    'task_assignment',
    v_assignment.id,
    jsonb_build_object('task_id', v_task.id, 'submission_version', v_next_version)
  );

  FOR v_admin IN
    SELECT ur.user_id
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.organization_id = v_assignment.organization_id
      AND ur.role = 'admin'
      AND p.account_status = 'active'
      AND p.deleted_at IS NULL
  LOOP
    INSERT INTO public.notifications (
      organization_id, recipient_id, actor_id, event_type, title, body,
      related_task_id, related_assignment_id, idempotency_key
    ) VALUES (
      v_assignment.organization_id,
      v_admin.user_id,
      auth.uid(),
      'task_submitted',
      'Review Requested: ' || v_task.title,
      v_actor_name || ' submitted "' || v_task.title || '" (v' || v_next_version || ') for completion review.',
      v_task.id,
      v_assignment.id,
      'submit:' || v_submission.id || ':' || v_admin.user_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  RETURN v_submission;
END;
$$;

-- Atomic RPC 4: Administrator Reviews (Approves or Rejects) Task Submission
CREATE OR REPLACE FUNCTION public.review_task_submission(
  p_assignment_id UUID,
  p_decision public.review_decision,
  p_review_notes TEXT DEFAULT NULL,
  p_quality_bonus INTEGER DEFAULT 0
)
RETURNS public.task_reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment public.task_assignments;
  v_task public.tasks;
  v_latest_submission public.task_submissions;
  v_review public.task_reviews;
  v_new_status public.assignment_status;
BEGIN
  SELECT * INTO v_assignment
  FROM public.task_assignments
  WHERE id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Assignment not found.';
  END IF;

  IF NOT public.is_org_admin(v_assignment.organization_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: Only organization administrators can review task submissions.';
  END IF;

  IF v_assignment.status <> 'awaiting_review' THEN
    RAISE EXCEPTION 'INVALID_TRANSITION: Assignment must be awaiting_review to be reviewed.';
  END IF;

  IF p_decision IN ('rejected', 'changes_requested') AND (p_review_notes IS NULL OR char_length(trim(p_review_notes)) < 5) THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Rejection or change request requires an explanation of at least 5 characters.';
  END IF;

  SELECT * INTO v_latest_submission
  FROM public.task_submissions
  WHERE assignment_id = v_assignment.id
  ORDER BY version DESC
  LIMIT 1;

  SELECT * INTO v_task FROM public.tasks WHERE id = v_assignment.task_id;

  INSERT INTO public.task_reviews (
    organization_id, assignment_id, submission_id,
    reviewer_id, decision, review_notes, quality_bonus
  ) VALUES (
    v_assignment.organization_id,
    v_assignment.id,
    v_latest_submission.id,
    auth.uid(),
    p_decision,
    NULLIF(trim(p_review_notes), ''),
    COALESCE(p_quality_bonus, 0)
  ) RETURNING * INTO v_review;

  IF p_decision = 'approved' THEN
    v_new_status := 'approved';
  ELSE
    v_new_status := 'rejected';
  END IF;

  UPDATE public.task_assignments
  SET status = v_new_status,
      completed_at = CASE WHEN p_decision = 'approved' THEN now() ELSE NULL END,
      version = version + 1,
      updated_at = now()
  WHERE id = v_assignment.id;

  INSERT INTO public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_assignment.organization_id,
    auth.uid(),
    CASE WHEN p_decision = 'approved' THEN 'task.completion_approved' ELSE 'task.completion_rejected' END,
    'task_assignment',
    v_assignment.id,
    jsonb_build_object('task_id', v_task.id, 'decision', p_decision, 'quality_bonus', p_quality_bonus)
  );

  INSERT INTO public.notifications (
    organization_id, recipient_id, actor_id, event_type, title, body,
    related_task_id, related_assignment_id, idempotency_key
  ) VALUES (
    v_assignment.organization_id,
    v_assignment.employee_id,
    auth.uid(),
    CASE WHEN p_decision = 'approved' THEN 'task_approved' ELSE 'task_rejected' END,
    CASE WHEN p_decision = 'approved'
      THEN 'Task Approved: ' || v_task.title
      ELSE 'Revision Needed: ' || v_task.title
    END,
    CASE WHEN p_decision = 'approved'
      THEN 'Your completion submission for "' || v_task.title || '" has been approved.'
      ELSE 'Your submission for "' || v_task.title || '" requires changes: ' || trim(p_review_notes)
    END,
    v_task.id,
    v_assignment.id,
    'review:' || v_review.id || ':' || v_assignment.employee_id
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN v_review;
END;
$$;
