'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';
import {
  CreateEmployeeSchema,
  CreateTaskSchema,
  RecordProgressSchema,
  SubmitTaskSchema,
  ReviewSubmissionSchema,
  UpdateOwnProfileSchema
} from '@/lib/validation/schemas';

export async function createEmployeeAction(rawInput: unknown) {
  const parsed = CreateEmployeeSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION_ERROR', errors: parsed.error.flatten().fieldErrors };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: 'UNAUTHENTICATED', message: 'Authentication required.' };
  }

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!roleRecord || roleRecord.role !== 'admin') {
    return { ok: false, code: 'FORBIDDEN', message: 'Administrator privileges required.' };
  }

  const adminClient = createSupabaseServiceRoleClient();
  const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
    parsed.data.email,
    { data: { full_name: parsed.data.full_name } }
  );

  if (inviteError || !invited.user) {
    return { ok: false, code: 'CONFLICT', message: inviteError?.message ?? 'Could not invite employee.' };
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: invited.user.id,
    organization_id: roleRecord.organization_id,
    email: parsed.data.email,
    full_name: parsed.data.full_name,
    department: parsed.data.department ?? null,
    job_title: parsed.data.job_title ?? null,
    employee_number: parsed.data.employee_number ?? null,
    account_status: parsed.data.account_status,
    avatar_url: parsed.data.avatar_url ?? null
  });

  if (profileError) {
    return { ok: false, code: 'DATABASE_ERROR', message: profileError.message };
  }

  await supabase.from('user_roles').insert({
    user_id: invited.user.id,
    organization_id: roleRecord.organization_id,
    role: 'employee',
    granted_by: user.id
  });

  revalidatePath('/admin/employees');
  revalidatePath('/admin');
  return { ok: true, employeeId: invited.user.id };
}

export async function createTaskAndAssignAction(rawInput: unknown) {
  const parsed = CreateTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION_ERROR', errors: parsed.error.flatten().fieldErrors };
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: 'UNAUTHENTICATED', message: 'Authentication required.' };
  }

  const { data: roleRecord } = await supabase
    .from('user_roles')
    .select('role, organization_id')
    .eq('user_id', user.id)
    .single();

  if (!roleRecord || roleRecord.role !== 'admin') {
    return { ok: false, code: 'FORBIDDEN', message: 'Administrator privileges required.' };
  }

  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .insert({
      organization_id: roleRecord.organization_id,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
      category: parsed.data.category ?? null,
      start_date: parsed.data.start_date,
      due_date: parsed.data.due_date,
      estimated_effort_hours: parsed.data.estimated_effort_hours ?? null,
      completion_criteria: parsed.data.completion_criteria ?? null,
      checklist: parsed.data.checklist,
      created_by: user.id
    })
    .select('*')
    .single();

  if (taskErr || !task) {
    return { ok: false, code: 'DATABASE_ERROR', message: taskErr?.message ?? 'Task creation failed.' };
  }

  const assignmentsPayload = parsed.data.assigned_employee_ids.map((empId) => ({
    organization_id: roleRecord.organization_id,
    task_id: task.id,
    employee_id: empId,
    assigned_by: user.id,
    status: 'not_started',
    progress_percentage: 0
  }));

  const { error: assignErr } = await supabase.from('task_assignments').insert(assignmentsPayload);
  if (assignErr) {
    return { ok: false, code: 'DATABASE_ERROR', message: assignErr.message };
  }

  revalidatePath('/admin/tasks');
  revalidatePath('/admin');
  return { ok: true, taskId: task.id };
}

export async function startTaskAssignmentAction(assignmentId: string, expectedVersion?: number) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('start_task_assignment', {
    p_assignment_id: assignmentId,
    p_expected_version: expectedVersion ?? null
  });
  if (error) {
    return { ok: false, code: 'RPC_ERROR', message: error.message };
  }
  revalidatePath('/employee/tasks');
  revalidatePath('/admin');
  return { ok: true, assignment: data };
}

export async function recordProgressUpdateAction(rawInput: unknown) {
  const parsed = RecordProgressSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION_ERROR', errors: parsed.error.flatten().fieldErrors };
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('record_progress_update', {
    p_assignment_id: parsed.data.assignment_id,
    p_new_percentage: parsed.data.new_percentage,
    p_description: parsed.data.description,
    p_blockers: parsed.data.blockers ?? null,
    p_next_steps: parsed.data.next_steps ?? null,
    p_idempotency_key: parsed.data.idempotency_key ?? null,
    p_expected_version: parsed.data.expected_version ?? null
  });
  if (error) {
    return { ok: false, code: 'RPC_ERROR', message: error.message };
  }
  revalidatePath('/employee/tasks');
  revalidatePath('/admin');
  return { ok: true, progressUpdate: data };
}

export async function submitTaskForReviewAction(rawInput: unknown) {
  const parsed = SubmitTaskSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION_ERROR', errors: parsed.error.flatten().fieldErrors };
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('submit_task_for_review', {
    p_assignment_id: parsed.data.assignment_id,
    p_submission_summary: parsed.data.submission_summary,
    p_evidence_links: parsed.data.evidence_links
  });
  if (error) {
    return { ok: false, code: 'RPC_ERROR', message: error.message };
  }
  revalidatePath('/employee/tasks');
  revalidatePath('/admin/reviews');
  return { ok: true, submission: data };
}

export async function reviewTaskSubmissionAction(rawInput: unknown) {
  const parsed = ReviewSubmissionSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION_ERROR', errors: parsed.error.flatten().fieldErrors };
  }
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('review_task_submission', {
    p_assignment_id: parsed.data.assignment_id,
    p_decision: parsed.data.decision,
    p_review_notes: parsed.data.review_notes ?? null,
    p_quality_bonus: parsed.data.quality_bonus
  });
  if (error) {
    return { ok: false, code: 'RPC_ERROR', message: error.message };
  }
  revalidatePath('/admin/reviews');
  revalidatePath('/admin/leaderboard');
  revalidatePath('/employee/tasks');
  return { ok: true, review: data };
}

export async function updateOwnProfileAction(rawInput: unknown) {
  const parsed = UpdateOwnProfileSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, code: 'VALIDATION_ERROR', errors: parsed.error.flatten().fieldErrors };
  }
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: 'UNAUTHENTICATED', message: 'Authentication required.' };
  }
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.full_name,
      avatar_url: parsed.data.avatar_url ?? null
    })
    .eq('id', user.id);

  if (error) {
    return { ok: false, code: 'DATABASE_ERROR', message: error.message };
  }
  revalidatePath('/employee/profile');
  return { ok: true };
}
