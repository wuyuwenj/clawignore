import { writeFile, readFile, stat } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';

const DOCKER_IMAGE = 'alpine/openclaw:latest';

interface DockerComposeConfig {
  openclawRoot: string;
  allPaths: string[];        // All paths user can see
  ignoredPaths: string[];    // Paths to NOT mount
  gatewayToken?: string;
}

export async function generateDockerCompose(config: DockerComposeConfig): Promise<{
  composePath: string;
  envPath: string;
  clawignorePath: string;
  dockerConfigPath: string;
}> {
  const { openclawRoot, allPaths, ignoredPaths } = config;
  const home = homedir();

  // Generate a gateway token if not provided
  const gatewayToken = config.gatewayToken || generateToken();

  // Calculate paths to mount (all paths minus ignored)
  const pathsToMount = allPaths.filter(p => !isIgnored(p, ignoredPaths));

  // Generate volume mounts
  const volumeMounts = await generateVolumeMounts(openclawRoot, pathsToMount);

  // Generate docker-compose.yml content
  const composeContent = generateComposeYaml(volumeMounts);

  // Generate .env content
  const envContent = generateEnvFile(openclawRoot, gatewayToken);

  // Generate .clawignore content
  const clawignoreContent = generateClawignore(ignoredPaths);

  // Generate Docker-specific config (replaces host paths with container paths)
  const dockerConfigContent = await generateDockerConfig(home);

  // Write files
  const composePath = join(openclawRoot, 'docker-compose.yml');
  const envPath = join(openclawRoot, '.env');
  const clawignorePath = join(openclawRoot, '.clawignore');
  const dockerConfigPath = join(openclawRoot, 'openclaw.docker.json');

  await writeFile(composePath, composeContent);
  await writeFile(envPath, envContent);
  await writeFile(clawignorePath, clawignoreContent);
  await writeFile(dockerConfigPath, dockerConfigContent);

  return { composePath, envPath, clawignorePath, dockerConfigPath };
}

async function generateDockerConfig(home: string): Promise<string> {
  const configPath = join(home, '.openclaw', 'openclaw.json');

  try {
    const content = await readFile(configPath, 'utf-8');
    // Replace all host paths with container paths
    const dockerContent = content.replace(
      new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      '/home/node'
    );
    return dockerContent;
  } catch {
    // If config doesn't exist, return minimal config
    return JSON.stringify({
      agents: {
        defaults: {
          workspace: '/home/node/.openclaw/workspace'
        }
      }
    }, null, 2);
  }
}

