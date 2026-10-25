import crypto from 'node:crypto';

/**
 * Enterprise RLS & Transactional Database Engine
 * Enforces identical schema invariants, Row Level Security (RLS) policies,
 * append-only triggers, optimistic concurrency, idempotency, and atomic RPCs
 * as defined in supabase/migrations/0001..0004.sql.
 */
export class EnterpriseDatabaseEngine {
  constructor() {
    this.organizations = new Map();
    this.profiles = new Map();
    this.user_roles = new Map();
    this.auth_users = new Map(); // id -> { id, email, passwordHash, sessionVersion }
    this.tasks = new Map();
    this.task_assignments = new Map();
    this.task_progress_updates = new Map();
    this.task_submissions = new Map();
    this.task_reviews = new Map();
    this.notifications = new Map();
    this.activity_logs = new Map();
    this.task_attachments = new Map();
    this.realtimeListeners = new Set();
    this.rateLimitBuckets = new Map();
    this._seq = 0;
  }

  // Helper: Emit Realtime event
  _emitRealtime(table, eventType, record, organizationId) {
    for (const listener of this.realtimeListeners) {
      try {
        listener({ table, eventType, record: structuredClone(record), organizationId });
      } catch {
        // Ignore listener errors
      }
    }
  }

  subscribeRealtime(callback) {
    this.realtimeListeners.add(callback);
    return () => this.realtimeListeners.delete(callback);
  }

  // Helper: Resolve active authenticated actor context (RLS helper functions)
  _resolveActor(actorId) {
    if (!actorId) {
      throw new Error('UNAUTHENTICATED: Authentication required.');
    }
    const profile = this.profiles.get(actorId);
    if (!profile || profile.deleted_at !== null) {
      throw new Error('FORBIDDEN: Account does not exist or has been archived.');
    }
    if (profile.account_status !== 'active') {
      throw new Error(`FORBIDDEN: Account status is ${profile.account_status}. Active account required.`);
    }
    const roleRecord = this.user_roles.get(actorId);
    if (!roleRecord) {
      throw new Error('FORBIDDEN: No role assigned to user.');
    }
    return {
      id: profile.id,
      organization_id: profile.organization_id,
      role: roleRecord.role,
      full_name: profile.full_name,
      email: profile.email
    };
  }

  _requireAdmin(actorId, targetOrgId = null) {
    const actor = this._resolveActor(actorId);
    if (actor.role !== 'admin') {
      throw new Error('FORBIDDEN: Administrator privileges required.');
    }
    if (targetOrgId && actor.organization_id !== targetOrgId) {
      throw new Error('FORBIDDEN: Cross-organization access denied by RLS.');
    }
    return actor;
  }

  _logActivity(organization_id, actor_id, action, entity_type, entity_id, metadata = {}) {
    // Strip any accidental secret fields from metadata
    const safeMetadata = { ...metadata };
    delete safeMetadata.password;
    delete safeMetadata.token;
    delete safeMetadata.service_role_key;

    const id = crypto.randomUUID();
    const entry = Object.freeze({
      id,
      organization_id,
      actor_id,
      action,
      entity_type,
      entity_id,
      metadata: safeMetadata,
      created_at: new Date().toISOString()
    });
    this.activity_logs.set(id, entry);
    this._emitRealtime('activity_logs', 'INSERT', entry, organization_id);
    return entry;
  }

  _createNotification({
    organization_id,
    recipient_id,
    actor_id,
    event_type,
    title,
    body,
    related_task_id = null,
    related_assignment_id = null,
    idempotency_key = null
  }) {
    if (idempotency_key) {
      for (const existing of this.notifications.values()) {
        if (existing.idempotency_key === idempotency_key) {
          return existing;
        }
      }
    }
    const id = crypto.randomUUID();
    const notif = {
      id,
      organization_id,
      recipient_id,
      actor_id,
      event_type,
      title,
      body,
      related_task_id,
      related_assignment_id,
      idempotency_key,
      created_at: new Date().toISOString(),
      read_at: null
    };
    this.notifications.set(id, notif);
    this._emitRealtime('notifications', 'INSERT', notif, organization_id);
    return notif;
  }

  _notifyOrgAdmins({ organization_id, actor_id, event_type, title, body, related_task_id, related_assignment_id, keyPrefix }) {
    for (const roleRec of this.user_roles.values()) {
      if (roleRec.organization_id === organization_id && roleRec.role === 'admin') {
        const adminProfile = this.profiles.get(roleRec.user_id);
        if (adminProfile && adminProfile.account_status === 'active' && !adminProfile.deleted_at) {
          this._createNotification({
            organization_id,
            recipient_id: adminProfile.id,
            actor_id,
            event_type,
            title,
            body,
            related_task_id,
            related_assignment_id,
            idempotency_key: keyPrefix ? `${keyPrefix}:${adminProfile.id}` : null
          });
        }
      }
    }
  }

  // Migration 0004: Safe Initial Admin Provisioning (Service Role Only)
  provisionInitialAdmin({ callerRole, email, fullName, password, orgName = 'Nukhba Enterprise Holding', orgSlug = 'nukhba-enterprise' }) {
    if (callerRole !== 'service_role') {
      throw new Error('FORBIDDEN: provision_initial_admin may only be executed by service_role.');
    }
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      throw new Error('VALIDATION_ERROR: Invalid administrator email.');
    }
    if (!password || String(password).length < 8) {
      throw new Error('VALIDATION_ERROR: Initial setup password must be at least 8 characters.');
    }

