import test from 'node:test';
import assert from 'node:assert/strict';
import { EnterpriseDatabaseEngine } from '../../src/lib/services/database-engine.mjs';

function setupOrgWithAdmin() {
  const db = new EnterpriseDatabaseEngine();
  const { adminProfile } = db.provisionInitialAdmin({
    callerRole: 'service_role',
    email: 'admin@nukhba.io',
    fullName: 'Tariq Al-Mansoor',
    password: 'StrongPassword!123'
  });
  return { db, adminId: adminProfile.id };
}

test('Phase 4.1: Admin can create employees, duplicate emails are rejected, and deactivation immediately revokes session', () => {
  const { db, adminId } = setupOrgWithAdmin();

  const { profile: emp1 } = db.createEmployee(adminId, {
    full_name: 'Salma El-Sayed',
    email: 'salma@nukhba.io',
    department: 'Engineering',
    job_title: 'Senior Frontend Engineer',
    employee_number: 'EMP-101',
    account_status: 'active',
    initial_password: 'SalmaPassword!123'
  });

  assert.equal(emp1.email, 'salma@nukhba.io');
  assert.equal(emp1.account_status, 'active');

  // Duplicate email rejected
  assert.throws(
    () =>
      db.createEmployee(adminId, {
        full_name: 'Another Salma',
        email: 'SALMA@nukhba.io',
        department: 'QA'
      }),
    /CONFLICT_DUPLICATE_EMAIL/
  );

  // Employee signs in
  const empSession = db.signIn({
    email: 'salma@nukhba.io',
    password: 'SalmaPassword!123',
    clientIp: '10.0.1.10'
  });
  assert.equal(db.verifySession(empSession.sessionToken).id, emp1.id);

  // Unauthorized employee cannot create another employee
  assert.throws(
    () =>
      db.createEmployee(emp1.id, {
        full_name: 'Hacker Account',
        email: 'hacker@nukhba.io'
      }),
    /FORBIDDEN: Administrator privileges required/
  );

  // Admin deactivates employee -> active session token is immediately revoked
  db.setEmployeeStatus(adminId, emp1.id, 'deactivated');
  assert.throws(() => db.verifySession(empSession.sessionToken), /SESSION_REVOKED/);
});

test('Phase 4.2: Multi-employee task assignment creates independent assignment records and calculates accurate KPI metrics', () => {
  const { db, adminId } = setupOrgWithAdmin();
  const { profile: empA } = db.createEmployee(adminId, {
    full_name: 'Employee A',
    email: 'empa@nukhba.io',
    department: 'Engineering',
    account_status: 'active'
  });
  const { profile: empB } = db.createEmployee(adminId, {
    full_name: 'Employee B',
    email: 'empb@nukhba.io',
    department: 'Engineering',
    account_status: 'active'
  });
  const { profile: empC } = db.createEmployee(adminId, {
    full_name: 'Employee C',
    email: 'empc@nukhba.io',
    department: 'Design',
    account_status: 'active'
  });

  const { task, assignments } = db.createTaskAndAssign(adminId, {
    title: 'Build Customer Registration Page',
    description: 'Implement responsive customer registration workflow with Zod validation and RTL layout.',
    priority: 'high',
    category: 'Product Engineering',
    start_date: '2026-10-20T08:00:00.000Z',
    due_date: '2026-10-30T17:00:00.000Z',
    assigned_employee_ids: [empA.id, empB.id, empC.id]
  });

  assert.equal(assignments.length, 3);
  assert.notEqual(assignments[0].id, assignments[1].id);
  assert.notEqual(assignments[1].id, assignments[2].id);

  // Cancel Employee C's assignment and verify denominator exclusion
  db.cancelAssignment(adminId, assignments[2].id, 'Shifted to mobile sprint');

  const summary = db.getAdminDashboardSummary(adminId, new Date('2026-10-25T12:00:00Z'));
  assert.equal(summary.totalEmployees, 3);
  assert.equal(summary.totalAssignedTasks, 2); // Canceled assignment excluded!
  assert.equal(summary.tasksNotStarted, 2);
});

test('Phase 4.3: CSV export is restricted to Admins and neutralizes CSV formula injection payloads', () => {
  const { db, adminId } = setupOrgWithAdmin();
  const { profile: emp } = db.createEmployee(adminId, {
    full_name: '=CMD|\' /C calc\'!A0',
    email: 'csvtest@nukhba.io',
    department: '+MaliciousDept',
    account_status: 'active'
  });

  // Employee cannot export CSV
  assert.throws(() => db.exportPerformanceCsv(emp.id), /FORBIDDEN/);

  // Admin exports CSV and formula injection characters are prefixed with single quote
  const csv = db.exportPerformanceCsv(adminId);
  assert.match(csv, /'=CMD\|' \/C calc'!A0/);
  assert.match(csv, /'\+MaliciousDept/);
});
