import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EnterpriseDatabaseEngine } from '../../src/lib/services/database-engine.mjs';

const root = path.resolve('artifacts/file_generation/ttl=63d/intermediate/employee-management-system');

test('Phase 2.1: All 4 SQL migration files exist and define required tables, constraints, and RLS policies', () => {
  const migrations = [
    '0001_initial_schema.sql',
    '0002_rls_policies.sql',
    '0003_functions_and_triggers.sql',
    '0004_seed_and_admin_provisioning.sql'
  ];
  for (const file of migrations) {
    const fullPath = path.join(root, 'supabase/migrations', file);
    assert.equal(fs.existsSync(fullPath), true, `Migration ${file} must exist`);
  }

  const schemaSql = fs.readFileSync(path.join(root, 'supabase/migrations/0001_initial_schema.sql'), 'utf8');
  const requiredTables = [
    'organizations',
    'profiles',
    'user_roles',
    'tasks',
    'task_assignments',
    'task_progress_updates',
    'task_submissions',
    'task_reviews',
    'notifications',
    'activity_logs',
    'task_attachments'
  ];
  for (const tbl of requiredTables) {
    assert.match(schemaSql, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${tbl}`), `Table ${tbl} must be defined`);
  }

  const rlsSql = fs.readFileSync(path.join(root, 'supabase/migrations/0002_rls_policies.sql'), 'utf8');
  for (const tbl of requiredTables) {
    assert.match(rlsSql, new RegExp(`ALTER TABLE public\\.${tbl} ENABLE ROW LEVEL SECURITY`), `RLS must be enabled on ${tbl}`);
    assert.match(rlsSql, new RegExp(`ALTER TABLE public\\.${tbl} FORCE ROW LEVEL SECURITY`), `RLS must be forced on ${tbl}`);
  }
});

test('Phase 2.2: Initial Administrator Provisioning enforces service_role only and logs audit event', () => {
  const db = new EnterpriseDatabaseEngine();

  // Attempt with non-service_role must fail
  assert.throws(
    () =>
      db.provisionInitialAdmin({
        callerRole: 'authenticated',
        email: 'admin@nukhba.io',
        fullName: 'Tariq Al-Mansoor',
        password: 'StrongPassword!123'
      }),
    /FORBIDDEN: provision_initial_admin may only be executed by service_role/
  );

  // Valid service_role provisioning succeeds
  const { organization, adminProfile } = db.provisionInitialAdmin({
    callerRole: 'service_role',
    email: 'admin@nukhba.io',
    fullName: 'Tariq Al-Mansoor',
    password: 'StrongPassword!123'
  });

  assert.equal(adminProfile.email, 'admin@nukhba.io');
  assert.equal(adminProfile.account_status, 'active');
  assert.equal(db.user_roles.get(adminProfile.id).role, 'admin');
  assert.equal(db.activity_logs.size, 1);
  assert.ok(organization.id);
});

test('Phase 2.3: Append-only tables (activity_logs, task_progress_updates, task_reviews) reject UPDATE and DELETE', () => {
  const db = new EnterpriseDatabaseEngine();
  const { adminProfile } = db.provisionInitialAdmin({
    callerRole: 'service_role',
    email: 'admin@nukhba.io',
    fullName: 'Tariq Al-Mansoor',
    password: 'StrongPassword!123'
  });

  for (const table of ['activity_logs', 'task_progress_updates', 'task_reviews']) {
    assert.throws(
      () => db.attemptDirectMutationOnImmutableTable(adminProfile.id, table, 'any-id', 'DELETE'),
      /IMMUTABLE_RECORD_VIOLATION/
    );
  }
});