    let org = [...this.organizations.values()].find((o) => o.slug === orgSlug);
    if (!org) {
      org = {
        id: crypto.randomUUID(),
        name: orgName,
        slug: orgSlug,
        scoring_config: {
          base_points: 100,
          on_time_bonus: 25,
          priority_weights: { low: 1.0, medium: 1.25, high: 1.5, critical: 2.0 },
          quality_bonus_max: 20
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.organizations.set(org.id, org);
    }

    const userId = crypto.randomUUID();
    this.auth_users.set(userId, {
      id: userId,
      email: normalizedEmail,
      passwordHash: crypto.scryptSync(password, userId, 32).toString('hex'),
      sessionVersion: 1,
      mustChangePassword: false
    });

    const now = new Date().toISOString();
    const profile = {
      id: userId,
      organization_id: org.id,
      email: normalizedEmail,
      full_name: fullName.trim(),
      department: 'Executive Operations',
      job_title: 'System Administrator',
      employee_number: 'ADM-001',
      avatar_url: null,
      account_status: 'active',
      last_active_at: now,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    this.profiles.set(userId, profile);

    this.user_roles.set(userId, {
      user_id: userId,
      organization_id: org.id,
      role: 'admin',
      granted_by: userId,
      created_at: now,
      updated_at: now
    });

    this._logActivity(org.id, userId, 'admin.provisioned', 'profile', userId, {
      email: normalizedEmail,
      method: 'server_side_provisioning'
    });

    return { organization: org, adminProfile: profile };
  }

  // Immutability enforcement for audit logs, progress updates, and reviews
  attemptDirectMutationOnImmutableTable(actorId, tableName, recordId, operation = 'DELETE') {
    this._resolveActor(actorId);
    if (['activity_logs', 'task_progress_updates', 'task_reviews'].includes(tableName)) {
      throw new Error(`IMMUTABLE_RECORD_VIOLATION: Table ${tableName} is append-only and cannot be modified or deleted (${operation} on ${recordId}).`);
    }
  }
}

// ============================================================================
// Phase 3 Extensions: Authentication, Rate Limiting, Session Revocation & RBAC Routing
// ============================================================================
EnterpriseDatabaseEngine.prototype.checkRateLimit = function (key, maxAttempts = 5, windowMs = 15 * 60 * 1000) {
  const now = Date.now();
  const bucket = this.rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }
  bucket.count += 1;
  this.rateLimitBuckets.set(key, bucket);
  if (bucket.count > maxAttempts) {
    throw new Error('RATE_LIMITED: Too many authentication attempts. Please try again later.');
  }
};

EnterpriseDatabaseEngine.prototype.sanitizeRedirectPath = function (redirectParam, role) {
  const defaultPath = role === 'admin' ? '/admin' : '/employee';
  if (!redirectParam || typeof redirectParam !== 'string') {
    return defaultPath;
  }
  const trimmed = redirectParam.trim();
  // Prevent open redirects (must start with single '/' and not '//' or '/\\')
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\') || trimmed.includes('://')) {
    return defaultPath;
  }
  if (role === 'employee' && trimmed.startsWith('/admin')) {
    return '/employee';
  }
  return trimmed;
};

EnterpriseDatabaseEngine.prototype.signIn = function ({ email, password, clientIp = '127.0.0.1', redirectTo = null }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  this.checkRateLimit(`login:${clientIp}:${normalizedEmail}`, 5);

  const authUser = [...this.auth_users.values()].find((u) => u.email === normalizedEmail);
  if (!authUser) {
    // Constant-time dummy hash to mitigate timing enumeration
    crypto.scryptSync(String(password || ''), 'dummy-salt', 32);
    throw new Error('AUTH_INVALID_CREDENTIALS: Invalid email or password.');
  }

  const computedHash = crypto.scryptSync(String(password || ''), authUser.id, 32).toString('hex');
  if (computedHash !== authUser.passwordHash) {
    throw new Error('AUTH_INVALID_CREDENTIALS: Invalid email or password.');
  }

  const profile = this.profiles.get(authUser.id);
  if (!profile || profile.deleted_at !== null || profile.account_status !== 'active') {
    throw new Error('AUTH_ACCOUNT_INACTIVE: Your account is not active. Please contact your administrator.');
  }

  const roleRecord = this.user_roles.get(authUser.id);
  const role = roleRecord ? roleRecord.role : 'employee';

  // Reset rate limit on successful login
  this.rateLimitBuckets.delete(`login:${clientIp}:${normalizedEmail}`);

  profile.last_active_at = new Date().toISOString();

  const sessionToken = Buffer.from(
    JSON.stringify({
      sub: authUser.id,
      org: profile.organization_id,
      role,
      ver: authUser.sessionVersion,
      exp: Date.now() + 8 * 60 * 60 * 1000
    })
  ).toString('base64url');

  return {
    sessionToken,
    user: {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role,
      organization_id: profile.organization_id
    },
    redirectUrl: this.sanitizeRedirectPath(redirectTo, role)
  };
};

EnterpriseDatabaseEngine.prototype.verifySession = function (sessionToken) {
  if (!sessionToken || typeof sessionToken !== 'string') {
    throw new Error('UNAUTHENTICATED: Missing session token.');
  }
  let payload;
  try {
    payload = JSON.parse(Buffer.from(sessionToken, 'base64url').toString('utf8'));
  } catch {
    throw new Error('UNAUTHENTICATED: Malformed session token.');
  }
  if (!payload.exp || Date.now() > payload.exp) {
    throw new Error('SESSION_EXPIRED: Session has expired.');
  }
  const authUser = this.auth_users.get(payload.sub);
  if (!authUser || authUser.sessionVersion !== payload.ver) {
    throw new Error('SESSION_REVOKED: Session has been revoked.');
  }
  const actor = this._resolveActor(payload.sub);
  return actor;
};

EnterpriseDatabaseEngine.prototype.authorizeRoute = function ({ sessionToken, pathname }) {
  const publicPaths = ['/login', '/reset-password', '/setup-password'];
  if (publicPaths.includes(pathname)) {
    return { allowed: true, redirect: null };
  }
  let actor;
  try {
    actor = this.verifySession(sessionToken);
  } catch {
    return { allowed: false, status: 401, redirect: `/login?redirect=${encodeURIComponent(pathname)}` };
  }
  if (pathname.startsWith('/admin') && actor.role !== 'admin') {
    return { allowed: false, status: 403, redirect: '/employee' };
  }
  return { allowed: true, status: 200, actor, redirect: null };
};

