import * as p from '@clack/prompts';
import pc from 'picocolors';
import { readdir } from 'fs/promises';
import { join, relative, basename } from 'path';
import { homedir } from 'os';
import * as readline from 'readline';

interface FileNode {
  name: string;
  path: string;
  relativePath: string;
  isDirectory: boolean;
  children?: FileNode[];
  expanded?: boolean;
  selected?: boolean;
  depth: number;
  isSensitive?: boolean;  // Auto-detected as sensitive
}

// Files/folders to always hide from the browser (system stuff)
const SYSTEM_HIDDEN = [
  'Library',
  'Applications',
  'System',
  'Volumes',
  'private',
  'usr',
  'bin',
  'sbin',
  'etc',
  'var',
  'tmp',
  'cores',
  'opt',
  'node_modules',
  '.git',
  '.Trash',
  '.cache',
  '.npm',
  '.nvm',
];

// Sensitive file/folder patterns to auto-select as HIDDEN
const SENSITIVE_PATTERNS = [
  // Exact names
  '.env',
  '.env.local',
  '.env.development',
  '.env.production',
  '.env.staging',
  '.ssh',
  '.aws',
  '.gcp',
  '.azure',
  '.kube',
  '.docker',
  '.npmrc',
  '.pypirc',
  '.netrc',
  '.gitconfig',
  '.bash_history',
  '.zsh_history',
  'secrets',
  'private',
  'credentials',
  '.credentials',
  'passwords',
  '.passwords',
  // Patterns (checked with includes/endsWith)
];

const SENSITIVE_EXTENSIONS = [
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.jks',
  '.keystore',
];

const SENSITIVE_KEYWORDS = [
  'secret',
  'credential',
  'password',
  'private_key',
  'privatekey',
  'api_key',
  'apikey',
  'token',
];

function isSensitivePath(name: string, path: string): boolean {
  const lowerName = name.toLowerCase();
  const lowerPath = path.toLowerCase();

  // Check exact matches
  if (SENSITIVE_PATTERNS.includes(lowerName)) {
    return true;
  }

  // Check .env.* pattern
  if (lowerName.startsWith('.env.') || lowerName === '.env') {
    return true;
  }

  // Check extensions
  for (const ext of SENSITIVE_EXTENSIONS) {
    if (lowerName.endsWith(ext)) {
      return true;
    }
  }

  // Check keywords in name
  for (const keyword of SENSITIVE_KEYWORDS) {
    if (lowerName.includes(keyword)) {
      return true;
    }
  }

  // Check for id_rsa, id_ed25519, etc.
  if (lowerName.startsWith('id_') && !lowerName.includes('.pub')) {
    return true;
  }

  // Check for serviceAccountKey*.json
  if (lowerName.startsWith('serviceaccountkey') && lowerName.endsWith('.json')) {
    return true;
  }

  return false;
}

export interface BrowseResult {
  ignoredPaths: string[];    // Paths user selected to HIDE
  allPaths: string[];        // All top-level paths found
}

interface SensitiveFileItem {
  name: string;
  path: string;
  relativePath: string;
  selected: boolean;
  reason: string;
}

/**
 * Browse the user's Mac filesystem and select files to IGNORE.
 * Returns the ignored paths and all available paths.
 */
export async function browseAndSelectIgnored(): Promise<BrowseResult> {
  const home = homedir();
  const tree = await buildFileTree(home, home, 0);

  // Collect all sensitive files from the tree
  const sensitiveFiles = collectSensitiveFiles(tree, home);

  // If there are sensitive files, show the overview first
  let preSelectedPaths: Set<string> = new Set();
  if (sensitiveFiles.length > 0) {
    const overviewResult = await runSensitiveFilesOverview(sensitiveFiles);
    if (overviewResult === null) {
      // User cancelled
      return { ignoredPaths: [], allPaths: [] };
    }
    preSelectedPaths = overviewResult;
  }

  return await runIgnoreBrowser(tree, home, preSelectedPaths);
}

/**
 * Collect all sensitive files from the tree
 */
function collectSensitiveFiles(tree: FileNode[], rootPath: string): SensitiveFileItem[] {
  const result: SensitiveFileItem[] = [];

  const traverse = (nodes: FileNode[]) => {
    for (const node of nodes) {
      if (node.isSensitive) {
        result.push({
          name: node.name,
          path: node.path,
          relativePath: node.relativePath,
          selected: true, // Pre-select all sensitive files
          reason: getSensitiveReason(node.name),
        });
      }
      if (node.children) {
        traverse(node.children);
      }
    }
  };

  traverse(tree);
  return result;
}

