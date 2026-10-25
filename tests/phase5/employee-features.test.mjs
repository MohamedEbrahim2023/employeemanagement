import test from 'node:test';
import assert from 'node:assert/strict';
import { EnterpriseDatabaseEngine } from '../../src/lib/services/database-engine.mjs';

function setupScenario() {
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
    department: 'Engineering',
    account_status: 'active'
  });
  const { profile: empC } = db.createEmployee(adminProfile.id, {
    full_name: 'Employee C',
    email: 'empc@nukhba.io',
    department: 'Engineering',
    account_status: 'active'
  });

  const { task, assignments } = db.createTaskAndAssign(adminProfile.id, {
    title: 'Build a customer registration page',
    description: 'Create responsive customer registration page with multi-step verification.',
    priority: 'high',
    start_date: '2026-10-20T08:00:00.000Z',
    due_date: '2026-10-30T17:00:00.000Z',
    assigned_employee_ids: [empA.id, empB.id, empC.id]
  });

  return { db, adminId: adminProfile.id, empA, empB, empC, task, assignments };
}

test('Phase 5.1: Employees can view only their own assignments and have independent progress percentages (100%, 60%, 20%)', () => {
  const { db, empA, empB, empC, assignments } = setupScenario();

  // Employee A cannot read Employee B's assignments
  assert.throws(() => db.getEmployeeAssignments(empA.id, empB.id), /FORBIDDEN_RLS/);

  // All 3 employees start their independent assignments
  db.startTaskAssignment(empA.id, { assignment_id: assignments[0].id });
  db.startTaskAssignment(empB.id, { assignment_id: assignments[1].id });
  db.startTaskAssignment(empC.id, { assignment_id: assignments[2].id });

  // Employee A updates to 100%, Employee B to 60%, Employee C to 20%
  db.recordProgressUpdate(empA.id, {
    assignment_id: assignments[0].id,
    new_percentage: 100,
    description: 'Completed full registration UI and unit tests.'
  });
  db.recordProgressUpdate(empB.id, {
    assignment_id: assignments[1].id,
    new_percentage: 60,
    description: 'Implemented API endpoints and schema validation.'
  });
  db.recordProgressUpdate(empC.id, {
    assignment_id: assignments[2].id,
    new_percentage: 20,
    description: 'Drafted initial wireframes and RTL layout tokens.'
  });

  const aState = db.getEmployeeAssignments(empA.id)[0];
  const bState = db.getEmployeeAssignments(empB.id)[0];
  const cState = db.getEmployeeAssignments(empC.id)[0];

  assert.equal(aState.progress_percentage, 100);
  assert.equal(bState.progress_percentage, 60);
  assert.equal(cState.progress_percentage, 20);
});

test('Phase 5.2: Progress updates preserve append-only history (30% -> 55%), enforce validation, and notify admin only on success', () => {
  const { db, adminId, empA, empB, assignments } = setupScenario();
  const assignA = assignments[0].id;

  db.startTaskAssignment(empA.id, { assignment_id: assignA });

  // Step 1: 0% -> 30%
  db.recordProgressUpdate(empA.id, {
    assignment_id: assignA,
    new_percentage: 30,
    description: 'Set up form scaffolding and validation rules.'
  });

  // Step 2: 30% -> 55%
  db.recordProgressUpdate(empA.id, {
    assignment_id: assignA,
    new_percentage: 55,
    description: 'Integrated Supabase Auth signup handler and error states.'
  });

  const history = db.getEmployeeAssignments(empA.id)[0].progress_history;
  assert.equal(history.length, 2);
  assert.equal(history[0].previous_percentage, 30);
  assert.equal(history[0].new_percentage, 55);
  assert.equal(history[1].previous_percentage, 0);
  assert.equal(history[1].new_percentage, 30);

  const adminNotifsBeforeFailure = db.getNotificationsForUser(adminId).length;

  // Invalid percentage (>100) rejected & no false notification generated
  assert.throws(
    () =>
      db.recordProgressUpdate(empA.id, {
        assignment_id: assignA,
        new_percentage: 120,
        description: 'Invalid percentage update'
      }),
    /VALIDATION_ERROR/
  );

  // Unauthorized update by Employee B on Employee A's assignment rejected
  assert.throws(
    () =>
      db.recordProgressUpdate(empB.id, {
        assignment_id: assignA,
        new_percentage: 75,
        description: 'Unauthorized attempt by another employee'
      }),
    /FORBIDDEN_RLS/
  );

  const adminNotifsAfterFailure = db.getNotificationsForUser(adminId).length;
  assert.equal(adminNotifsAfterFailure, adminNotifsBeforeFailure);
});