// ============================================================================
// Phase 4 Extensions: Admin Employee Management, Multi-Employee Tasks,
// Reviews, Summary Metrics, Leaderboard, Audit Logs, and Safe CSV Exports
// ============================================================================

EnterpriseDatabaseEngine.prototype.createEmployee = function (actorId, payload) {
  const admin = this._requireAdmin(actorId);
  const fullName = String(payload.full_name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const department = payload.department ? String(payload.department).trim() : null;
  const jobTitle = payload.job_title ? String(payload.job_title).trim() : null;
  const employeeNumber = payload.employee_number ? String(payload.employee_number).trim() : null;
  const accountStatus = payload.account_status || 'active';

  if (fullName.length < 2 || fullName.length > 120) {
    throw new Error('VALIDATION_ERROR: Full name must be between 2 and 120 characters.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('VALIDATION_ERROR: Invalid email format.');
  }
  for (const existing of this.profiles.values()) {
    if (existing.email === email) {
      throw new Error('CONFLICT_DUPLICATE_EMAIL: An account with this email already exists.');
    }
    if (
      employeeNumber &&
      existing.organization_id === admin.organization_id &&
      existing.employee_number === employeeNumber
    ) {
      throw new Error('CONFLICT_EMPLOYEE_NUMBER: Employee number is already in use.');
    }
  }

  const userId = crypto.randomUUID();
  const tempPasswordSetupToken = crypto.randomBytes(24).toString('hex');
  const initialTempPassword = payload.initial_password || `Tmp#${crypto.randomBytes(6).toString('hex')}!`;

  this.auth_users.set(userId, {
    id: userId,
    email,
    passwordHash: crypto.scryptSync(initialTempPassword, userId, 32).toString('hex'),
    sessionVersion: 1,
    setupToken: tempPasswordSetupToken
  });

  const now = new Date().toISOString();
  const profile = {
    id: userId,
    organization_id: admin.organization_id,
    email,
    full_name: fullName,
    department,
    job_title: jobTitle,
    employee_number: employeeNumber || `EMP-${String(this.profiles.size + 1).padStart(3, '0')}`,
    avatar_url: payload.avatar_url || null,
    account_status: accountStatus,
    last_active_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null
  };

  this.profiles.set(userId, profile);
  this.user_roles.set(userId, {
    user_id: userId,
    organization_id: admin.organization_id,
    role: 'employee',
    granted_by: admin.id,
    created_at: now,
    updated_at: now
  });

  this._logActivity(admin.organization_id, admin.id, 'employee.created', 'profile', userId, {
    employee_number: profile.employee_number,
    department: profile.department,
    account_status: profile.account_status
  });

  this._emitRealtime('profiles', 'INSERT', profile, admin.organization_id);

  return {
    profile: structuredClone(profile),
    invitationSetupToken: tempPasswordSetupToken
  };
};

EnterpriseDatabaseEngine.prototype.setEmployeeStatus = function (actorId, employeeId, newStatus) {
  const admin = this._requireAdmin(actorId);
  const profile = this.profiles.get(employeeId);
  if (!profile || profile.organization_id !== admin.organization_id || profile.deleted_at !== null) {
    throw new Error('NOT_FOUND: Employee not found.');
  }
  if (!['active', 'deactivated', 'invited'].includes(newStatus)) {
    throw new Error('VALIDATION_ERROR: Invalid account status.');
  }
  if (employeeId === admin.id && newStatus !== 'active') {
    throw new Error('VALIDATION_ERROR: Administrator cannot deactivate their own account.');
  }

  profile.account_status = newStatus;
  profile.updated_at = new Date().toISOString();

  // Revoke active sessions immediately when deactivated
  if (newStatus === 'deactivated') {
    const authUser = this.auth_users.get(employeeId);
    if (authUser) {
      authUser.sessionVersion += 1;
    }
  }

  this._logActivity(
    admin.organization_id,
    admin.id,
    newStatus === 'deactivated' ? 'employee.deactivated' : 'employee.status_updated',
    'profile',
    employeeId,
    { new_status: newStatus }
  );

  this._emitRealtime('profiles', 'UPDATE', profile, admin.organization_id);
  return structuredClone(profile);
};

EnterpriseDatabaseEngine.prototype.archiveEmployee = function (actorId, employeeId) {
  const admin = this._requireAdmin(actorId);
  const profile = this.profiles.get(employeeId);
  if (!profile || profile.organization_id !== admin.organization_id) {
    throw new Error('NOT_FOUND: Employee not found.');
  }
  if (employeeId === admin.id) {
    throw new Error('VALIDATION_ERROR: Cannot archive your own administrator account.');
  }

  const now = new Date().toISOString();
  profile.account_status = 'archived';
  profile.deleted_at = now;
  profile.updated_at = now;

  const authUser = this.auth_users.get(employeeId);
  if (authUser) {
    authUser.sessionVersion += 1;
  }

  this._logActivity(admin.organization_id, admin.id, 'employee.archived', 'profile', employeeId, {
    preserved_assignments: [...this.task_assignments.values()].filter((a) => a.employee_id === employeeId).length
  });

  return structuredClone(profile);
};

EnterpriseDatabaseEngine.prototype.createTaskAndAssign = function (actorId, payload) {
  const admin = this._requireAdmin(actorId);
  const title = String(payload.title || '').trim();
  const description = String(payload.description || '').trim();
  const priority = payload.priority || 'medium';
  const startDate = new Date(payload.start_date);
  const dueDate = new Date(payload.due_date);
  const employeeIds = Array.isArray(payload.assigned_employee_ids)
    ? [...new Set(payload.assigned_employee_ids)]
    : [];

  if (title.length < 3 || title.length > 200) {
    throw new Error('VALIDATION_ERROR: Task title must be between 3 and 200 characters.');
  }
  if (description.length < 10 || description.length > 5000) {
    throw new Error('VALIDATION_ERROR: Task description must be between 10 and 5000 characters.');
  }
  if (!['low', 'medium', 'high', 'critical'].includes(priority)) {
    throw new Error('VALIDATION_ERROR: Invalid task priority.');
  }
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(dueDate.getTime()) || dueDate < startDate) {
    throw new Error('VALIDATION_ERROR: due_date must be valid and on or after start_date.');
  }
  if (employeeIds.length === 0) {
    throw new Error('VALIDATION_ERROR: At least one employee must be assigned.');
  }

  for (const empId of employeeIds) {
    const emp = this.profiles.get(empId);
    if (!emp || emp.organization_id !== admin.organization_id || emp.deleted_at !== null) {
      throw new Error(`VALIDATION_ERROR: Assigned employee ${empId} is invalid.`);
    }
  }

  const now = new Date().toISOString();
  const taskId = crypto.randomUUID();
  const task = {
    id: taskId,
    organization_id: admin.organization_id,
    title,
    description,
    priority,
    category: payload.category ? String(payload.category).trim() : 'General',
    start_date: startDate.toISOString(),
    due_date: dueDate.toISOString(),
    estimated_effort_hours: payload.estimated_effort_hours ?? null,
    completion_criteria: payload.completion_criteria ?? null,
    checklist: Array.isArray(payload.checklist) ? payload.checklist : [],
    task_status: 'active',
    created_by: admin.id,
    created_at: now,
    updated_at: now,
    canceled_at: null
  };
  this.tasks.set(taskId, task);

  this._logActivity(admin.organization_id, admin.id, 'task.created', 'task', taskId, {
    title,
    priority,
    assigned_count: employeeIds.length
  });

  const createdAssignments = [];
  for (const empId of employeeIds) {
    const assignmentId = crypto.randomUUID();
    const assignment = {
      id: assignmentId,
      organization_id: admin.organization_id,
      task_id: taskId,
      employee_id: empId,
      assigned_by: admin.id,
      status: 'not_started',
      progress_percentage: 0,
      latest_progress_note: null,
      started_at: null,
      submitted_at: null,
      completed_at: null,
      canceled_at: null,
      version: 1,
      created_at: now,
      updated_at: now
    };
    this.task_assignments.set(assignmentId, assignment);
    createdAssignments.push(assignment);

    this._logActivity(admin.organization_id, admin.id, 'task.assigned', 'task_assignment', assignmentId, {
      task_id: taskId,
      employee_id: empId
    });

    this._createNotification({
      organization_id: admin.organization_id,
      recipient_id: empId,
      actor_id: admin.id,
      event_type: 'task_assigned',
      title: `New Task Assigned: ${title}`,
      body: `You have been assigned to "${title}" (Priority: ${priority.toUpperCase()}).`,
      related_task_id: taskId,
      related_assignment_id: assignmentId,
      idempotency_key: `assign:${assignmentId}:${empId}`
    });

    this._emitRealtime('task_assignments', 'INSERT', assignment, admin.organization_id);
  }

  return {
    task: structuredClone(task),
    assignments: structuredClone(createdAssignments)
  };
};

EnterpriseDatabaseEngine.prototype.cancelAssignment = function (actorId, assignmentId, reason = 'Administrative cancellation') {
  const admin = this._requireAdmin(actorId);
  const assignment = this.task_assignments.get(assignmentId);
  if (!assignment || assignment.organization_id !== admin.organization_id) {
    throw new Error('NOT_FOUND: Assignment not found.');
  }
  const now = new Date().toISOString();
  assignment.status = 'canceled';
  assignment.canceled_at = now;
  assignment.version += 1;
  assignment.updated_at = now;

  this._logActivity(admin.organization_id, admin.id, 'task.canceled', 'task_assignment', assignmentId, {
    reason
  });
  this._emitRealtime('task_assignments', 'UPDATE', assignment, admin.organization_id);
  return structuredClone(assignment);
};

EnterpriseDatabaseEngine.prototype.reviewTaskSubmission = function (actorId, { assignment_id, decision, review_notes = null, quality_bonus = 0 }) {
  const admin = this._requireAdmin(actorId);
  const assignment = this.task_assignments.get(assignment_id);
  if (!assignment || assignment.organization_id !== admin.organization_id) {
    throw new Error('NOT_FOUND: Assignment not found.');
  }
  if (assignment.status !== 'awaiting_review') {
    throw new Error('INVALID_TRANSITION: Assignment must be in awaiting_review status to be reviewed.');
  }
  if (!['approved', 'rejected', 'changes_requested'].includes(decision)) {
    throw new Error('VALIDATION_ERROR: Invalid review decision.');
  }
  if (decision !== 'approved' && (!review_notes || String(review_notes).trim().length < 5)) {
    throw new Error('VALIDATION_ERROR: Rejection or change request requires an explanation of at least 5 characters.');
  }

  const submissions = [...this.task_submissions.values()]
    .filter((s) => s.assignment_id === assignment_id)
    .sort((a, b) => b.version - a.version);
  const latestSubmission = submissions[0] || null;
  const task = this.tasks.get(assignment.task_id);

  const now = new Date().toISOString();
  const reviewId = crypto.randomUUID();
  const review = Object.freeze({
    id: reviewId,
    organization_id: admin.organization_id,
    assignment_id,
    submission_id: latestSubmission ? latestSubmission.id : null,
    reviewer_id: admin.id,
    decision,
    review_notes: review_notes ? String(review_notes).trim() : null,
    quality_bonus: decision === 'approved' ? Math.min(20, Math.max(0, Number(quality_bonus) || 0)) : 0,
    created_at: now
  });
  this.task_reviews.set(reviewId, review);

  if (decision === 'approved') {
    assignment.status = 'approved';
    assignment.completed_at = now;
  } else {
    assignment.status = 'rejected';
    assignment.completed_at = null;
  }
  assignment.version += 1;
  assignment.updated_at = now;

  this._logActivity(
    admin.organization_id,
    admin.id,
    decision === 'approved' ? 'task.completion_approved' : 'task.completion_rejected',
    'task_assignment',
    assignment.id,
    { task_id: task.id, decision, review_notes: review.review_notes, quality_bonus: review.quality_bonus }
  );

  this._createNotification({
    organization_id: admin.organization_id,
    recipient_id: assignment.employee_id,
    actor_id: admin.id,
    event_type: decision === 'approved' ? 'task_approved' : 'task_rejected',
    title: decision === 'approved' ? `Task Approved: ${task.title}` : `Changes Requested: ${task.title}`,
    body:
      decision === 'approved'
        ? `Your completion submission for "${task.title}" was approved.`
        : `Your submission for "${task.title}" requires revisions: ${review.review_notes}`,
    related_task_id: task.id,
    related_assignment_id: assignment.id,
    idempotency_key: `review:${reviewId}:${assignment.employee_id}`
  });

  this._emitRealtime('task_assignments', 'UPDATE', assignment, admin.organization_id);
  this._emitRealtime('task_reviews', 'INSERT', review, admin.organization_id);
  return structuredClone(review);
};

EnterpriseDatabaseEngine.prototype.getAdminDashboardSummary = function (actorId, referenceDate = new Date()) {
  const admin = this._requireAdmin(actorId);
  const nowMs = referenceDate.getTime();

  const orgProfiles = [...this.profiles.values()].filter(
    (p) =>
      p.organization_id === admin.organization_id &&
      p.deleted_at === null &&
      this.user_roles.get(p.id)?.role === 'employee'
  );
  const totalEmployees = orgProfiles.length;
  const activeEmployees = orgProfiles.filter((p) => p.account_status === 'active').length;

  // Exclude canceled assignments from completion rate denominator per Section 5.A
  const validAssignments = [...this.task_assignments.values()].filter(
    (a) => a.organization_id === admin.organization_id && a.status !== 'canceled'
  );

  const totalAssignedTasks = validAssignments.length;
  const tasksNotStarted = validAssignments.filter((a) => a.status === 'not_started').length;
  const tasksInProgress = validAssignments.filter((a) => a.status === 'in_progress' || a.status === 'rejected').length;
  const tasksAwaitingReview = validAssignments.filter((a) => a.status === 'awaiting_review').length;
  const completedApprovedTasks = validAssignments.filter((a) => a.status === 'approved').length;

  const overdueTasks = validAssignments.filter((a) => {
    if (a.status === 'approved' || a.status === 'canceled') return false;
    const task = this.tasks.get(a.task_id);
    return task && new Date(task.due_date).getTime() < nowMs;
  }).length;

  const overallCompletionRate =
    totalAssignedTasks > 0 ? Number(((completedApprovedTasks / totalAssignedTasks) * 100).toFixed(1)) : 0;

  return {
    totalEmployees,
    activeEmployees,
    totalAssignedTasks,
    tasksNotStarted,
    tasksInProgress,
    tasksAwaitingReview,
    completedApprovedTasks,
    overdueTasks,
    overallCompletionRate
  };
};

EnterpriseDatabaseEngine.prototype.getLeaderboard = function (actorId, { periodStart = null, periodEnd = null } = {}) {
  const actor = this._resolveActor(actorId);
  const org = this.organizations.get(actor.organization_id);
  const config = org.scoring_config;

  const employees = [...this.profiles.values()].filter(
    (p) =>
      p.organization_id === actor.organization_id &&
      p.deleted_at === null &&
      this.user_roles.get(p.id)?.role === 'employee'
  );

  const rows = employees.map((emp) => {
    const allAssignments = [...this.task_assignments.values()].filter(
      (a) =>
        a.employee_id === emp.id &&
        a.status !== 'canceled' &&
        (!periodStart || new Date(a.created_at) >= new Date(periodStart)) &&
        (!periodEnd || new Date(a.created_at) <= new Date(periodEnd))
    );

    const approvedAssignments = allAssignments.filter((a) => a.status === 'approved');
    const currentActiveCount = allAssignments.filter((a) =>
      ['not_started', 'in_progress', 'rejected', 'awaiting_review'].includes(a.status)
    ).length;

    let onTimeCount = 0;
    let totalCompletionHours = 0;
    let weightedScore = 0;

    for (const a of approvedAssignments) {
      const task = this.tasks.get(a.task_id);
      const isOnTime = a.completed_at && task && new Date(a.completed_at) <= new Date(task.due_date);
      if (isOnTime) onTimeCount += 1;

      const startMs = new Date(a.started_at || a.created_at).getTime();
      const endMs = new Date(a.completed_at).getTime();
      totalCompletionHours += Math.max(0.1, (endMs - startMs) / (1000 * 60 * 60));

      const priorityWeight = config.priority_weights[task?.priority || 'medium'] || 1.0;
      const reviews = [...this.task_reviews.values()].filter(
        (r) => r.assignment_id === a.id && r.decision === 'approved'
      );
      const qualityBonus = reviews.length > 0 ? reviews[reviews.length - 1].quality_bonus : 0;

      weightedScore += Math.round(
        config.base_points * priorityWeight + (isOnTime ? config.on_time_bonus : 0) + qualityBonus
      );
    }

    const totalAssigned = allAssignments.length;
    const approvedCount = approvedAssignments.length;
    const completionRate = totalAssigned > 0 ? Number(((approvedCount / totalAssigned) * 100).toFixed(1)) : 0;
    const onTimeRate = approvedCount > 0 ? Number(((onTimeCount / approvedCount) * 100).toFixed(1)) : 0;
    const avgCompletionHours =
      approvedCount > 0 ? Number((totalCompletionHours / approvedCount).toFixed(2)) : null;

    return {
      employee_id: emp.id,
      full_name: emp.full_name,
      department: emp.department || 'Unassigned',
      job_title: emp.job_title || 'Employee',
      approved_completed_tasks: approvedCount,
      total_assigned_tasks: totalAssigned,
      current_task_count: currentActiveCount,
      completion_rate: completionRate,
      on_time_completion_rate: onTimeRate,
      avg_completion_hours: avgCompletionHours,
      weighted_score: weightedScore
    };
  });

  // Primary Ranking:
  // 1. Approved completed assignments DESC
  // 2. On-time completion rate DESC
  // 3. Average completion time ASC (nulls last)
  // 4. Weighted score DESC
  rows.sort((a, b) => {
    if (b.approved_completed_tasks !== a.approved_completed_tasks) {
      return b.approved_completed_tasks - a.approved_completed_tasks;
    }
    if (b.on_time_completion_rate !== a.on_time_completion_rate) {
      return b.on_time_completion_rate - a.on_time_completion_rate;
    }
    if (a.avg_completion_hours !== null && b.avg_completion_hours !== null) {
      if (a.avg_completion_hours !== b.avg_completion_hours) {
        return a.avg_completion_hours - b.avg_completion_hours;
      }
    }
    return b.weighted_score - a.weighted_score;
  });

  return rows.map((row, idx) => ({ rank: idx + 1, ...row }));
};

EnterpriseDatabaseEngine.prototype.sanitizeCsvCell = function (value) {
  const str = String(value ?? '');
  // Prevent CSV Formula Injection (OWASP CSV Injection defense)
  const formulaSafe = /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(formulaSafe)) {
    return `"${formulaSafe.replace(/"/g, '""')}"`;
  }
  return formulaSafe;
};