/**
 * Get a human-readable reason why a file is considered sensitive
 */
function getSensitiveReason(name: string): string {
  const lowerName = name.toLowerCase();

  if (lowerName.startsWith('.env')) return 'Environment variables may contain secrets';
  if (lowerName === '.ssh' || lowerName.startsWith('id_')) return 'SSH keys and credentials';
  if (lowerName === '.aws') return 'AWS credentials';
  if (lowerName === '.gcp') return 'Google Cloud credentials';
  if (lowerName === '.azure') return 'Azure credentials';
  if (lowerName === '.kube') return 'Kubernetes credentials';
  if (lowerName === '.docker') return 'Docker credentials';
  if (lowerName === '.npmrc') return 'NPM authentication tokens';
  if (lowerName === '.pypirc') return 'PyPI authentication';
  if (lowerName === '.netrc') return 'Network credentials';
  if (lowerName === '.gitconfig') return 'Git configuration';
  if (lowerName.includes('history')) return 'Command history may contain secrets';
  if (lowerName.includes('secret')) return 'Contains "secret" in name';
  if (lowerName.includes('credential')) return 'Contains "credential" in name';
  if (lowerName.includes('password')) return 'Contains "password" in name';
  if (lowerName.includes('private')) return 'Private data';
  if (lowerName.includes('token')) return 'May contain authentication tokens';
  if (lowerName.includes('api_key') || lowerName.includes('apikey')) return 'May contain API keys';
  if (lowerName.endsWith('.pem') || lowerName.endsWith('.key')) return 'Private key file';
  if (lowerName.endsWith('.p12') || lowerName.endsWith('.pfx')) return 'Certificate with private key';
  if (lowerName.endsWith('.jks') || lowerName.endsWith('.keystore')) return 'Java keystore';
  if (lowerName.startsWith('serviceaccount')) return 'Service account credentials';

  return 'Potentially sensitive file';
}

/**
 * Show an interactive overview of all sensitive files
 * Returns the set of selected paths, or null if cancelled
 */
