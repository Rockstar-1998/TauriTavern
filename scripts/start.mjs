import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

export const FRONTENDS = ['new', 'legacy'];
export const MODES = ['dev', 'build'];
export const PLATFORMS = ['desktop', 'android'];

function isChoice(value, choices) {
  return choices.includes(value);
}

function parseValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

export function parseArgs(argv) {
  const options = {
    mode: undefined,
    frontend: undefined,
    platform: undefined,
    help: false,
    extraArgs: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (current === '--') {
      options.extraArgs = argv.slice(index + 1);
      break;
    }

    if (current === '--help' || current === '-h') {
      options.help = true;
      continue;
    }

    if (current === '--mode') {
      const value = parseValue(argv, index, '--mode');
      if (!isChoice(value, MODES)) {
        throw new Error(`Unsupported mode: ${value}`);
      }
      options.mode = value;
      index += 1;
      continue;
    }

    if (current === '--frontend') {
      const value = parseValue(argv, index, '--frontend');
      if (!isChoice(value, FRONTENDS)) {
        throw new Error(`Unsupported frontend: ${value}`);
      }
      options.frontend = value;
      index += 1;
      continue;
    }

    if (current === '--platform') {
      const value = parseValue(argv, index, '--platform');
      if (!isChoice(value, PLATFORMS)) {
        throw new Error(`Unsupported platform: ${value}`);
      }
      options.platform = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return options;
}

function promptText(label, choices, defaultValue) {
  const choiceText = choices.map((choice, idx) => `${idx + 1}) ${choice}`).join('  ');
  return `${label} ${choiceText} [default: ${defaultValue}]: `;
}

async function promptForChoice(rl, label, choices, defaultValue) {
  const answer = (await rl.question(promptText(label, choices, defaultValue))).trim().toLowerCase();
  if (!answer) {
    return defaultValue;
  }

  const numeric = Number(answer);
  if (Number.isInteger(numeric) && numeric >= 1 && numeric <= choices.length) {
    return choices[numeric - 1];
  }

  if (isChoice(answer, choices)) {
    return answer;
  }

  throw new Error(`Unsupported ${label.toLowerCase()} selection: ${answer}`);
}

export async function promptForOptions() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('TauriTavern launcher');
    console.log('Default frontend: new');
    console.log('Legacy frontend is deprecated and will be removed soon.');

    const mode = await promptForChoice(rl, 'Mode', MODES, 'dev');
    const frontend = await promptForChoice(rl, 'Frontend', FRONTENDS, 'new');
    const platform = await promptForChoice(rl, 'Platform', PLATFORMS, 'desktop');
    return { mode, frontend, platform };
  } finally {
    rl.close();
  }
}

export function resolveLocalTauriBinary(cwd = repoRoot) {
  const binaryName = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
  const candidate = join(cwd, 'node_modules', '.bin', binaryName);
  return existsSync(candidate) ? candidate : null;
}

export function resolveLocalCargoTauriBinary(cwd = repoRoot) {
  const binaryName = process.platform === 'win32' ? 'cargo-tauri.exe' : 'cargo-tauri';
  const candidate = join(cwd, '.tools', 'cargo', 'bin', binaryName);
  return existsSync(candidate) ? candidate : null;
}

export function resolveCommandOnPath(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [command], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });

  if (result.status !== 0) {
    return null;
  }

  const firstLine = String(result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine ?? null;
}

function hasCargoTauriSubcommand(cargoBinary) {
  const result = spawnSync(cargoBinary, ['tauri', '-V'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0;
}

export function resolveTauriInvocation(cwd = repoRoot) {
  const localTauri = resolveLocalTauriBinary(cwd);
  const localCargoTauri = resolveLocalCargoTauriBinary(cwd);
  const globalTauri = resolveCommandOnPath('tauri');
  const globalCargoTauri = resolveCommandOnPath(process.platform === 'win32' ? 'cargo-tauri.exe' : 'cargo-tauri');
  const cargoBinary = resolveCommandOnPath(process.platform === 'win32' ? 'cargo.exe' : 'cargo');
  const nodeMajor = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);

  if (process.platform === 'win32' && nodeMajor >= 24) {
    if (localCargoTauri) {
      return { command: localCargoTauri, argsPrefix: [] };
    }
    if (globalCargoTauri) {
      return { command: globalCargoTauri, argsPrefix: [] };
    }
    if (cargoBinary && hasCargoTauriSubcommand(cargoBinary)) {
      return { command: cargoBinary, argsPrefix: ['tauri'] };
    }
  }

  if (localTauri) {
    return { command: localTauri, argsPrefix: [] };
  }
  if (globalTauri) {
    return { command: globalTauri, argsPrefix: [] };
  }
  if (localCargoTauri) {
    return { command: localCargoTauri, argsPrefix: [] };
  }
  if (globalCargoTauri) {
    return { command: globalCargoTauri, argsPrefix: [] };
  }
  if (cargoBinary && hasCargoTauriSubcommand(cargoBinary)) {
    return { command: cargoBinary, argsPrefix: ['tauri'] };
  }

  throw new Error('Tauri CLI not found. Install root dependencies with `npm install --no-package-lock`, or install repo-local `cargo-tauri` under `.tools/cargo/bin`.');
}

export function buildTauriArgs(options) {
  const mode = options.mode ?? 'dev';
  const frontend = options.frontend ?? 'new';
  const platform = options.platform ?? 'desktop';
  const extraArgs = options.extraArgs ?? [];

  const args = [];
  if (platform === 'android') {
    args.push('android');
  }

  args.push(mode);

  if (frontend === 'legacy') {
    args.push('--config', 'src-tauri/tauri.legacy-ui.conf.json');
  }

  return [...args, ...extraArgs];
}

export function formatHelp() {
  return [
    'Usage: node scripts/start.mjs [--mode dev|build] [--frontend new|legacy] [--platform desktop|android] [-- <tauri args>]',
    '',
    'Examples:',
    '  node scripts/start.mjs --mode dev --frontend new --platform desktop',
    '  node scripts/start.mjs --mode build --frontend legacy --platform android -- --target aarch64-linux-android',
    '',
    'Notes:',
    '  - Default when no args are provided in a TTY: dev + new + desktop (interactive picker)',
    '  - Default when no args are provided in a non-TTY: dev + new + desktop',
    '  - The legacy frontend is deprecated and will be removed soon.',
    '  - `start.cmd` can help install missing local dependencies on Windows.',
    '  - On Windows with Node 24+, the launcher prefers repo-local `cargo-tauri` when available.',
    '  - The deprecated alias configs src-tauri/tauri.new-ui.conf.json remain available during the transition.',
  ].join('\n');
}

export async function runLauncher(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  if (parsed.help) {
    console.log(formatHelp());
    return 0;
  }

  let options = parsed;
  if (argv.length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
    options = { ...parsed, ...(await promptForOptions()) };
  }

  const invocation = resolveTauriInvocation(repoRoot);
  const tauriArgs = [...invocation.argsPrefix, ...buildTauriArgs(options)];

  return await new Promise((resolvePromise, rejectPromise) => {
    const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(invocation.command);
    const child = spawn(invocation.command, tauriArgs, {
      cwd: repoRoot,
      stdio: 'inherit',
      shell: useShell,
    });

    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (signal) {
        rejectPromise(new Error(`Tauri process terminated by signal ${signal}`));
        return;
      }
      resolvePromise(code ?? 0);
    });
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  runLauncher().then(
    (code) => {
      process.exitCode = code;
    },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}