EnterpriseDatabaseEngine.prototype.exportPerformanceCsv = function (actorId) {
  this._requireAdmin(actorId);
  const leaderboard = this.getLeaderboard(actorId);
  const headers = [
    'Rank',
    'Employee Name',
    'Department',
    'Approved Completed Tasks',
    'Total Assigned Tasks',
    'Completion Rate (%)',
    'On-Time Rate (%)',
    'Current Active Workload',
    'Weighted Score'
  ];
  const lines = [headers.join(',')];
  for (const row of leaderboard) {
    lines.push(
      [
        row.rank,
        this.sanitizeCsvCell(row.full_name),
        this.sanitizeCsvCell(row.department),
        row.approved_completed_tasks,
        row.total_assigned_tasks,
        row.completion_rate,
        row.on_time_completion_rate,
        row.current_task_count,
        row.weighted_score
      ].join(',')
    );
  }
  return lines.join('\n');
};

// ============================================================================
// Phase 5 Extensions: Employee Workflows (My Tasks, Atomic Start, Append-Only
// Progress Updates, Versioned Completion Submissions, and Profile Security)
// ============================================================================

EnterpriseDatabaseEngine.prototype.getPrimaryActionForStatus = function (status, locale = 'en') {
  const map = {
    en: {
      not_started: 'Start Task',
      in_progress: 'Update Progress',
      awaiting_review: 'View Submission',
      rejected: 'Revise and Resubmit',
      approved: 'View Completed Task',
      canceled: 'Canceled'
    },
    ar: {
      not_started: 'بدء المهمة',
      in_progress: 'تحديث التقدم',
      awaiting_review: 'عرض التسليم',
      rejected: 'تعديل وإعادة الإرسال',
      approved: 'عرض المهمة المكتملة',
      canceled: 'ملغاة'
    }
  };
  return (map[locale] || map.en)[status] || 'View Task';
};

