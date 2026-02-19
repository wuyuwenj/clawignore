import { globby } from 'globby';
import { readFile } from 'fs/promises';
import { join, relative } from 'path';

export interface SensitiveFile {
  path: string;
  relativePath: string;
  reason: string;
  category: 'secrets' | 'credentials' | 'keys' | 'config' | 'data';
  confidence: 'high' | 'medium';
}

// Patterns that are almost always sensitive
const HIGH_CONFIDENCE_PATTERNS = [
  { pattern: '**/.env', reason: 'Environment variables file', category: 'secrets' as const },
  { pattern: '**/.env.*', reason: 'Environment variables file', category: 'secrets' as const },
  { pattern: '**/.env.local', reason: 'Local environment file', category: 'secrets' as const },
  { pattern: '**/.env.production', reason: 'Production environment file', category: 'secrets' as const },
  { pattern: '**/*.pem', reason: 'PEM certificate/key file', category: 'keys' as const },
  { pattern: '**/*.key', reason: 'Private key file', category: 'keys' as const },
  { pattern: '**/*.p12', reason: 'PKCS#12 certificate file', category: 'keys' as const },
  { pattern: '**/*.pfx', reason: 'PFX certificate file', category: 'keys' as const },
  { pattern: '**/id_rsa', reason: 'SSH private key', category: 'keys' as const },
  { pattern: '**/id_rsa.*', reason: 'SSH key file', category: 'keys' as const },
  { pattern: '**/id_ed25519', reason: 'SSH private key', category: 'keys' as const },
  { pattern: '**/id_ecdsa', reason: 'SSH private key', category: 'keys' as const },
  { pattern: '**/.ssh/*', reason: 'SSH directory', category: 'keys' as const },
  { pattern: '**/secrets/**', reason: 'Secrets directory', category: 'secrets' as const },
  { pattern: '**/credentials.json', reason: 'Credentials file', category: 'credentials' as const },
  { pattern: '**/serviceAccountKey*.json', reason: 'Service account key', category: 'credentials' as const },
  { pattern: '**/.aws/credentials', reason: 'AWS credentials', category: 'credentials' as const },
  { pattern: '**/.aws/config', reason: 'AWS config', category: 'credentials' as const },
  { pattern: '**/.gcp/**', reason: 'GCP config directory', category: 'credentials' as const },
  { pattern: '**/terraform.tfvars', reason: 'Terraform variables', category: 'config' as const },
  { pattern: '**/*.tfvars', reason: 'Terraform variables', category: 'config' as const },
  { pattern: '**/.npmrc', reason: 'NPM config (may contain tokens)', category: 'credentials' as const },
  { pattern: '**/.pypirc', reason: 'PyPI config (may contain tokens)', category: 'credentials' as const },
  { pattern: '**/.docker/config.json', reason: 'Docker config', category: 'credentials' as const },
  { pattern: '**/kubeconfig', reason: 'Kubernetes config', category: 'credentials' as const },
  { pattern: '**/.kube/config', reason: 'Kubernetes config', category: 'credentials' as const },
];

// Patterns that might be sensitive - need content inspection
const MEDIUM_CONFIDENCE_PATTERNS = [
  { pattern: '**/config.json', reason: 'Config file (may contain secrets)', category: 'config' as const },
  { pattern: '**/config/*.json', reason: 'Config file (may contain secrets)', category: 'config' as const },
  { pattern: '**/settings.json', reason: 'Settings file (may contain secrets)', category: 'config' as const },
  { pattern: '**/*secret*', reason: 'File with "secret" in name', category: 'secrets' as const },
  { pattern: '**/*password*', reason: 'File with "password" in name', category: 'secrets' as const },
  { pattern: '**/*credential*', reason: 'File with "credential" in name', category: 'credentials' as const },
  { pattern: '**/*.sqlite', reason: 'SQLite database', category: 'data' as const },
  { pattern: '**/*.db', reason: 'Database file', category: 'data' as const },
];

// Patterns to always exclude from scanning
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/*.log',
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
];

// Keywords that indicate a file contains secrets
const SECRET_KEYWORDS = [
  'API_KEY',
  'APIKEY',
  'API_SECRET',
  'SECRET_KEY',
  'PRIVATE_KEY',
  'ACCESS_TOKEN',
  'AUTH_TOKEN',
  'PASSWORD',
  'DB_PASSWORD',
  'DATABASE_URL',
  'STRIPE_KEY',
  'STRIPE_SECRET',
  'AWS_ACCESS_KEY',
  'AWS_SECRET',
  'GITHUB_TOKEN',
  'NPM_TOKEN',
  'SLACK_TOKEN',
  'DISCORD_TOKEN',
  'TWILIO_',
  'SENDGRID_',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
];

export async function scanForSensitiveFiles(workspace: string): Promise<SensitiveFile[]> {
  const sensitiveFiles: SensitiveFile[] = [];
  const seenPaths = new Set<string>();

  // Scan high confidence patterns
  for (const { pattern, reason, category } of HIGH_CONFIDENCE_PATTERNS) {
    try {
      const matches = await globby(pattern, {
        cwd: workspace,
        ignore: EXCLUDE_PATTERNS,
        dot: true,
        absolute: true,
      });

      for (const match of matches) {
        if (seenPaths.has(match)) continue;
        seenPaths.add(match);

        sensitiveFiles.push({
          path: match,
          relativePath: relative(workspace, match),
          reason,
          category,
          confidence: 'high',
        });
      }
    } catch {
      // Ignore glob errors
    }
  }

  // Scan medium confidence patterns
  for (const { pattern, reason, category } of MEDIUM_CONFIDENCE_PATTERNS) {
    try {
      const matches = await globby(pattern, {
        cwd: workspace,
        ignore: EXCLUDE_PATTERNS,
        dot: true,
        absolute: true,
      });

      for (const match of matches) {
        if (seenPaths.has(match)) continue;

        // For medium confidence, check file contents
        const hasSecrets = await fileContainsSecrets(match);
        if (hasSecrets) {
          seenPaths.add(match);
          sensitiveFiles.push({
            path: match,
            relativePath: relative(workspace, match),
            reason,
            category,
            confidence: 'medium',
          });
        }
      }
    } catch {
      // Ignore glob errors
    }
  }

  // Sort by confidence then category
  sensitiveFiles.sort((a, b) => {
    if (a.confidence !== b.confidence) {
      return a.confidence === 'high' ? -1 : 1;
    }
    return a.category.localeCompare(b.category);
  });

  return sensitiveFiles;
}

async function fileContainsSecrets(filePath: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const upperContent = content.toUpperCase();

    for (const keyword of SECRET_KEYWORDS) {
      if (upperContent.includes(keyword)) {
        return true;
      }
    }

    // Check for patterns that look like API keys
    // Long alphanumeric strings after = or :
    const keyPattern = /[=:]\s*['"]?[a-zA-Z0-9_-]{32,}['"]?/;
    if (keyPattern.test(content)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function getCategoryIcon(category: SensitiveFile['category']): string {
  switch (category) {
    case 'secrets': return '🔴';
    case 'credentials': return '🔴';
    case 'keys': return '🔴';
    case 'config': return '🟡';
    case 'data': return '🟡';
    default: return '⚪';
  }
}

export function groupByCategory(files: SensitiveFile[]): Map<string, SensitiveFile[]> {
  const groups = new Map<string, SensitiveFile[]>();

  for (const file of files) {
    const existing = groups.get(file.category) || [];
    existing.push(file);
    groups.set(file.category, existing);
  }

  return groups;
}
