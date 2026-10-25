import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(
  'artifacts/file_generation/ttl=63d/intermediate/employee-management-system'
);

const explicitFiles = [
  'src/types/database.ts',
  'src/lib/validation/schemas.ts',
  'src/lib/supabase/client.ts',
  'src/lib/supabase/server.ts',
  'src/lib/supabase/realtime.ts',
  'src/lib/i18n/dictionary.ts',
  'src/lib/services/database-engine.mjs',
  'src/lib/services/actions.ts',
  'src/components/ui/StatusBadge.tsx',
  'src/components/NukhbaWorkspaceApp.tsx',
  'src/middleware.ts',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/login/page.tsx',
  'src/app/admin/page.tsx',
  'src/app/employee/page.tsx',
  'supabase/migrations/0001_initial_schema.sql',
  'supabase/migrations/0002_rls_policies.sql',
  'supabase/migrations/0003_functions_and_triggers.sql',
  'supabase/migrations/0004_seed_and_admin_provisioning.sql',
];

let issues = 0;
for (const rel of explicitFiles) {
  const file = path.join(root, rel);
  const content = fs.readFileSync(file, 'utf8');

  if (content.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY')) {
    console.error(
      `[SECURITY ERROR] ${rel}: Forbidden NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY detected.`
    );
    issues += 1;
  }
  if (
    content.includes("'use client'") &&
    content.includes('SUPABASE_SERVICE_ROLE_KEY')
  ) {
    console.error(
      `[SECURITY ERROR] ${rel}: Client component references SUPABASE_SERVICE_ROLE_KEY.`
    );
    issues += 1;
  }
  if (/\.(ts|tsx)$/.test(rel) && /:\s*any\b|<any>/.test(content)) {
    console.error(
      `[LINT ERROR] ${rel}: Explicit 'any' type is forbidden under strict coding standards.`
    );
    issues += 1;
  }
  if (/\b(TODO|FIXME):/i.test(content)) {
    console.error(
      `[LINT ERROR] ${rel}: Unresolved TODO/FIXME placeholder found.`
    );
    issues += 1;
  }
}

if (issues > 0) {
  console.error(`Lint check failed with ${issues} issue(s).`);
  process.exit(1);
}
console.log(
  `Lint & Security Static Analysis passed across ${explicitFiles.length} source files (0 errors, 0 warnings).`
);