async function runSensitiveFilesOverview(files: SensitiveFileItem[]): Promise<Set<string> | null> {
  let cursor = 0;
  const items = [...files]; // Copy so we can modify selected state

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  readline.emitKeypressEvents(process.stdin, rl);

  const render = () => {
    process.stdout.write('\x1B[2J\x1B[H');

    console.log(pc.cyan('🦞 Clawignore Setup - Sensitive Files Review'));
    console.log(pc.dim('─'.repeat(60)));
    console.log('');
    console.log(pc.bold('Review auto-detected sensitive files:'));
    console.log(pc.dim('  These files will be HIDDEN from OpenClaw by default.'));
    console.log(pc.dim('  Deselect any files you want the AI to access.'));
    console.log('');
    console.log(pc.dim('  ↑/↓ navigate • space toggle • a select all • n deselect all • enter continue'));
    console.log('');

    const selectedCount = items.filter(i => i.selected).length;
    console.log(pc.bold(`  ${pc.yellow(selectedCount + '/' + items.length)} files selected to hide`));
    console.log('');

    const maxVisible = 12;
    const startIdx = Math.max(0, Math.min(cursor - 6, items.length - maxVisible));
    const endIdx = Math.min(startIdx + maxVisible, items.length);

    if (startIdx > 0) {
      console.log(pc.dim('     ↑ more above'));
    }

    for (let i = startIdx; i < endIdx; i++) {
      const item = items[i];
      const isCursor = i === cursor;
      const checkbox = item.selected ? pc.red('◉') : pc.green('◯');

      const icon = item.path.includes('/') && item.name === basename(item.path)
        ? (item.name.includes('.') ? '📄' : '📁')
        : '📁';

      const status = item.selected ? pc.red(' [WILL HIDE]') : pc.green(' [VISIBLE]');

      const line = `  ${checkbox} ${icon} ${item.relativePath}${status}`;
      const reasonLine = pc.dim(`       ${item.reason}`);

      if (isCursor) {
        console.log(pc.inverse(line));
        console.log(reasonLine);
      } else {
        console.log(item.selected ? pc.red(line) : line);
        console.log(reasonLine);
      }
    }

    if (endIdx < items.length) {
      console.log(pc.dim('     ↓ more below'));
    }

    console.log('');
    console.log(pc.dim('  Press enter to continue to file browser →'));
  };

  return new Promise((resolve) => {
    render();

    const handleKeypress = (str: string | undefined, key: readline.Key) => {
      if (!key) return;

      if (key.name === 'up' || key.name === 'k') {
        cursor = Math.max(0, cursor - 1);
        render();
      } else if (key.name === 'down' || key.name === 'j') {
        cursor = Math.min(items.length - 1, cursor + 1);
        render();
      } else if (key.name === 'space') {
        items[cursor].selected = !items[cursor].selected;
        render();
      } else if (str === 'a' || str === 'A') {
        // Select all
        for (const item of items) {
          item.selected = true;
        }
        render();
      } else if (str === 'n' || str === 'N') {
        // Deselect all
        for (const item of items) {
          item.selected = false;
        }
        render();
      } else if (key.name === 'return') {
        cleanup();
        const selectedPaths = new Set(
          items.filter(i => i.selected).map(i => i.path)
        );
        resolve(selectedPaths);
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        resolve(null);
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', handleKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
      process.stdout.write('\x1B[2J\x1B[H');
    };

    process.stdin.on('keypress', handleKeypress);
  });
}

async function buildFileTree(
  dir: string,
  rootPath: string,
  depth: number,
  maxDepth: number = 3
): Promise<FileNode[]> {
  if (depth >= maxDepth) return [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return []; // Permission denied
  }

  const nodes: FileNode[] = [];

  // Sort: directories first, then files, alphabetically
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sorted) {
    // Skip system folders at root level
    if (depth === 0 && SYSTEM_HIDDEN.includes(entry.name)) continue;

    // Skip hidden files (but show .env files)
    if (entry.name.startsWith('.') && !entry.name.startsWith('.env') && !entry.name.startsWith('.openclaw')) {
      // Allow .ssh, .aws, .config to be shown so users can ignore them
      if (!['ssh', 'aws', 'config', 'kube'].some(s => entry.name.includes(s))) {
        continue;
      }
    }

    const fullPath = join(dir, entry.name);
    const relativePath = relative(rootPath, fullPath) || entry.name;

    // Check if this is a sensitive file/folder
    const sensitive = isSensitivePath(entry.name, fullPath);

    const node: FileNode = {
      name: entry.name,
      path: fullPath,
      relativePath,
      isDirectory: entry.isDirectory(),
      depth,
      selected: false,
      expanded: false, // All folders collapsed by default
      isSensitive: sensitive,
    };

    if (entry.isDirectory()) {
      node.children = await buildFileTree(fullPath, rootPath, depth + 1, maxDepth);
    }

    nodes.push(node);
  }

  return nodes;
}

