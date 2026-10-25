-- ============================================================================
-- Migration 0004: Safe Initial Administrator Provisioning Function
-- ============================================================================
-- NOTE: No hardcoded passwords or public admin registration exists.
-- This function can ONLY be invoked by the service_role key via the server-side
-- CLI provisioning script (`npm run provision:admin`) or SQL editor.

CREATE OR REPLACE FUNCTION public.provision_initial_admin(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_org_name TEXT DEFAULT 'Nukhba Enterprise Holding',
  p_org_slug TEXT DEFAULT 'nukhba-enterprise'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  -- Restrict execution strictly to service_role or superuser
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'FORBIDDEN: provision_initial_admin may only be executed by service_role.';
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES (p_org_name, p_org_slug)
  ON CONFLICT (slug) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_org_id;

  INSERT INTO public.profiles (
    id, organization_id, email, full_name, department, job_title, employee_number, account_status
  ) VALUES (
    p_user_id, v_org_id, lower(trim(p_email)), trim(p_full_name),
    'Executive Operations', 'System Administrator', 'ADM-001', 'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET account_status = 'active',
      deleted_at = NULL,
      updated_at = now();

  INSERT INTO public.user_roles (user_id, organization_id, role, granted_by)
  VALUES (p_user_id, v_org_id, 'admin', p_user_id)
  ON CONFLICT (user_id) DO UPDATE
  SET role = 'admin',
      updated_at = now();

  INSERT INTO public.activity_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_org_id, p_user_id, 'admin.provisioned', 'profile', p_user_id,
    jsonb_build_object('email', lower(trim(p_email)), 'method', 'server_side_provisioning')
  );

  RETURN v_org_id;
END;
$$;