test('Phase 5.3: Completion submission requires 100% progress, supports manager rejection & resubmission, and only approved tasks count on leaderboard', () => {
  const { db, adminId, empA, assignments } = setupScenario();
  const assignA = assignments[0].id;

  db.startTaskAssignment(empA.id, { assignment_id: assignA });
  db.recordProgressUpdate(empA.id, {
    assignment_id: assignA,
    new_percentage: 80,
    description: 'Almost done with registration flow.'
  });

  // Cannot submit for review at 80%
  assert.throws(
    () =>
      db.submitTaskForReview(empA.id, {
        assignment_id: assignA,
        submission_summary: 'Submitting early at 80%.'
      }),
    /Progress percentage must be 100%/
  );

  // Update to 100%
  db.recordProgressUpdate(empA.id, {
    assignment_id: assignA,
    new_percentage: 100,
    description: 'All checklist items complete.'
  });

  // At 100% before approval, leaderboard completed count must still be 0!
  assert.equal(db.getLeaderboard(adminId).find((r) => r.employee_id === empA.id).approved_completed_tasks, 0);

  // Submit v1
  const subV1 = db.submitTaskForReview(empA.id, {
    assignment_id: assignA,
    submission_summary: 'Completed registration page with validation and tests.'
  });
  assert.equal(subV1.version, 1);

  // Manager rejects without reason -> fails validation
  assert.throws(
    () =>
      db.reviewTaskSubmission(adminId, {
        assignment_id: assignA,
        decision: 'rejected',
        review_notes: ''
      }),
    /VALIDATION_ERROR/
  );

  // Manager rejects with clear reason
  db.reviewTaskSubmission(adminId, {
    assignment_id: assignA,
    decision: 'rejected',
    review_notes: 'Please add rate-limiting tests on the registration endpoint.'
  });

  const afterReject = db.getEmployeeAssignments(empA.id)[0];
  assert.equal(afterReject.status, 'rejected');
  assert.equal(afterReject.primary_action_en, 'Revise and Resubmit');

  // Employee revises and resubmits (v2)
  const subV2 = db.submitTaskForReview(empA.id, {
    assignment_id: assignA,
    submission_summary: 'Added rate-limiting tests and verified edge cases (v2).'
  });
  assert.equal(subV2.version, 2);

  // Employee cannot approve their own task
  assert.throws(
    () =>
      db.reviewTaskSubmission(empA.id, {
        assignment_id: assignA,
        decision: 'approved'
      }),
    /FORBIDDEN/
  );

  // Manager approves v2
  db.reviewTaskSubmission(adminId, {
    assignment_id: assignA,
    decision: 'approved',
    review_notes: 'Great work on the rate-limiting tests!',
    quality_bonus: 15
  });

  // Now and only now does it count on the official leaderboard
  const leaderboard = db.getLeaderboard(adminId);
  const empARow = leaderboard.find((r) => r.employee_id === empA.id);
  assert.equal(empARow.approved_completed_tasks, 1);
  assert.equal(empARow.rank, 1);
  assert.ok(empARow.weighted_score > 0);
});

test('Phase 5.4: Employee cannot escalate privileges or alter protected profile fields', () => {
  const { db, empA } = setupScenario();

  assert.throws(
    () => db.updateOwnProfile(empA.id, { role: 'admin' }),
    /UNAUTHORIZED_FIELD_MODIFICATION/
  );
  assert.throws(
    () => db.updateOwnProfile(empA.id, { department: 'Executive' }),
    /UNAUTHORIZED_FIELD_MODIFICATION/
  );

  const updated = db.updateOwnProfile(empA.id, { full_name: 'Eng. Salma A.' });
  assert.equal(updated.full_name, 'Eng. Salma A.');
});