async function runIgnoreBrowser(
  tree: FileNode[],
  rootPath: string,
  preSelectedPaths: Set<string> = new Set()
): Promise<BrowseResult> {
  let flatList = flattenTree(tree);
  let cursor = 0;
  const selected = new Set<string>(preSelectedPaths); // Start with pre-selected paths

  // Count how many were pre-selected (from sensitive overview)
  const autoSelectedCount = preSelectedPaths.size;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  readline.emitKeypressEvents(process.stdin, rl);

  const render = () => {
    process.stdout.write('\x1B[2J\x1B[H');

    console.log(pc.cyan('🦞 Clawignore Setup'));
    console.log(pc.dim('─'.repeat(60)));
    console.log('');
    console.log(pc.bold('Select files/folders to HIDE from OpenClaw:'));
    console.log(pc.dim('  (Selected items will NOT be accessible to the AI)'));
    if (autoSelectedCount > 0) {
      console.log(pc.yellow(`  ⚠️  ${autoSelectedCount} sensitive files auto-detected and pre-selected`));
    }
    console.log('');
    console.log(pc.dim('  ↑/↓ navigate • space toggle • → expand • ← collapse • enter confirm'));
    console.log('');
    console.log(pc.dim(`  📁 ${rootPath}`));
    console.log('');

    const maxVisible = 15;
    const startIdx = Math.max(0, Math.min(cursor - 7, flatList.length - maxVisible));
    const endIdx = Math.min(startIdx + maxVisible, flatList.length);

    if (startIdx > 0) {
      console.log(pc.dim('     ↑ more above'));
    }

    for (let i = startIdx; i < endIdx; i++) {
      const node = flatList[i];
      const isCursor = i === cursor;
      const isSelected = selected.has(node.path);

      const indent = '  '.repeat(node.depth + 1);
      const checkbox = isSelected ? pc.red('◉') : pc.green('◯');
      const icon = node.isDirectory
        ? (node.expanded ? '📂' : '📁')
        : '📄';
      const name = node.name + (node.isDirectory ? '/' : '');

      // Show status hint
      let status = '';
      if (isSelected && node.isSensitive) {
        status = pc.yellow(' [SENSITIVE]');
      } else if (isSelected) {
        status = pc.red(' [HIDDEN]');
      } else if (node.isSensitive) {
        status = pc.dim(' (sensitive)');
      }

      const line = `${indent}${checkbox} ${icon} ${name}${status}`;

      if (isCursor) {
        console.log(pc.inverse(line));
      } else if (isSelected) {
        console.log(pc.red(line));
      } else {
        console.log(line);
      }
    }

    if (endIdx < flatList.length) {
      console.log(pc.dim('     ↓ more below'));
    }

    // Show counts
    console.log('');
    const hiddenCount = selected.size;
    const visibleCount = flatList.filter(n => n.depth === 0).length -
      [...selected].filter(p => flatList.find(n => n.path === p && n.depth === 0)).length;

    console.log(pc.dim(`  ${pc.red(hiddenCount + ' hidden')} from OpenClaw`));
    console.log('');
    console.log(pc.dim('  Press enter to confirm'));
  };

  return new Promise((resolve) => {
    render();

    const handleKeypress = (str: string | undefined, key: readline.Key) => {
      if (!key) return;

      if (key.name === 'up' || key.name === 'k') {
        cursor = Math.max(0, cursor - 1);
        render();
      } else if (key.name === 'down' || key.name === 'j') {
        cursor = Math.min(flatList.length - 1, cursor + 1);
        render();
      } else if (key.name === 'space') {
        const node = flatList[cursor];
        if (selected.has(node.path)) {
          selected.delete(node.path);
          // If directory, also deselect children
          if (node.isDirectory) {
            for (const child of flatList) {
              if (child.path.startsWith(node.path + '/')) {
                selected.delete(child.path);
              }
            }
          }
        } else {
          selected.add(node.path);
          // If directory, also select all children
          if (node.isDirectory) {
            for (const child of flatList) {
              if (child.path.startsWith(node.path + '/')) {
                selected.add(child.path);
              }
            }
          }
        }
        render();
      } else if (key.name === 'right' || key.name === 'l') {
        const node = flatList[cursor];
        if (node.isDirectory && !node.expanded) {
          node.expanded = true;
          flatList = flattenTree(tree);
          render();
        }
      } else if (key.name === 'left' || key.name === 'h') {
        const node = flatList[cursor];
        if (node.isDirectory && node.expanded) {
          node.expanded = false;
          flatList = flattenTree(tree);
          cursor = Math.min(cursor, flatList.length - 1);
          render();
        }
      } else if (key.name === 'return') {
        cleanup();

        // Get all top-level paths
        const allPaths = flatList
          .filter(n => n.depth === 0)
          .map(n => n.path);

        // Get ignored paths (only top-level to avoid redundancy)
        const ignoredPaths = [...selected].filter(p => {
          // Only include if no parent is already selected
          const parts = p.split('/');
          for (let i = 1; i < parts.length; i++) {
            const parentPath = parts.slice(0, i).join('/');
            if (selected.has(parentPath)) {
              return false; // Parent already selected, skip this
            }
          }
          return true;
        });

        resolve({ ignoredPaths, allPaths });
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup();
        resolve({ ignoredPaths: [], allPaths: [] });
      }
    };

    const cleanup = () => {
      process.stdin.removeListener('keypress', handleKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      rl.close();
      process.stdout.write('\x1B[2J\x1B[H');
    };

    process.stdin.on('keypress', handleKeypress);
  });
}

function flattenTree(tree: FileNode[]): FileNode[] {
  const result: FileNode[] = [];

  const traverse = (nodes: FileNode[]) => {
    for (const node of nodes) {
      result.push(node);
      if (node.isDirectory && node.expanded && node.children) {
        traverse(node.children);
      }
    }
  };

  traverse(tree);
  return result;
}

// Keep the old function for backward compatibility
export async function browseFiles(workspace: string): Promise<string[]> {
  const result = await browseAndSelectIgnored();
  return result.ignoredPaths;
}

export async function browseFilesSimple(workspace: string): Promise<string[]> {
  return browseFiles(workspace);
}
