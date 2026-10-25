#!/usr/bin/env node
/**
 * Safe Server-Side Initial Administrator Provisioning Script
 * Supports both SUPABASE_SECRET_KEY and SUPABASE_SERVICE_ROLE_KEY.
 */
import crypto from 'node:crypto';

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminName = process.env.ADMIN_NAME || 'System Administrator';
  const orgName = process.env.ORG_NAME || 'Nukhba Enterprise Holding';
  const orgSlug = process.env.ORG_SLUG || 'nukhba-enterprise';

  if (!supabaseUrl || !secretKey || !adminEmail) {
    console.error(
      'ERROR: Missing required environment variables (SUPABASE_URL, SUPABASE_SECRET_KEY, ADMIN_EMAIL).'
    );
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(supabaseUrl, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const tempSetupPassword = crypto.randomBytes(18).toString('base64url') + '!A9';

  const { data: createdUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email: adminEmail.trim().toLowerCase(),
    password: tempSetupPassword,
    email_confirm: true,
    user_metadata: { full_name: adminName }
  });

  if (authErr || !createdUser.user) {
    console.error('Failed to create auth user:', authErr?.message);
    process.exit(1);
  }

  const { data: orgId, error: rpcErr } = await supabaseAdmin.rpc('provision_initial_admin', {
    p_user_id: createdUser.user.id,
    p_email: adminEmail.trim().toLowerCase(),
    p_full_name: adminName,
    p_org_name: orgName,
    p_org_slug: orgSlug
  });

  if (rpcErr) {
    console.error('Failed to provision initial admin role:', rpcErr.message);
    process.exit(1);
  }

  await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: adminEmail.trim().toLowerCase()
  });

  console.log(`Successfully provisioned initial administrator (${adminEmail}) in organization ${orgId}.`);
}

main().catch((err) => {
  console.error('Provisioning failed:', err.message);
  process.exit(1);
});
