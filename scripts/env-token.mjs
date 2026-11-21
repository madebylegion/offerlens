// Copies the registered App Check debug token (a file outside the repo) into the git-ignored .env.local.
// Prints only the length. Usage: node scripts/env-token.mjs ../appcheck-debug-token
import { readFileSync, writeFileSync } from 'node:fs';
const token = readFileSync(process.argv[2] ?? '../appcheck-debug-token', 'utf8').trim();
writeFileSync('.env.local', `VITE_APPCHECK_DEBUG_TOKEN=${token}\n`, { mode: 0o600 });
console.log('.env.local written,', token.length, 'chars');
