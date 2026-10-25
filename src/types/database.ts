export type AppRole = 'admin' | 'employee';
export type AccountStatus = 'invited' | 'active' | 'deactivated' | 'archived';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskLifecycleStatus = 'active' | 'completed' | 'canceled';
export type AssignmentStatus =
  | 'not_started'
  | 'in_progress'
  | 'awaiting_review'
  | 'rejected'
  | 'approved'
  | 'canceled';
export type ReviewDecision = 'approved' | 'rejected' | 'changes_requested';

export interface ScoringConfig {
  base_points: number;
  on_time_bonus: number;
  priority_weights: Record<TaskPriority, number>;
  quality_bonus_max: number;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  scoring_config: ScoringConfig;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  department: string | null;
  job_title: string | null;
  employee_number: string | null;
  avatar_url: string | null;
  account_status: AccountStatus;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserRoleRecord {
  user_id: string;
  organization_id: string;
  role: AppRole;
  granted_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface Task {
  id: string;
  organization_id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  category: string | null;
  start_date: string;
  due_date: string;
  estimated_effort_hours: number | null;
  completion_criteria: string | null;
  checklist: TaskChecklistItem[];
  task_status: TaskLifecycleStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  canceled_at: string | null;
}

export interface TaskAssignment {
  id: string;
  organization_id: string;
  task_id: string;
  employee_id: string;
  assigned_by: string;
  status: AssignmentStatus;
  progress_percentage: number;
  latest_progress_note: string | null;
  started_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  canceled_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface TaskProgressUpdate {
  id: string;
  organization_id: string;
  assignment_id: string;
  employee_id: string;
  previous_percentage: number;
  new_percentage: number;
  description: string;
  blockers: string | null;
  next_steps: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface TaskSubmission {
  id: string;
  organization_id: string;
  assignment_id: string;
  employee_id: string;
  submission_summary: string;
  evidence_links: string[];
  version: number;
  submitted_at: string;
}

export interface TaskReview {
  id: string;
  organization_id: string;
  assignment_id: string;
  submission_id: string | null;
  reviewer_id: string;
  decision: ReviewDecision;
  review_notes: string | null;
  quality_bonus: number;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  organization_id: string;
  recipient_id: string;
  actor_id: string | null;
  event_type: string;
  title: string;
  body: string;
  related_task_id: string | null;
  related_assignment_id: string | null;
  idempotency_key: string | null;
  created_at: string;
  read_at: string | null;
}

export interface ActivityLog {
  id: string;
  organization_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
