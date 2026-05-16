import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTauriArgs, formatHelp, parseArgs } from './start.mjs';

test('parseArgs reads explicit flags and passthrough args', () => {
  const result = parseArgs(['--mode', 'build', '--frontend', 'legacy', '--platform', 'android', '--', '--target', 'x86_64']);
  assert.equal(result.mode, 'build');
  assert.equal(result.frontend, 'legacy');
  assert.equal(result.platform, 'android');
  assert.deepEqual(result.extraArgs, ['--target', 'x86_64']);
});

test('buildTauriArgs maps desktop new frontend to plain tauri dev', () => {
  const result = buildTauriArgs({ mode: 'dev', frontend: 'new', platform: 'desktop', extraArgs: [] });
  assert.deepEqual(result, ['dev']);
});

test('buildTauriArgs maps legacy android build to config overlay', () => {
  const result = buildTauriArgs({ mode: 'build', frontend: 'legacy', platform: 'android', extraArgs: ['--target', 'aarch64-linux-android'] });
  assert.deepEqual(result, ['android', 'build', '--config', 'src-tauri/tauri.legacy-ui.conf.json', '--target', 'aarch64-linux-android']);
});

test('formatHelp mentions deprecated legacy frontend', () => {
  assert.match(formatHelp(), /legacy frontend is deprecated/i);
});