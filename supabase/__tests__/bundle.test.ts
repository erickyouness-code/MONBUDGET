import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

it('le fichier SQL « tout-en-un » est à jour (sinon : npm run sql:bundle)', () => {
  const file = path.join(ROOT, 'supabase/setup/tout-en-un.sql');
  const before = readFileSync(file, 'utf8');
  execFileSync('bash', [path.join(ROOT, 'scripts/bundle-sql.sh')], { stdio: 'ignore' });
  expect(readFileSync(file, 'utf8')).toBe(before);
});
