-- ============================================================================
-- Migration 0002: Row Level Security (RLS) & Deny-By-Default Authorization
-- ============================================================================

-- Enable and Force RLS on every application table
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;

ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignments FORCE ROW LEVEL SECURITY;

ALTER TABLE public.task_progress_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_progress_updates FORCE ROW LEVEL SECURITY;

ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_submissions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.task_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_reviews FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments FORCE ROW LEVEL SECURITY;

-- Trusted Security-Definer Helper Functions (Non-recursive)
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND account_status = 'active'
    AND deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ur.role
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.user_id = auth.uid()
    AND p.account_status = 'active'
    AND p.deleted_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = target_org_id
      AND ur.role = 'admin'
      AND p.account_status = 'active'
      AND p.deleted_at IS NULL
  );
$$;

-- 1. organizations Policies
CREATE POLICY org_select_member ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.current_user_org_id());

CREATE POLICY org_update_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

-- 2. profiles Policies
-- Admins can read all profiles in their org; employees can read their own profile
CREATE POLICY profiles_select_policy ON public.profiles
  FOR SELECT TO authenticated
  USING (
    (id = auth.uid() AND account_status = 'active' AND deleted_at IS NULL)
    OR public.is_org_admin(organization_id)
  );

CREATE POLICY profiles_insert_admin ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- Employees can update ONLY permitted personal fields via controlled trigger/check
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND account_status = 'active' AND deleted_at IS NULL)
  WITH CHECK (
    id = auth.uid()
    AND organization_id = public.current_user_org_id()
    AND account_status = 'active'
    AND deleted_at IS NULL
  );

-- 3. user_roles Policies (Strictly read-only for self, writable only by org admin)
CREATE POLICY user_roles_select_policy ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_org_admin(organization_id));

CREATE POLICY user_roles_manage_admin ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- 4. tasks Policies
-- Admins see all org tasks; employees see only tasks assigned to them
CREATE POLICY tasks_select_policy ON public.tasks
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR (
      organization_id = public.current_user_org_id()
      AND EXISTS (
        SELECT 1 FROM public.task_assignments ta
        WHERE ta.task_id = tasks.id
          AND ta.employee_id = auth.uid()
          AND ta.status <> 'canceled'
      )
    )
  );

CREATE POLICY tasks_manage_admin ON public.tasks
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- 5. task_assignments Policies
CREATE POLICY assignments_select_policy ON public.task_assignments
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR (employee_id = auth.uid() AND organization_id = public.current_user_org_id())
  );

CREATE POLICY assignments_manage_admin ON public.task_assignments
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- 6. task_progress_updates Policies (Append-only)
CREATE POLICY progress_select_policy ON public.task_progress_updates
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR (employee_id = auth.uid() AND organization_id = public.current_user_org_id())
  );

CREATE POLICY progress_insert_employee ON public.task_progress_updates
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    AND organization_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.id = assignment_id
        AND ta.employee_id = auth.uid()
        AND ta.status IN ('in_progress', 'rejected')
    )
  );

-- 7. task_submissions Policies (Append-only versioned submissions)
CREATE POLICY submissions_select_policy ON public.task_submissions
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR (employee_id = auth.uid() AND organization_id = public.current_user_org_id())
  );

CREATE POLICY submissions_insert_employee ON public.task_submissions
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = auth.uid()
    AND organization_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.id = assignment_id
        AND ta.employee_id = auth.uid()
    )
  );

-- 8. task_reviews Policies (Insertable ONLY by admin, readable by admin or assigned employee)
CREATE POLICY reviews_select_policy ON public.task_reviews
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.id = task_reviews.assignment_id
        AND ta.employee_id = auth.uid()
        AND ta.organization_id = public.current_user_org_id()
    )
  );

CREATE POLICY reviews_insert_admin ON public.task_reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(organization_id)
    AND reviewer_id = auth.uid()
  );

-- 9. notifications Policies
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid() AND organization_id = public.current_user_org_id());

CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid() AND organization_id = public.current_user_org_id())
  WITH CHECK (recipient_id = auth.uid() AND organization_id = public.current_user_org_id());

-- 10. activity_logs Policies (Admin read-only; no UPDATE or DELETE for any user)
CREATE POLICY activity_logs_select_admin ON public.activity_logs
  FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id));

-- 11. task_attachments Policies
CREATE POLICY attachments_select_policy ON public.task_attachments
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.task_assignments ta
      WHERE ta.id = task_attachments.assignment_id
        AND ta.employee_id = auth.uid()
    )
  );

CREATE POLICY attachments_insert_policy ON public.task_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND organization_id = public.current_user_org_id()
  );
