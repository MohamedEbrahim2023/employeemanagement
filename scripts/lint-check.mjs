import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('artifacts/file_generation/ttl=63d/intermediate/employee-management-system');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx|mjs|sql)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = [
  ...walk(path.join(root, 'src')),
  ...walk(path.join(root, 'supabase')),
  ...walk(path.join(root, 'scripts'))
];

let issues = 0;
for (const file of allFiles) {
  const rel = path.relative(root, file);
  if (rel === 'scripts/lint-check.mjs') continue;
  const content = fs.readFileSync(file, 'utf8');

  // Rule 1: Never expose SUPABASE_SERVICE_ROLE_KEY in client components or NEXT_PUBLIC_
  if (content.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY')) {
    console.error(`[SECURITY ERROR] ${rel}: Forbidden NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY detected.`);
    issues += 1;
  }
  if (content.includes("'use client'") && content.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    console.error(`[SECURITY ERROR] ${rel}: Client component references SUPABASE_SERVICE_ROLE_KEY.`);
    issues += 1;
  }
  // Rule 2: No `any` type in TypeScript source files
  if (/\.(ts|tsx)$/.test(file) && /:\s*any\b|<any>/.test(content)) {
    console.error(`[LINT ERROR] ${rel}: Explicit 'any' type is forbidden under strict coding standards.`);
    issues += 1;
  }
  // Rule 3: No TODO/FIXME placeholders in application code
  if (!rel.startsWith('scripts/lint-check') && /\b(TODO|FIXME):/i.test(content)) {
    console.error(`[LINT ERROR] ${rel}: Unresolved TODO/FIXME placeholder found.`);
    issues += 1;
  }
}

if (issues > 0) {
  console.error(`Lint check failed with ${issues} issue(s).`);
  process.exit(1);
}
console.log(`Lint & Security Static Analysis passed across ${allFiles.length} source files (0 errors, 0 warnings).`);
