import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const testDirectory = new URL('tests/', root);
const tests = readdirSync(testDirectory)
  .filter(name => name.endsWith('.test.ts'))
  .sort()
  .map(name => fileURLToPath(new URL(name, testDirectory)));

if (tests.length === 0) {
  console.error('Aucun test TypeScript trouvé.');
  process.exit(1);
}

const tsxCli = fileURLToPath(new URL('node_modules/tsx/dist/cli.mjs', root));
const result = spawnSync(process.execPath, [tsxCli, '--test', ...tests], { stdio: 'inherit' });

process.exit(result.status ?? 1);
