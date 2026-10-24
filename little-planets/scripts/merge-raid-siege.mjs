import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readdirSync } from 'node:fs';

// Preserve the previous compiled application and its hashed assets before installing the new entry.
if (!existsSync('dist/index.html') || !existsSync('raid-siege/dist/index.html')) {
  throw new Error('Build both the legacy app and RAID & SIEGE first.');
}
cpSync('dist/index.html', 'dist/legacy.html');
function merge(source, target) {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name), to = join(target, entry.name);
    if (entry.isDirectory()) { merge(from, to); continue; }
    if (existsSync(to) && entry.name !== 'index.html') {
      const digest = path => createHash('sha256').update(readFileSync(path)).digest('hex');
      if (digest(from) !== digest(to)) throw new Error(`Refusing to overwrite a legacy asset: ${to}`);
    }
    cpSync(from, to);
  }
}
merge('raid-siege/dist', 'dist');
const html = readFileSync('dist/index.html', 'utf8').replace('<html lang="ru">', '<html lang="ru" data-legacy-entry="./legacy.html">');
if (!html.includes('data-legacy-entry')) throw new Error('Missing legacy entry routing marker');
writeFileSync('dist/index.html', html);
mkdirSync('dist/licenses/raid-siege', { recursive: true });
cpSync('raid-siege/docs/licenses', 'dist/licenses/raid-siege', { recursive: true });
console.log('RAID & SIEGE installed. Legacy Emberfall, RIFT RAID and colony entry retained.');
