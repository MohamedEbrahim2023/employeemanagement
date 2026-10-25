import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('artifacts/file_generation/ttl=63d/intermediate/employee-management-system');

test('Phase 1.1: Project structure and directories exist', () => {
  const requiredDirs = [
    'src/app',
    'src/app/admin',
    'src/app/employee',
    'src/components/ui',
    'src/lib/supabase',
    'src/lib/validation',
    'src/lib/services',
    'src/lib/security',
    'supabase/migrations',
    'tests'
  ];
  for (const dir of requiredDirs) {
    assert.equal(fs.existsSync(path.join(root, dir)), true, `Directory ${dir} must exist`);
  }
});

test('Phase 1.2: TypeScript strict mode is enabled in tsconfig.json', () => {
  const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));
  assert.equal(tsconfig.compilerOptions.strict, true);
  assert.equal(tsconfig.compilerOptions.noImplicitAny, true);
  assert.equal(tsconfig.compilerOptions.strictNullChecks, true);
  assert.equal(tsconfig.compilerOptions.noUncheckedIndexedAccess, true);
});

test('Phase 1.3: Next.js security headers and required stack dependencies are configured', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['next']);
  assert.ok(pkg.dependencies['@supabase/supabase-js']);
  assert.ok(pkg.dependencies['@supabase/ssr']);
  assert.ok(pkg.dependencies['zod']);
  assert.ok(pkg.dependencies['react-hook-form']);
  assert.ok(pkg.dependencies['@tanstack/react-table']);
  assert.ok(pkg.dependencies['recharts']);
  assert.ok(pkg.dependencies['lucide-react']);

  const nextConfig = fs.readFileSync(path.join(root, 'next.config.mjs'), 'utf8');
  assert.match(nextConfig, /X-Frame-Options/);
  assert.match(nextConfig, /X-Content-Type-Options/);
  assert.match(nextConfig, /Strict-Transport-Security/);
});
