import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'src');
const allowedTauriApiFiles = new Set([
  path.resolve(root, 'lib/native/bridge.ts'),
  path.resolve(root, 'lib/native/bridge.test.ts'),
]);

const ignoredSuffixes = ['.test.ts', '.test.tsx'];
const violations = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }

    if (!/\.(ts|tsx|js|jsx|mjs)$/i.test(entry.name)) {
      continue;
    }

    await checkFile(fullPath);
  }
}

async function checkFile(filePath) {
  const source = await readFile(filePath, 'utf8');
  const isTestFile = ignoredSuffixes.some((suffix) => filePath.endsWith(suffix));

  if (/['"`]\/api\//.test(source)) {
    violations.push(`${filePath}: contains forbidden backend /api path`);
  }

  if (/\bfetch\s*\(/.test(source)) {
    violations.push(`${filePath}: contains forbidden fetch transport`);
  }

  if (source.includes('saveBlob(')) {
    violations.push(`${filePath}: contains forbidden Blob export flow`);
  }

  if (source.includes('src/tauri/main/')) {
    violations.push(`${filePath}: imports forbidden legacy tauri main modules`);
  }

  if (!isTestFile && source.includes('@tauri-apps/api') && !allowedTauriApiFiles.has(filePath)) {
    violations.push(`${filePath}: imports @tauri-apps/api outside bridge transport`);
  }
}

await walk(root);

if (violations.length > 0) {
  console.error('Render-only boundary violations detected:');
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log('Render-only boundary check passed.');
