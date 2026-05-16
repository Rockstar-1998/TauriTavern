#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const androidProjectDir = path.join(repoRoot, 'src-tauri', 'gen', 'android');
const gradleWrapper = path.join(androidProjectDir, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
const localAdb = path.join(repoRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const frontendDistDir = path.join(repoRoot, 'frontend', 'dist');
const androidAssetsPublicDir = path.join(androidProjectDir, 'app', 'src', 'main', 'assets', 'public');
const apkPath = path.join(androidProjectDir, 'app', 'build', 'outputs', 'apk', 'arm64', 'debug', 'app-arm64-debug.apk');
const localPropertiesPath = path.join(androidProjectDir, 'local.properties');
const androidStudioBatchPath = path.join(repoRoot, 'start-android-studio.bat');
const repoGradleUserHome = path.join(repoRoot, '.tmp', 'gradle-android-script');
const repoTempDir = path.join(repoRoot, '.tmp', 'android-build-temp');

function formatCommand(command, args) {
  return [command, ...args].map((value) => (/\s/u.test(value) ? `"${value}"` : value)).join(' ');
}

function run(command, args, options = {}) {
  const { cwd = repoRoot, env = process.env, allowFailure = false } = options;
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/iu.test(command);
  console.log(`\n> ${formatCommand(command, args)}`);
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    shell: useShell,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.error) {
    throw result.error;
  }
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(command)} exited with code ${result.status ?? 1}`);
  }
  return result;
}

function parseArgs(argv) {
  const options = {
    serial: process.env.ANDROID_SERIAL?.trim() || '',
    skipFrontendBuild: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--serial') {
      const nextValue = argv[index + 1];
      if (!nextValue) {
        throw new Error('Missing value for --serial');
      }
      options.serial = nextValue.trim();
      index += 1;
      continue;
    }

    if (value === '--skip-frontend-build') {
      options.skipFrontendBuild = true;
      continue;
    }

    if (value === '--help' || value === '-h') {
      console.log([
        'Usage: node scripts/android-build-install.mjs [options]',
        '',
        'Options:',
        '  --serial <device-id>       Install to a specific adb device',
        '  --skip-frontend-build      Reuse the current frontend/dist output',
      ].join('\n'));
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  return options;
}

function decodeJavaPropertyValue(value) {
  return value
    .replace(/\\ /gu, ' ')
    .replace(/\\:/gu, ':')
    .replace(/\\=/gu, '=')
    .replace(/\\\\/gu, '\\');
}

function readProperties(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Required properties file was not found: ${filePath}`);
  }

  const raw = readFileSync(filePath, 'utf8');
  const properties = {};
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) {
      continue;
    }

    const separatorIndex = trimmed.search(/[:=]/u);
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    properties[key] = decodeJavaPropertyValue(value);
  }

  return properties;
}

function readBatchVariable(filePath, variableName) {
  if (!existsSync(filePath)) {
    return '';
  }

  const raw = readFileSync(filePath, 'utf8');
  const pattern = new RegExp(`^\\s*set\\s+"${variableName}=([^"]+)"\\s*$`, 'imu');
  const match = raw.match(pattern);
  return match?.[1]?.trim() || '';
}

function resolveCommandOnPath(command) {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = run(lookup, [command], { allowFailure: true });
  if (result.status !== 0 || !result.stdout) {
    return '';
  }

  return String(result.stdout)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean) || '';
}

function resolveJavaHome() {
  const javaExecutableName = process.platform === 'win32' ? 'java.exe' : 'java';
  const candidates = [
    process.env.JAVA_HOME?.trim() || '',
    readBatchVariable(androidStudioBatchPath, 'JAVA_HOME'),
  ];

  const javaOnPath = resolveCommandOnPath(javaExecutableName) || resolveCommandOnPath('java');
  if (javaOnPath) {
    candidates.push(path.dirname(path.dirname(javaOnPath)));
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const javaBinary = path.join(candidate, 'bin', javaExecutableName);
    if (existsSync(javaBinary)) {
      return candidate;
    }
  }

  throw new Error('Unable to resolve JAVA_HOME. Set JAVA_HOME or update start-android-studio.bat with a valid JDK path.');
}

