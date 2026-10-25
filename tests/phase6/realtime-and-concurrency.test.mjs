import test from 'node:test';
import assert from 'node:assert/strict';
import { EnterpriseDatabaseEngine } from '../../src/lib/services/database-engine.mjs';

function setupRealtimeScenario() {
  const db = new EnterpriseDatabaseEngine();
  const { adminProfile } = db.provisionInitialAdmin({
    callerRole: 'service_role',
    email: 'admin@nukhba.io',
    fullName: 'Tariq Al-Mansoor',
    password: 'StrongPassword!123'
  });
  const { profile: empA } = db.createEmployee(adminProfile.id, {
    full_name: 'Employee A',
    email: 'empa@nukhba.io',
    department: 'Engineering',
    account_status: 'active'
  });
  const { profile: empB } = db.createEmployee(adminProfile.id, {
    full_name: 'Employee B',
    email: 'empb@nukhba.io',
    department: 'Product',
    account_status: 'active'
  });

  const { assignments } = db.createTaskAndAssign(adminProfile.id, {
    title: 'API Security Hardening',
    description: 'Audit and test all RLS policies and JWT claims.',
    priority: 'critical',
    start_date: '2026-10-20T08:00:00.000Z',
    due_date: '2026-10-28T17:00:00.000Z',
    assigned_employee_ids: [empA.id, empB.id]
  });

  return { db, adminId: adminProfile.id, empA, empB, assignA: assignments[0], assignB: assignments[1] };
}

test('Phase 6.1: Realtime events reach authorized admin and owning employee, never leaking to other employees, and cleanup works', () => {
  const { db, adminId, empA, empB, assignA } = setupRealtimeScenario();

  const adminEvents = [];
  const empAEvents = [];
  const empBEvents = [];

  const unsubAdmin = db.subscribeAuthorizedRealtime(adminId, (ev) => adminEvents.push(ev));
  const unsubEmpA = db.subscribeAuthorizedRealtime(empA.id, (ev) => empAEvents.push(ev));
  const unsubEmpB = db.subscribeAuthorizedRealtime(empB.id, (ev) => empBEvents.push(ev));

  // Employee A starts task and updates progress
  db.startTaskAssignment(empA.id, { assignment_id: assignA.id });
  db.recordProgressUpdate(empA.id, {
    assignment_id: assignA.id,
    new_percentage: 45,
    description: 'Completed RLS verification for profiles and user_roles.'
  });

  // Admin receives realtime updates & notifications
  assert.ok(adminEvents.length >= 3);
  // Employee A receives updates for their own assignment
  assert.ok(empAEvents.length >= 2);
  // Employee B must receive ZERO events from Employee A's activity!
  assert.equal(empBEvents.length, 0);

  // Unsubscribe cleanup prevents further events
  const countBeforeUnsub = adminEvents.length;
  unsubAdmin();
  unsubEmpA();
  unsubEmpB();

  db.recordProgressUpdate(empA.id, {
    assignment_id: assignA.id,
    new_percentage: 70,
    description: 'Verified task_assignments RLS policies.'
  });
  assert.equal(adminEvents.length, countBeforeUnsub);
});

test('Phase 6.2: Optimistic concurrency prevents stale overwrites and idempotency keys prevent duplicate progress or notifications', () => {
  const { db, adminId, empA, assignA } = setupRealtimeScenario();

  const started = db.startTaskAssignment(empA.id, { assignment_id: assignA.id });
  const initialVersion = started.version;

  // Retry with identical idempotency_key produces only 1 progress update and 1 admin notification
  const notifsBefore = db.getNotificationsForUser(adminId).length;
  const u1 = db.recordProgressUpdate(empA.id, {
    assignment_id: assignA.id,
    new_percentage: 50,
    description: 'Halfway through security hardening.',
    idempotency_key: 'idem-key-001',
    expected_version: initialVersion
  });
  const u1Retry = db.recordProgressUpdate(empA.id, {
    assignment_id: assignA.id,
    new_percentage: 50,
    description: 'Halfway through security hardening.',
    idempotency_key: 'idem-key-001',
    expected_version: initialVersion
  });

  assert.equal(u1.id, u1Retry.id);
  const notifsAfter = db.getNotificationsForUser(adminId).length;
  assert.equal(notifsAfter - notifsBefore, 1, 'Duplicate retry must not create duplicate notification');

  // Stale expected_version fails with CONFLICT
  assert.throws(
    () =>
      db.recordProgressUpdate(empA.id, {
        assignment_id: assignA.id,
        new_percentage: 25,
        description: 'Stale tab trying to overwrite newer 50% progress.',
        expected_version: initialVersion
      }),
    /CONFLICT/
  );
});

test('Phase 6.3: State and notifications persist across snapshot/refresh cycles', () => {
  const { db, adminId, empA, assignA } = setupRealtimeScenario();
  db.startTaskAssignment(empA.id, { assignment_id: assignA.id });
  db.recordProgressUpdate(empA.id, {
    assignment_id: assignA.id,
    new_percentage: 65,
    description: 'Persisted before refresh.'
  });

  const snapshot = db.exportSnapshot();
  const restoredDb = new EnterpriseDatabaseEngine();
  restoredDb.restoreSnapshot(snapshot);

  const restoredAssign = restoredDb.getEmployeeAssignments(empA.id)[0];
  assert.equal(restoredAssign.progress_percentage, 65);
  assert.equal(restoredAssign.progress_history.length, 1);

  const restoredAdminNotifs = restoredDb.getNotificationsForUser(adminId);
  assert.ok(restoredAdminNotifs.length >= 2);
});