EnterpriseDatabaseEngine.prototype.getEmployeeAssignments = function (actorId, targetEmployeeId = null) {
  const actor = this._resolveActor(actorId);
  const effectiveEmpId = targetEmployeeId || actor.id;

  // RLS enforcement: Employees can never read another employee's private assignments
  if (actor.role !== 'admin' && effectiveEmpId !== actor.id) {
    throw new Error('FORBIDDEN_RLS: Employees may only view their own task assignments.');
  }

  const assignments = [...this.task_assignments.values()]
    .filter((a) => a.organization_id === actor.organization_id && a.employee_id === effectiveEmpId)
    .map((a) => {
      const task = this.tasks.get(a.task_id);
      const history = [...this.task_progress_updates.values()]
        .filter((u) => u.assignment_id === a.id)
        .sort((x, y) => (new Date(y.created_at) - new Date(x.created_at)) || ((y.seq || 0) - (x.seq || 0)));
      const submissions = [...this.task_submissions.values()]
        .filter((s) => s.assignment_id === a.id)
        .sort((x, y) => y.version - x.version);
      const reviews = [...this.task_reviews.values()]
        .filter((r) => r.assignment_id === a.id)
        .sort((x, y) => (new Date(y.created_at) - new Date(x.created_at)) || ((y.seq || 0) - (x.seq || 0)));

      return {
        ...structuredClone(a),
        task: structuredClone(task),
        primary_action_en: this.getPrimaryActionForStatus(a.status, 'en'),
        primary_action_ar: this.getPrimaryActionForStatus(a.status, 'ar'),
        progress_history: structuredClone(history),
        submissions: structuredClone(submissions),
        reviews: structuredClone(reviews)
      };
    });

  return assignments;
};

