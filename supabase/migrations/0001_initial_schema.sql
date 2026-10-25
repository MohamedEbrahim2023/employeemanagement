-- ============================================================================
-- Migration 0001: Initial Normalized Schema for Employee & Task Management
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Enums for strict domain integrity
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'employee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('invited', 'active', 'deactivated', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.task_lifecycle_status AS ENUM ('active', 'completed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.assignment_status AS ENUM (
    'not_started',
    'in_progress',
    'awaiting_review',
    'rejected',
    'approved',
    'canceled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.review_decision AS ENUM ('approved', 'rejected', 'changes_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1. organizations
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  scoring_config JSONB NOT NULL DEFAULT '{
    "base_points": 100,
    "on_time_bonus": 25,
    "priority_weights": {"low": 1.0, "medium": 1.25, "high": 1.5, "critical": 2.0},
    "quality_bonus_max": 20
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. profiles (1-to-1 with auth.users, stores non-privileged profile attributes)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  email TEXT NOT NULL UNIQUE CHECK (email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) BETWEEN 2 AND 120),
  department TEXT CHECK (department IS NULL OR char_length(trim(department)) <= 80),
  job_title TEXT CHECK (job_title IS NULL OR char_length(trim(job_title)) <= 100),
  employee_number TEXT CHECK (employee_number IS NULL OR char_length(trim(employee_number)) <= 40),
  avatar_url TEXT,
  account_status public.account_status NOT NULL DEFAULT 'invited',
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (organization_id, employee_number)
);

-- 3. user_roles (Trusted authorization structure isolated from ordinary profile edits)
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'employee',
  granted_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 3 AND 200),
  description TEXT NOT NULL CHECK (char_length(trim(description)) BETWEEN 10 AND 5000),
  priority public.task_priority NOT NULL DEFAULT 'medium',
  category TEXT CHECK (category IS NULL OR char_length(trim(category)) <= 80),
  start_date TIMESTAMPTZ NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  estimated_effort_hours NUMERIC(6,2) CHECK (estimated_effort_hours IS NULL OR estimated_effort_hours > 0),
  completion_criteria TEXT CHECK (completion_criteria IS NULL OR char_length(completion_criteria) <= 2000),
  checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
  task_status public.task_lifecycle_status NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  canceled_at TIMESTAMPTZ,
  CONSTRAINT tasks_dates_check CHECK (due_date >= start_date)
);

-- 5. task_assignments (Independent progress per assigned employee)
CREATE TABLE IF NOT EXISTS public.task_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status public.assignment_status NOT NULL DEFAULT 'not_started',
  progress_percentage INTEGER NOT NULL DEFAULT 0 CHECK (progress_percentage BETWEEN 0 AND 100),
  latest_progress_note TEXT,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, employee_id)
);

-- 6. task_progress_updates (Immutable append-only history)
CREATE TABLE IF NOT EXISTS public.task_progress_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  assignment_id UUID NOT NULL REFERENCES public.task_assignments(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  previous_percentage INTEGER NOT NULL CHECK (previous_percentage BETWEEN 0 AND 100),
  new_percentage INTEGER NOT NULL CHECK (new_percentage BETWEEN 0 AND 100),
  description TEXT NOT NULL CHECK (char_length(trim(description)) BETWEEN 5 AND 3000),
  blockers TEXT CHECK (blockers IS NULL OR char_length(blockers) <= 2000),
  next_steps TEXT CHECK (next_steps IS NULL OR char_length(next_steps) <= 2000),
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. task_submissions (Versioned completion submissions)
CREATE TABLE IF NOT EXISTS public.task_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  assignment_id UUID NOT NULL REFERENCES public.task_assignments(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submission_summary TEXT NOT NULL CHECK (char_length(trim(submission_summary)) BETWEEN 10 AND 4000),
  evidence_links JSONB NOT NULL DEFAULT '[]'::jsonb,
  version INTEGER NOT NULL CHECK (version >= 1),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, version)
);

-- 8. task_reviews (Immutable manager review history)
CREATE TABLE IF NOT EXISTS public.task_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  assignment_id UUID NOT NULL REFERENCES public.task_assignments(id) ON DELETE RESTRICT,
  submission_id UUID REFERENCES public.task_submissions(id) ON DELETE RESTRICT,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decision public.review_decision NOT NULL,
  review_notes TEXT CHECK (review_notes IS NULL OR char_length(review_notes) <= 3000),
  quality_bonus INTEGER NOT NULL DEFAULT 0 CHECK (quality_bonus BETWEEN 0 AND 20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rejection_requires_reason CHECK (
    decision = 'approved' OR (review_notes IS NOT NULL AND char_length(trim(review_notes)) >= 5)
  )
);

-- 9. notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 200),
  body TEXT NOT NULL CHECK (char_length(trim(body)) BETWEEN 2 AND 1000),
  related_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  related_assignment_id UUID REFERENCES public.task_assignments(id) ON DELETE SET NULL,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

-- 10. activity_logs (Append-only security and operational audit trail)
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. task_attachments
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  assignment_id UUID NOT NULL REFERENCES public.task_assignments(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  storage_path TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL CHECK (char_length(original_filename) BETWEEN 1 AND 255),
  content_type TEXT NOT NULL CHECK (
    content_type IN ('application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/csv')
  ),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for high-performance filtering, sorting, and unread lookups
CREATE INDEX IF NOT EXISTS idx_profiles_org_status ON public.profiles(organization_id, account_status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_department ON public.profiles(organization_id, department);
CREATE INDEX IF NOT EXISTS idx_tasks_org_status_due ON public.tasks(organization_id, task_status, due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON public.tasks(organization_id, priority);
CREATE INDEX IF NOT EXISTS idx_assignments_employee_status ON public.task_assignments(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_assignments_task ON public.task_assignments(task_id, status);
CREATE INDEX IF NOT EXISTS idx_progress_assignment_created ON public.task_progress_updates(assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment_version ON public.task_submissions(assignment_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_assignment_created ON public.task_reviews(assignment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread ON public.notifications(recipient_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_all ON public.notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_org_created ON public.activity_logs(organization_id, created_at DESC);