function resolveBuildEnvironment() {
  const properties = readProperties(localPropertiesPath);
  const javaHome = resolveJavaHome();
  const sdkDir = properties['sdk.dir'];
  const ndkDir = properties['ndk.dir'];

  if (!sdkDir || !existsSync(sdkDir)) {
    throw new Error(`Android SDK path from local.properties is missing or invalid: ${sdkDir || '(empty)'}`);
  }

  const env = {
    ...process.env,
    JAVA_HOME: javaHome,
    ANDROID_HOME: sdkDir,
    ANDROID_SDK_ROOT: sdkDir,
    GRADLE_USER_HOME: process.env.GRADLE_USER_HOME?.trim() || repoGradleUserHome,
    TEMP: repoTempDir,
    TMP: repoTempDir,
    TMPDIR: repoTempDir,
  };

  mkdirSync(env.GRADLE_USER_HOME, { recursive: true });
  mkdirSync(repoTempDir, { recursive: true });

  if (ndkDir && existsSync(ndkDir)) {
    env.ANDROID_NDK_HOME = ndkDir;
    env.NDK_HOME = ndkDir;
  }

  return env;
}

function syncFrontendAssets(options) {
  if (!options.skipFrontendBuild) {
    const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    run(npmCommand, ['run', 'frontend:build']);
  }

  if (!existsSync(frontendDistDir)) {
    throw new Error(`Frontend build output was not found: ${frontendDistDir}`);
  }

  rmSync(androidAssetsPublicDir, { recursive: true, force: true });
  mkdirSync(path.dirname(androidAssetsPublicDir), { recursive: true });
  cpSync(frontendDistDir, androidAssetsPublicDir, { recursive: true, force: true });
  console.log(`Synced frontend assets to ${androidAssetsPublicDir}`);
}

function parseAdbDevices(output) {
  return String(output)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('List of devices attached'))
    .map((line) => {
      const [serial, state] = line.split(/\s+/u);
      return { serial, state };
    })
    .filter((device) => device.serial && device.state);
}

function resolveTargetDevice(options) {
  run(localAdb, ['start-server']);
  const devicesResult = run(localAdb, ['devices'], { allowFailure: false });
  const devices = parseAdbDevices(devicesResult.stdout);

  const authorizedDevices = devices.filter((device) => device.state === 'device');
  const unauthorizedDevices = devices.filter((device) => device.state === 'unauthorized');
  const offlineDevices = devices.filter((device) => device.state === 'offline');

  if (options.serial) {
    const requestedDevice = devices.find((device) => device.serial === options.serial);
    if (!requestedDevice) {
      throw new Error(`The requested adb device was not found: ${options.serial}`);
    }
    if (requestedDevice.state !== 'device') {
      throw new Error(`The requested adb device is not ready: ${options.serial} (${requestedDevice.state})`);
    }
    return requestedDevice.serial;
  }

  if (authorizedDevices.length > 0) {
    return authorizedDevices[0].serial;
  }

  if (unauthorizedDevices.length > 0) {
    throw new Error(`ADB device is unauthorized: ${unauthorizedDevices.map((device) => device.serial).join(', ')}. Allow USB debugging on the phone and retry.`);
  }

  if (offlineDevices.length > 0) {
    throw new Error(`ADB device is offline: ${offlineDevices.map((device) => device.serial).join(', ')}. Reconnect the cable and retry.`);
  }

  throw new Error('No adb device in the device state was found. Connect the phone with USB debugging enabled and retry.');
}

function buildArm64Debug(env) {
  if (!existsSync(gradleWrapper)) {
    throw new Error(`Gradle wrapper was not found: ${gradleWrapper}`);
  }

  rmSync(path.join(androidProjectDir, 'app', 'build'), { recursive: true, force: true });

  run(gradleWrapper, ['clean', ':app:assembleArm64Debug', '--rerun-tasks', '--no-daemon', '--stacktrace'], {
    cwd: androidProjectDir,
    env,
  });

  if (!existsSync(apkPath)) {
    throw new Error(`Built APK was not found: ${apkPath}`);
  }
}

function installApk(serial) {
  const result = run(localAdb, ['-s', serial, 'install', '-r', '-g', apkPath], { allowFailure: true });
  const combinedOutput = `${result.stdout || ''}\n${result.stderr || ''}`;

  if (result.status === 0) {
    console.log(`Installed ${apkPath} to device ${serial}`);
    return;
  }

  if (/INSTALL_FAILED_USER_RESTRICTED|user rejected|install canceled by user/iu.test(combinedOutput)) {
    throw new Error('ADB install reached the phone, but the ROM blocked unattended installation. Enable the OEM developer option for USB installation or approve the install prompt on the device.');
  }

  throw new Error(`ADB install failed for device ${serial}`);
}

function main() {
  if (!existsSync(localAdb)) {
    throw new Error(`Repo-local adb was not found: ${localAdb}`);
  }

  const options = parseArgs(process.argv.slice(2));
  const env = resolveBuildEnvironment();
  console.log(`Using JAVA_HOME=${env.JAVA_HOME}`);
  console.log(`Using repo-local adb=${localAdb}`);
  syncFrontendAssets(options);
  const serial = resolveTargetDevice(options);
  console.log(`Using adb device ${serial}`);
  buildArm64Debug(env);
  installApk(serial);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