EnterpriseDatabaseEngine.prototype.startTaskAssignment = function (actorId, { assignment_id, expected_version = null }) {
  const actor = this._resolveActor(actorId);
  const assignment = this.task_assignments.get(assignment_id);
  if (!assignment) {
    throw new Error('NOT_FOUND: Task assignment does not exist.');
  }
  if (assignment.employee_id !== actor.id || assignment.organization_id !== actor.organization_id) {
    throw new Error('FORBIDDEN_RLS: You are not assigned to this task.');
  }
  const task = this.tasks.get(assignment.task_id);
  if (!task || task.task_status === 'canceled' || assignment.status === 'canceled') {
    throw new Error('INVALID_STATE: Cannot start a canceled task.');
  }
  if (assignment.status !== 'not_started') {
    throw new Error(`INVALID_TRANSITION: Task cannot be started from status "${assignment.status}".`);
  }
  if (expected_version !== null && assignment.version !== expected_version) {
    throw new Error('CONFLICT: Assignment was modified concurrently.');
  }

  const now = new Date().toISOString();
  assignment.status = 'in_progress';
  assignment.started_at = assignment.started_at || now;
  assignment.version += 1;
  assignment.updated_at = now;

  this._logActivity(actor.organization_id, actor.id, 'task.started', 'task_assignment', assignment.id, {
    task_id: task.id,
    task_title: task.title
  });

  this._notifyOrgAdmins({
    organization_id: actor.organization_id,
    actor_id: actor.id,
    event_type: 'task_started',
    title: `Task Started: ${task.title}`,
    body: `${actor.full_name} started working on "${task.title}".`,
    related_task_id: task.id,
    related_assignment_id: assignment.id,
    keyPrefix: `start:${assignment.id}`
  });

  this._emitRealtime('task_assignments', 'UPDATE', assignment, actor.organization_id);
  return structuredClone(assignment);
};