function generateToken(): string {
  const chars = 'abcdef0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

function isIgnored(path: string, ignoredPaths: string[]): boolean {
  for (const ignored of ignoredPaths) {
    if (path === ignored || path.startsWith(ignored + '/')) {
      return true;
    }
  }
  return false;
}

async function generateVolumeMounts(openclawRoot: string, pathsToMount: string[]): Promise<string[]> {
  const mounts: string[] = [];
  const home = homedir();

  // Mount Docker-specific config (with container paths instead of host paths)
  mounts.push(`${home}/.openclaw/openclaw.docker.json:/home/node/.openclaw/openclaw.json:ro`);
  mounts.push(`${home}/.openclaw/credentials:/home/node/.openclaw/credentials:ro`);

  // Mount OpenClaw runtime directories (read-write)
  const runtimeDirs = ['memory', 'logs', 'canvas', 'media', 'cron', 'agents', 'subagents', 'telegram', 'delivery-queue', 'devices', 'identity'];
  for (const dir of runtimeDirs) {
    mounts.push(`${home}/.openclaw/${dir}:/home/node/.openclaw/${dir}`);
  }

  // Mount .clawignore
  mounts.push(`${home}/.openclaw/.clawignore:/home/node/.openclaw/.clawignore:ro`);

  // Mount the entire workspace directory (so OpenClaw can create subdirectories)
  mounts.push(`${home}/.openclaw/workspace:/home/node/.openclaw/workspace`);

  // Mount each allowed path into the workspace as subdirectories
  // Only mount directories - VirtioFS on macOS cannot overlay files on directory mounts
  for (const sourcePath of pathsToMount) {
    const mountName = basename(sourcePath);

    // Skip .openclaw directory - it's already mounted separately and would conflict
    if (mountName === '.openclaw' || sourcePath.endsWith('/.openclaw')) {
      continue;
    }

    // Check if this is a directory (skip files to avoid VirtioFS mount conflicts)
    try {
      const stats = await stat(sourcePath);
      if (!stats.isDirectory()) {
        continue; // Skip files - only mount directories
      }
    } catch {
      continue; // Skip if we can't stat the path
    }

    const containerPath = `/home/node/.openclaw/workspace/${mountName}`;
    mounts.push(`${sourcePath}:${containerPath}`);
  }

  return mounts;
}

function generateComposeYaml(volumeMounts: string[]): string {
  const volumesYaml = volumeMounts.map(m => `      - "${m}"`).join('\n');

  return `# Generated by clawignore
# https://github.com/wuyuwenj/clawignore
#
# Only folders NOT in .clawignore are mounted.
# To update, run: npx clawignore

services:
  openclaw-gateway:
    image: ${DOCKER_IMAGE}
    container_name: openclaw-gateway
    environment:
      HOME: /home/node
      TERM: xterm-256color
      OPENCLAW_GATEWAY_TOKEN: \${OPENCLAW_GATEWAY_TOKEN}
      OPENCLAW_WORKSPACE_DIR: /home/node/.openclaw/workspace
    volumes:
${volumesYaml}
    ports:
      - "\${OPENCLAW_GATEWAY_PORT:-18789}:18789"
      - "\${OPENCLAW_BRIDGE_PORT:-18790}:18790"
    init: true
    restart: unless-stopped
    command:
      [
        "node",
        "dist/index.js",
        "gateway",
        "--bind",
        "\${OPENCLAW_GATEWAY_BIND:-lan}",
        "--port",
        "18789",
      ]

  openclaw-cli:
    image: ${DOCKER_IMAGE}
    container_name: openclaw-cli
    environment:
      HOME: /home/node
      TERM: xterm-256color
      OPENCLAW_GATEWAY_TOKEN: \${OPENCLAW_GATEWAY_TOKEN}
      OPENCLAW_WORKSPACE_DIR: /home/node/.openclaw/workspace
      BROWSER: echo
    volumes:
${volumesYaml}
    stdin_open: true
    tty: true
    init: true
    profiles:
      - cli
    entrypoint: ["node", "dist/index.js"]
`;
}

function generateEnvFile(openclawRoot: string, gatewayToken: string): string {
  const home = homedir();
  return `# Generated by clawignore
# OpenClaw Docker configuration

OPENCLAW_CONFIG_DIR=${home}/.openclaw
OPENCLAW_WORKSPACE_DIR=${home}/.openclaw/workspace
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_BRIDGE_PORT=18790
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_TOKEN=${gatewayToken}
`;
}

function generateClawignore(ignoredPaths: string[]): string {
  const lines = [
    '# Clawignore - Files hidden from OpenClaw',
    '# Generated by clawignore',
    '# These paths are NOT mounted into the Docker container',
    '',
  ];

  for (const path of ignoredPaths) {
    lines.push(path);
  }

  return lines.join('\n') + '\n';
}

export async function regenerateDockerCompose(openclawRoot: string): Promise<boolean> {
  // Read existing .clawignore
  const clawignorePath = join(openclawRoot, '.clawignore');
  let ignoredPaths: string[] = [];

  try {
    const content = await readFile(clawignorePath, 'utf-8');
    ignoredPaths = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  } catch {
    // No .clawignore file
  }

  // Read existing token from .env if present
  let existingToken: string | undefined;
  try {
    const envContent = await readFile(join(openclawRoot, '.env'), 'utf-8');
    const match = envContent.match(/OPENCLAW_GATEWAY_TOKEN=(.+)/);
    if (match) {
      existingToken = match[1];
    }
  } catch {
    // No existing .env
  }

  // For regeneration, we need to know what paths were available
  // This is tricky - for now just return false to indicate manual update needed
  return false;
}
