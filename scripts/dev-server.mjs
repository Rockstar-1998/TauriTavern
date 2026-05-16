import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_PORTS = [1420, 1421, 1422, 1423];
const HOST = '127.0.0.1';
const VITE_MARKER = '/@vite/client';
const TAURI_CONFIGS = [
  resolve('src-tauri', 'tauri.conf.json'),
  resolve('src-tauri', 'tauri.new-ui.conf.json'),
];
const REPO_ROOT = resolve('.');
const NPM_CACHE_DIR = resolve('.npm-cache');
const TEMP_DIR = resolve('.tmp');

function ensureDir(path) {
  try {
    mkdirSync(path, { recursive: true });
  } catch (error) {
    console.warn(`[dev-server] Failed to ensure directory ${path}:`, error instanceof Error ? error.message : error);
  }
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    const finish = (value) => {
      server.removeAllListeners();
      if (server.listening) {
        server.close(() => resolve(value));
        return;
      }
      resolve(value);
    };

    server.once('error', () => finish(false));
    server.once('listening', () => finish(true));
    server.listen({ host: '0.0.0.0', port, exclusive: true });
  });
}

async function isViteServer(port) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const response = await fetch(`http://localhost:${port}/`, { signal: controller.signal });
    clearTimeout(timeout);
    const text = await response.text();
    return text.includes(VITE_MARKER);
  } catch {
    return false;
  }
}

function updateDevUrl(port) {
  const nextUrl = `http://localhost:${port}`;
  for (const configPath of TAURI_CONFIGS) {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.build) {
      parsed.build = {};
    }
    if (parsed.build.devUrl !== nextUrl) {
      parsed.build.devUrl = nextUrl;
      writeFileSync(configPath, JSON.stringify(parsed, null, 2) + '\n', 'utf8');
    }
  }
}

async function resolvePort() {
  const candidates = DEFAULT_PORTS;
  for (const port of candidates) {
    const bindable = await canBindPort(port);
    if (!bindable) {
      const viteRunning = await isViteServer(port);
      if (viteRunning) {
        return { port, reuse: true };
      }
      console.warn(`[dev-server] Port ${port} is in use by a non-Vite server; trying next port.`);
      continue;
    }

    return { port, reuse: false };
  }
  return null;
}

async function main() {
  const selection = await resolvePort();
  if (!selection) {
    console.error(`[dev-server] No available dev port (tried ${DEFAULT_PORTS.join(', ')}).`);
    process.exitCode = 1;
    return;
  }

  const { port, reuse } = selection;
  updateDevUrl(port);

  if (reuse) {
    console.log(`[dev-server] Vite is already running on http://localhost:${port}/`);
    return;
  }

  ensureDir(NPM_CACHE_DIR);
  ensureDir(TEMP_DIR);

  const env = {
    ...process.env,
    NPM_CONFIG_CACHE: NPM_CACHE_DIR,
    npm_config_cache: NPM_CACHE_DIR,
    TEMP: TEMP_DIR,
    TMP: TEMP_DIR,
    TMPDIR: TEMP_DIR,
  };

  const child = process.platform === 'win32'
    ? spawn(
        process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe',
        [
          '/d',
          '/s',
          '/c',
          `npm --prefix frontend run dev -- --host 0.0.0.0 --port ${port}`,
        ],
        { stdio: 'inherit', shell: false, env, cwd: REPO_ROOT },
      )
    : spawn(
        'npm',
        ['--prefix', 'frontend', 'run', 'dev', '--', '--host', '0.0.0.0', '--port', String(port)],
        { stdio: 'inherit', shell: false, env, cwd: REPO_ROOT },
      );

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