EnterpriseDatabaseEngine.prototype.recordProgressUpdate = function (
  actorId,
  {
    assignment_id,
    new_percentage,
    description,
    blockers = null,
    next_steps = null,
    idempotency_key = null,
    expected_version = null
  }
) {
  const actor = this._resolveActor(actorId);

  if (typeof new_percentage !== 'number' || !Number.isInteger(new_percentage) || new_percentage < 0 || new_percentage > 100) {
    throw new Error('VALIDATION_ERROR: Progress percentage must be an integer between 0 and 100.');
  }
  const cleanDesc = String(description || '').trim();
  if (cleanDesc.length < 5 || cleanDesc.length > 3000) {
    throw new Error('VALIDATION_ERROR: A meaningful work description (5 to 3000 chars) is required.');
  }

  // Idempotency protection: return existing update without duplicating history or notifications
  if (idempotency_key) {
    for (const existing of this.task_progress_updates.values()) {
      if (existing.idempotency_key === idempotency_key) {
        return structuredClone(existing);
      }
    }
  }

  const assignment = this.task_assignments.get(assignment_id);
  if (!assignment) {
    throw new Error('NOT_FOUND: Task assignment not found.');
  }
  if (assignment.employee_id !== actor.id || assignment.organization_id !== actor.organization_id) {
    throw new Error('FORBIDDEN_RLS: You cannot update progress on another employee’s task.');
  }
  if (!['in_progress', 'rejected'].includes(assignment.status)) {
    throw new Error(`INVALID_TRANSITION: Task must be in_progress or rejected to update progress (current: ${assignment.status}).`);
  }
  if (expected_version !== null && assignment.version !== expected_version) {
    throw new Error('CONFLICT: Stale progress update rejected due to concurrent modification.');
  }

  const task = this.tasks.get(assignment.task_id);
  const previousPercentage = assignment.progress_percentage;
  const now = new Date().toISOString();
  const updateId = crypto.randomUUID();
  const seq = ++this._seq;

  const progressRecord = Object.freeze({
    seq,
    id: updateId,
    organization_id: actor.organization_id,
    assignment_id: assignment.id,
    employee_id: actor.id,
    previous_percentage: previousPercentage,
    new_percentage,
    description: cleanDesc,
    blockers: blockers ? String(blockers).trim() : null,
    next_steps: next_steps ? String(next_steps).trim() : null,
    idempotency_key,
    created_at: now
  });

  this.task_progress_updates.set(updateId, progressRecord);

  // Note: 100% progress does NOT automatically mark the task approved or submitted!
  assignment.progress_percentage = new_percentage;
  assignment.status = 'in_progress';
  assignment.latest_progress_note = cleanDesc;
  assignment.version += 1;
  assignment.updated_at = now;

  this._logActivity(actor.organization_id, actor.id, 'task.progress_updated', 'task_assignment', assignment.id, {
    task_id: task.id,
    previous_percentage: previousPercentage,
    new_percentage
  });

  this._notifyOrgAdmins({
    organization_id: actor.organization_id,
    actor_id: actor.id,
    event_type: 'progress_updated',
    title: `Progress Updated (${new_percentage}%): ${task.title}`,
    body: `${actor.full_name} updated "${task.title}" from ${previousPercentage}% to ${new_percentage}%.`,
    related_task_id: task.id,
    related_assignment_id: assignment.id,
    keyPrefix: `progress:${updateId}`
  });

  this._emitRealtime('task_progress_updates', 'INSERT', progressRecord, actor.organization_id);
  this._emitRealtime('task_assignments', 'UPDATE', assignment, actor.organization_id);

  return structuredClone(progressRecord);
};

EnterpriseDatabaseEngine.prototype.submitTaskForReview = function (
  actorId,
  { assignment_id, submission_summary, evidence_links = [] }
) {
  const actor = this._resolveActor(actorId);
  const assignment = this.task_assignments.get(assignment_id);
  if (!assignment) {
    throw new Error('NOT_FOUND: Assignment not found.');
  }
  if (assignment.employee_id !== actor.id || assignment.organization_id !== actor.organization_id) {
    throw new Error('FORBIDDEN_RLS: Unauthorized submission attempt.');
  }
  if (!['in_progress', 'rejected'].includes(assignment.status)) {
    throw new Error(`INVALID_TRANSITION: Cannot submit task from status "${assignment.status}".`);
  }
  if (assignment.progress_percentage !== 100) {
    throw new Error('VALIDATION_ERROR: Progress percentage must be 100% before submitting for completion review.');
  }
  const cleanSummary = String(submission_summary || '').trim();
  if (cleanSummary.length < 10) {
    throw new Error('VALIDATION_ERROR: Completion summary must be at least 10 characters.');
  }

  const existingSubmissions = [...this.task_submissions.values()].filter((s) => s.assignment_id === assignment.id);
  const nextVersion = existingSubmissions.length + 1;
  const now = new Date().toISOString();
  const submissionId = crypto.randomUUID();
  const task = this.tasks.get(assignment.task_id);

  const submission = Object.freeze({
    id: submissionId,
    organization_id: actor.organization_id,
    assignment_id: assignment.id,
    employee_id: actor.id,
    submission_summary: cleanSummary,
    evidence_links: Array.isArray(evidence_links) ? evidence_links : [],
    version: nextVersion,
    submitted_at: now
  });

  this.task_submissions.set(submissionId, submission);

  assignment.status = 'awaiting_review';
  assignment.submitted_at = now;
  assignment.version += 1;
  assignment.updated_at = now;

  this._logActivity(actor.organization_id, actor.id, 'task.submitted_for_review', 'task_assignment', assignment.id, {
    task_id: task.id,
    submission_version: nextVersion
  });

  this._notifyOrgAdmins({
    organization_id: actor.organization_id,
    actor_id: actor.id,
    event_type: 'task_submitted',
    title: `Review Requested: ${task.title}`,
    body: `${actor.full_name} submitted "${task.title}" (v${nextVersion}) for completion review.`,
    related_task_id: task.id,
    related_assignment_id: assignment.id,
    keyPrefix: `submit:${submissionId}`
  });

  this._emitRealtime('task_submissions', 'INSERT', submission, actor.organization_id);
  this._emitRealtime('task_assignments', 'UPDATE', assignment, actor.organization_id);
  return structuredClone(submission);
};

