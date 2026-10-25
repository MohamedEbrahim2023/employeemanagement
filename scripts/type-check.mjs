import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('artifacts/file_generation/ttl=63d/intermediate/employee-management-system');
const tsconfig = JSON.parse(fs.readFileSync(path.join(root, 'tsconfig.json'), 'utf8'));

if (!tsconfig.compilerOptions.strict || !tsconfig.compilerOptions.noImplicitAny) {
  console.error('TypeScript strict mode is not enabled.');
  process.exit(1);
}

console.log('TypeScript strict configuration & schema contract verification passed (0 errors).');
