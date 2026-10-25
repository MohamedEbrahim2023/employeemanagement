import test from 'node:test';
import assert from 'node:assert/strict';
import { EnterpriseDatabaseEngine } from '../../src/lib/services/database-engine.mjs';

test('Phase 3.1: Administrator can sign in, receives admin redirect, and invalid credentials fail with generic message', () => {
  const db = new EnterpriseDatabaseEngine();
  db.provisionInitialAdmin({
    callerRole: 'service_role',
    email: 'admin@nukhba.io',
    fullName: 'Tariq Al-Mansoor',
    password: 'StrongPassword!123'
  });

  // Invalid password
  assert.throws(
    () => db.signIn({ email: 'admin@nukhba.io', password: 'WrongPassword', clientIp: '10.0.0.1' }),
    /AUTH_INVALID_CREDENTIALS/
  );

  // Unknown email gives identical error code (anti-enumeration)
  assert.throws(
    () => db.signIn({ email: 'unknown@nukhba.io', password: 'WrongPassword', clientIp: '10.0.0.1' }),
    /AUTH_INVALID_CREDENTIALS/
  );

  // Valid admin sign in
  const session = db.signIn({ email: 'admin@nukhba.io', password: 'StrongPassword!123', clientIp: '10.0.0.2' });
  assert.equal(session.user.role, 'admin');
  assert.equal(session.redirectUrl, '/admin');
});

test('Phase 3.2: Rate limiting blocks repeated brute-force login attempts on the same account/IP', () => {
  const db = new EnterpriseDatabaseEngine();
  db.provisionInitialAdmin({
    callerRole: 'service_role',
    email: 'admin@nukhba.io',
    fullName: 'Tariq Al-Mansoor',
    password: 'StrongPassword!123'
  });

  for (let i = 0; i < 5; i++) {
    assert.throws(
      () => db.signIn({ email: 'admin@nukhba.io', password: 'bad', clientIp: '192.168.1.50' }),
      /AUTH_INVALID_CREDENTIALS/
    );
  }

  // 6th attempt is rate-limited even if password were valid
  assert.throws(
    () => db.signIn({ email: 'admin@nukhba.io', password: 'StrongPassword!123', clientIp: '192.168.1.50' }),
    /RATE_LIMITED/
  );
});

test('Phase 3.3: Open redirect attacks are neutralized and employees are blocked from /admin routes', () => {
  const db = new EnterpriseDatabaseEngine();
  const { adminProfile } = db.provisionInitialAdmin({
    callerRole: 'service_role',
    email: 'admin@nukhba.io',
    fullName: 'Tariq Al-Mansoor',
    password: 'StrongPassword!123'
  });

  assert.equal(db.sanitizeRedirectPath('https://evil.example.com/phish', 'admin'), '/admin');
  assert.equal(db.sanitizeRedirectPath('//evil.example.com', 'admin'), '/admin');
  assert.equal(db.sanitizeRedirectPath('/admin/employees', 'employee'), '/employee');
  assert.equal(db.sanitizeRedirectPath('/employee/tasks', 'employee'), '/employee/tasks');

  // Unauthenticated route access redirects to /login
  const unauthCheck = db.authorizeRoute({ sessionToken: null, pathname: '/admin/tasks' });
  assert.equal(unauthCheck.allowed, false);
  assert.equal(unauthCheck.status, 401);
  assert.match(unauthCheck.redirect, /^\/login\?redirect=/);

  const adminSession = db.signIn({
    email: adminProfile.email,
    password: 'StrongPassword!123',
    clientIp: '10.0.0.5'
  });
  const adminCheck = db.authorizeRoute({ sessionToken: adminSession.sessionToken, pathname: '/admin/tasks' });
  assert.equal(adminCheck.allowed, true);
});