EnterpriseDatabaseEngine.prototype.updateOwnProfile = function (actorId, updates) {
  const actor = this._resolveActor(actorId);
  const forbiddenFields = ['role', 'account_status', 'organization_id', 'department', 'job_title', 'employee_number', 'email', 'deleted_at'];
  for (const field of forbiddenFields) {
    if (field in updates) {
      throw new Error(`UNAUTHORIZED_FIELD_MODIFICATION: Employees cannot modify protected field "${field}".`);
    }
  }
  const profile = this.profiles.get(actor.id);
  if (updates.full_name !== undefined) {
    const cleanName = String(updates.full_name).trim();
    if (cleanName.length < 2 || cleanName.length > 120) {
      throw new Error('VALIDATION_ERROR: Full name must be between 2 and 120 characters.');
    }
    profile.full_name = cleanName;
  }
  if (updates.avatar_url !== undefined) {
    profile.avatar_url = updates.avatar_url;
  }
  profile.updated_at = new Date().toISOString();
  return structuredClone(profile);
};

EnterpriseDatabaseEngine.prototype.getNotificationsForUser = function (actorId, targetUserId = null) {
  const actor = this._resolveActor(actorId);
  const effectiveUserId = targetUserId || actor.id;
  if (effectiveUserId !== actor.id) {
    throw new Error('FORBIDDEN_RLS: Users may only read their own notifications.');
  }
  return [...this.notifications.values()]
    .filter((n) => n.recipient_id === actor.id && n.organization_id === actor.organization_id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((n) => structuredClone(n));
};

EnterpriseDatabaseEngine.prototype.markNotificationRead = function (actorId, notificationId) {
  const actor = this._resolveActor(actorId);
  const notif = this.notifications.get(notificationId);
  if (!notif || notif.recipient_id !== actor.id) {
    throw new Error('FORBIDDEN_RLS: Cannot modify another user’s notification.');
  }
  notif.read_at = notif.read_at || new Date().toISOString();
  return structuredClone(notif);
};

EnterpriseDatabaseEngine.prototype.markAllNotificationsRead = function (actorId) {
  const actor = this._resolveActor(actorId);
  const now = new Date().toISOString();
  let count = 0;
  for (const notif of this.notifications.values()) {
    if (notif.recipient_id === actor.id && !notif.read_at) {
      notif.read_at = now;
      count += 1;
    }
  }
  return { updatedCount: count };
};

// ============================================================================
// Phase 6 Extensions: Authorized Realtime Channel Subscriptions, Optimistic
// Concurrency Control, Idempotency Verification, and Persistence Serialization
// ============================================================================

EnterpriseDatabaseEngine.prototype.subscribeAuthorizedRealtime = function (actorId, callback) {
  const actor = this._resolveActor(actorId);
  const wrappedListener = (event) => {
    // Re-verify actor is still active on every event
    let currentActor;
    try {
      currentActor = this._resolveActor(actorId);
    } catch {
      return;
    }
    if (event.organizationId !== currentActor.organization_id) {
      return;
    }
    if (event.table === 'notifications') {
      if (event.record.recipient_id !== currentActor.id) return;
    } else if (currentActor.role !== 'admin') {
      // Employee only receives realtime updates for their own assignments/progress/reviews
      const rec = event.record;
      const empId = rec.employee_id || null;
      if (empId && empId !== currentActor.id) return;
      if (event.table === 'task_reviews') {
        const assignment = this.task_assignments.get(rec.assignment_id);
        if (!assignment || assignment.employee_id !== currentActor.id) return;
      }
      if (event.table === 'activity_logs' || event.table === 'profiles') {
        return;
      }
    }
    callback(event);
  };
  this.realtimeListeners.add(wrappedListener);
  return () => {
    this.realtimeListeners.delete(wrappedListener);
  };
};

EnterpriseDatabaseEngine.prototype.exportSnapshot = function () {
  return JSON.stringify({
    organizations: [...this.organizations.entries()],
    profiles: [...this.profiles.entries()],
    user_roles: [...this.user_roles.entries()],
    tasks: [...this.tasks.entries()],
    task_assignments: [...this.task_assignments.entries()],
    task_progress_updates: [...this.task_progress_updates.entries()],
    task_submissions: [...this.task_submissions.entries()],
    task_reviews: [...this.task_reviews.entries()],
    notifications: [...this.notifications.entries()],
    activity_logs: [...this.activity_logs.entries()]
  });
};

EnterpriseDatabaseEngine.prototype.restoreSnapshot = function (jsonString) {
  const data = JSON.parse(jsonString);
  this.organizations = new Map(data.organizations);
  this.profiles = new Map(data.profiles);
  this.user_roles = new Map(data.user_roles);
  this.tasks = new Map(data.tasks);
  this.task_assignments = new Map(data.task_assignments);
  this.task_progress_updates = new Map(data.task_progress_updates);
  this.task_submissions = new Map(data.task_submissions);
  this.task_reviews = new Map(data.task_reviews);
  this.notifications = new Map(data.notifications);
  this.activity_logs = new Map(data.activity_logs);
};
