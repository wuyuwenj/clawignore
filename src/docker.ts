import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile, access } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const execAsync = promisify(exec);

export interface DockerStatus {
  installed: boolean;
  running: boolean;
  openclawRunning: boolean;
}

export async function checkDocker(): Promise<DockerStatus> {
  const status: DockerStatus = {
    installed: false,
    running: false,
    openclawRunning: false,
  };

  // Check if Docker is installed
  try {
    await execAsync('docker --version');
    status.installed = true;
  } catch {
    return status;
  }

  // Check if Docker daemon is running
  try {
    await execAsync('docker info');
    status.running = true;
  } catch {
    return status;
  }

  // Check if OpenClaw is running in Docker
  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}"');
    const containers = stdout.toLowerCase();
    status.openclawRunning =
      containers.includes('openclaw') ||
      containers.includes('claw') ||
      containers.includes('gateway');
  } catch {
    // Ignore errors
  }

  return status;
}

export async function getOpenClawWorkspace(): Promise<string | null> {
  const home = homedir();

  // Common OpenClaw workspace locations
  const possiblePaths = [
    join(home, 'openclaw', 'workspace'),
    join(home, '.openclaw', 'workspace'),
    join(home, 'openclaw'),
    join(home, '.openclaw'),
  ];

  for (const path of possiblePaths) {
    try {
      await access(path);
      return path;
    } catch {
      // Path doesn't exist, try next
    }
  }

  // Check environment variable
  const envWorkspace = process.env.OPENCLAW_WORKSPACE_DIR;
  if (envWorkspace) {
    try {
      await access(envWorkspace);
      return envWorkspace;
    } catch {
      // Invalid path
    }
  }

  return null;
}

export async function findDockerComposeFile(): Promise<string | null> {
  const home = homedir();

  const possiblePaths = [
    join(home, 'openclaw', 'docker-compose.yml'),
    join(home, 'openclaw', 'docker-compose.yaml'),
    join(home, '.openclaw', 'docker-compose.yml'),
    join(home, '.openclaw', 'docker-compose.yaml'),
    // Check current directory too
    join(process.cwd(), 'docker-compose.yml'),
    join(process.cwd(), 'docker-compose.yaml'),
  ];

  for (const path of possiblePaths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try next
    }
  }

  return null;
}

export async function modifyDockerCompose(
  workspace: string,
  ignoredPatterns: string[]
): Promise<boolean> {
  const composePath = await findDockerComposeFile();

  if (!composePath) {
    return false;
  }

  try {
    const content = await readFile(composePath, 'utf-8');
    const compose = parseYaml(content);

    // Find the gateway service
    const services = compose.services || {};
    const gatewayService =
      services.gateway || services.openclaw || services.claw;

    if (!gatewayService) {
      return false;
    }

    // Get existing volumes
    const volumes: string[] = gatewayService.volumes || [];

    // Find the workspace volume mount
    const workspaceVolumeIndex = volumes.findIndex(
      (v: string) =>
        v.includes('/workspace') ||
        v.includes('OPENCLAW_WORKSPACE')
    );

    if (workspaceVolumeIndex === -1) {
      // No workspace volume found, can't modify
      return false;
    }

    // Add a comment about .clawignore
    // Note: YAML library may not preserve comments, so we'll add a label instead
    if (!gatewayService.labels) {
      gatewayService.labels = {};
    }
    gatewayService.labels['clawignore.enabled'] = 'true';
    gatewayService.labels['clawignore.patterns'] = ignoredPatterns.length.toString();

    // For now, we'll note that the user needs to modify docker-setup.sh
    // The actual mount filtering happens at container startup
    // We'll create a .clawignore.json with the patterns for the entrypoint to read
    const clawignoreJson = join(workspace, '.clawignore.json');
    await writeFile(
      clawignoreJson,
      JSON.stringify({ patterns: ignoredPatterns, version: 1 }, null, 2)
    );

    // Write the modified compose file
    await writeFile(composePath, stringifyYaml(compose));

    return true;
  } catch {
    return false;
  }
}

export async function restartOpenClaw(): Promise<boolean> {
  const composePath = await findDockerComposeFile();

  if (composePath) {
    try {
      // Get the directory containing docker-compose.yml
      const composeDir = composePath.replace(/\/docker-compose\.(yml|yaml)$/, '');
      await execAsync(`cd "${composeDir}" && docker compose restart`);
      return true;
    } catch {
      // Try older docker-compose command
      try {
        const composeDir = composePath.replace(/\/docker-compose\.(yml|yaml)$/, '');
        await execAsync(`cd "${composeDir}" && docker-compose restart`);
        return true;
      } catch {
        return false;
      }
    }
  }

  // Try generic restart
  try {
    await execAsync('docker restart openclaw-gateway');
    return true;
  } catch {
    try {
      await execAsync('docker restart gateway');
      return true;
    } catch {
      return false;
    }
  }
}

export async function getDockerSetupScriptPath(): Promise<string | null> {
  const home = homedir();

  const possiblePaths = [
    join(home, 'openclaw', 'docker-setup.sh'),
    join(home, '.openclaw', 'docker-setup.sh'),
    join(process.cwd(), 'docker-setup.sh'),
  ];

  for (const path of possiblePaths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try next
    }
  }

  return null;
}
