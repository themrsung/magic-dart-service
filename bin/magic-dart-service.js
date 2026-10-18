#!/usr/bin/env node
/**
 * `npx magic-dart-service`: runs the built server (build/index.js) with settings from the environment.
 * A `.env` file in the current directory is loaded first if present. See README "Install from npm".
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  console.log(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version);
  process.exit(0);
}
if (args.includes('--help') || args.includes('-h')) {
  console.log(`Usage: magic-dart-service [--env-file <path>]

Starts the MagicDART server (web app + MCP endpoint). Settings come from environment variables;
./.env is loaded automatically if it exists, or pass --env-file.

Required:
  ORIGIN       public URL, e.g. https://dart.example.com
  APP_SECRET   at least 32 random characters (openssl rand -base64 48)
Common:
  PORT (3000), HOST (0.0.0.0), DATA_DIR (./data), REGISTRATION (invite)
See https://github.com/themrsung/magic-dart-service#configuration for the full list.`);
  process.exit(0);
}

const envFlag = args.indexOf('--env-file');
const envFile = envFlag >= 0 ? args[envFlag + 1] : '.env';
if (envFlag >= 0 && (!envFile || !existsSync(envFile))) {
  console.error(`magic-dart-service: env file not found: ${envFile ?? '(missing path)'}`);
  process.exit(1);
}
if (existsSync(envFile)) process.loadEnvFile(envFile);

process.env.DATA_DIR ??= 'data';
const missing = ['ORIGIN', 'APP_SECRET'].filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`magic-dart-service: set ${missing.join(' and ')} (in the environment or ./.env). Run with --help for details.`);
  process.exit(1);
}

await import(join(root, 'build', 'index.js'));
