import { writeFile, readFile, access } from 'fs/promises';
import { join } from 'path';

const HEADER = `# Clawignore - Files hidden from OpenClaw AI agent
# Uses .gitignore syntax
# https://github.com/yourrepo/clawignore-setup
#
# Files listed here will not be mounted into the Docker container,
# making them completely inaccessible to the AI agent.

`;

const CATEGORY_COMMENTS: Record<string, string> = {
  secrets: '# Secrets & environment variables',
  credentials: '# Credentials & auth tokens',
  keys: '# Private keys & certificates',
  config: '# Configuration files',
  data: '# Data files',
  custom: '# Custom patterns',
};

export async function writeClawignore(
  workspace: string,
  patterns: string[]
): Promise<string> {
  const clawignorePath = join(workspace, '.clawignore');

  // Check if file already exists
  let existingPatterns: string[] = [];
  try {
    await access(clawignorePath);
    const existing = await readFile(clawignorePath, 'utf-8');
    existingPatterns = parseExistingPatterns(existing);
  } catch {
    // File doesn't exist, that's fine
  }

  // Merge patterns, avoiding duplicates
  const allPatterns = [...new Set([...existingPatterns, ...patterns])];

  // Group patterns by type for nicer formatting
  const grouped = groupPatterns(allPatterns);

  // Build the file content
  let content = HEADER;

  for (const [category, categoryPatterns] of Object.entries(grouped)) {
    if (categoryPatterns.length === 0) continue;

    const comment = CATEGORY_COMMENTS[category] || `# ${category}`;
    content += `${comment}\n`;

    for (const pattern of categoryPatterns) {
      content += `${pattern}\n`;
    }

    content += '\n';
  }

  await writeFile(clawignorePath, content.trimEnd() + '\n');

  return clawignorePath;
}

function parseExistingPatterns(content: string): string[] {
  const lines = content.split('\n');
  const patterns: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;
    patterns.push(trimmed);
  }

  return patterns;
}

function groupPatterns(patterns: string[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    secrets: [],
    credentials: [],
    keys: [],
    config: [],
    data: [],
    custom: [],
  };

  for (const pattern of patterns) {
    const category = categorizePattern(pattern);
    groups[category].push(pattern);
  }

  return groups;
}

function categorizePattern(pattern: string): string {
  const lower = pattern.toLowerCase();

  // Secrets
  if (
    lower.includes('.env') ||
    lower.includes('secret') ||
    lower.includes('password')
  ) {
    return 'secrets';
  }

  // Credentials
  if (
    lower.includes('credential') ||
    lower.includes('.aws') ||
    lower.includes('.gcp') ||
    lower.includes('.npmrc') ||
    lower.includes('.pypirc') ||
    lower.includes('kube') ||
    lower.includes('token')
  ) {
    return 'credentials';
  }

  // Keys
  if (
    lower.includes('.pem') ||
    lower.includes('.key') ||
    lower.includes('.p12') ||
    lower.includes('.pfx') ||
    lower.includes('id_rsa') ||
    lower.includes('id_ed25519') ||
    lower.includes('id_ecdsa') ||
    lower.includes('.ssh')
  ) {
    return 'keys';
  }

  // Config
  if (
    lower.includes('config') ||
    lower.includes('.tfvars') ||
    lower.includes('settings')
  ) {
    return 'config';
  }

  // Data
  if (
    lower.includes('.db') ||
    lower.includes('.sqlite') ||
    lower.includes('.xlsx') ||
    lower.includes('.csv') ||
    lower.includes('data')
  ) {
    return 'data';
  }

  return 'custom';
}

export async function appendToClawignore(
  workspace: string,
  patterns: string[]
): Promise<void> {
  const clawignorePath = join(workspace, '.clawignore');

  let content = '';
  try {
    content = await readFile(clawignorePath, 'utf-8');
  } catch {
    // File doesn't exist, create with header
    content = HEADER;
  }

  // Add new patterns
  const existingPatterns = parseExistingPatterns(content);
  const newPatterns = patterns.filter((p) => !existingPatterns.includes(p));

  if (newPatterns.length === 0) {
    return; // Nothing new to add
  }

  content = content.trimEnd() + '\n\n# Added by clawignore-setup\n';
  for (const pattern of newPatterns) {
    content += `${pattern}\n`;
  }

  await writeFile(clawignorePath, content);
}
