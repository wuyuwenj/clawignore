import * as p from '@clack/prompts';
import pc from 'picocolors';
import { SensitiveFile, getCategoryIcon, groupByCategory } from './scanner.js';
import { platform } from 'os';
import { browseFiles, browseFilesSimple } from './browser.js';

export async function runWizard(
  sensitiveFiles: SensitiveFile[],
  workspace: string
): Promise<string[]> {
  const selectedPatterns: string[] = [];

  if (sensitiveFiles.length === 0) {
    p.log.info('No sensitive files detected automatically.');

    const addCustom = await p.confirm({
      message: 'Would you like to add files to ignore?',
    });

    if (p.isCancel(addCustom) || !addCustom) {
      return [];
    }

    return await promptAddFiles(workspace);
  }

  // Display found files grouped by category
  console.log('');
  const grouped = groupByCategory(sensitiveFiles);

  for (const [category, files] of grouped) {
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
    console.log(pc.bold(`  ${categoryLabel}:`));
    for (const file of files.slice(0, 5)) {
      const icon = getCategoryIcon(file.category);
      console.log(`    ${icon} ${file.relativePath}`);
      console.log(pc.dim(`       ${file.reason}`));
    }
    if (files.length > 5) {
      console.log(pc.dim(`       ... and ${files.length - 5} more`));
    }
    console.log('');
  }

  // Ask if they want to block all detected files
  const blockChoice = await p.select({
    message: 'Block all detected sensitive files?',
    options: [
      {
        value: 'all',
        label: 'Yes, block all detected files',
        hint: 'recommended',
      },
      {
        value: 'choose',
        label: 'Let me choose which ones',
      },
      {
        value: 'skip',
        label: 'Skip auto-detected files',
      },
    ],
  });

  if (p.isCancel(blockChoice)) {
    p.cancel('Setup cancelled');
    process.exit(0);
  }

  if (blockChoice === 'all') {
    // Add all detected files
    for (const file of sensitiveFiles) {
      selectedPatterns.push(file.relativePath);
    }
  } else if (blockChoice === 'choose') {
    // Let user pick individually
    const choices = sensitiveFiles.map((file) => ({
      value: file.relativePath,
      label: `${getCategoryIcon(file.category)} ${file.relativePath}`,
      hint: file.reason,
    }));

    const selected = await p.multiselect({
      message: 'Select files to block:',
      options: choices,
      initialValues: sensitiveFiles
        .filter((f) => f.confidence === 'high')
        .map((f) => f.relativePath),
      required: false,
    });

    if (p.isCancel(selected)) {
      p.cancel('Setup cancelled');
      process.exit(0);
    }

    selectedPatterns.push(...(selected as string[]));
  }

  // Ask about custom additions
  const addCustom = await p.confirm({
    message: 'Add additional files or patterns to ignore?',
    initialValue: false,
  });

  if (p.isCancel(addCustom)) {
    p.cancel('Setup cancelled');
    process.exit(0);
  }

  if (addCustom) {
    const customPatterns = await promptAddFiles(workspace);
    selectedPatterns.push(...customPatterns);
  }

  return selectedPatterns;
}

async function promptAddFiles(workspace: string): Promise<string[]> {
  const method = await p.select({
    message: 'How do you want to add files?',
    options: [
      {
        value: 'browse',
        label: 'Browse my folders',
        hint: 'recommended',
      },
      {
        value: 'type',
        label: 'Type paths manually',
      },
    ],
  });

  if (p.isCancel(method)) {
    return [];
  }

  if (method === 'browse') {
    try {
      // Try the full interactive browser first
      return await browseFiles(workspace);
    } catch {
      // Fall back to simple multiselect if TTY issues
      p.log.warn('Interactive browser not available, using simple mode');
      return await browseFilesSimple(workspace);
    }
  }

  return await promptCustomPatterns();
}

async function promptCustomPatterns(): Promise<string[]> {
  const patterns: string[] = [];

  console.log('');
  console.log(pc.dim('  Enter file paths or glob patterns to ignore.'));
  console.log(pc.dim('  Examples: company-data/, *.xlsx, internal/**/*.pdf'));
  console.log(pc.dim('  Type "done" when finished.'));
  console.log('');

  while (true) {
    const input = await p.text({
      message: 'Add a pattern:',
      placeholder: 'e.g., company-data/ or *.xlsx',
      validate: (value) => {
        if (value.toLowerCase() === 'done') return;
        if (!value.trim()) return 'Enter a pattern or "done" to finish';
        return;
      },
    });

    if (p.isCancel(input)) {
      break;
    }

    const trimmed = (input as string).trim();

    if (trimmed.toLowerCase() === 'done') {
      break;
    }

    patterns.push(trimmed);
    p.log.success(`Added: ${pc.cyan(trimmed)}`);
  }

  return patterns;
}

export async function runDockerHelpWizard(
  reason: 'not_installed' | 'not_running'
): Promise<void> {
  const os = platform();

  if (reason === 'not_installed') {
    console.log('');
    p.log.step(pc.bold('Installing Docker'));
    console.log('');

    if (os === 'darwin') {
      console.log('  1. Download Docker Desktop for Mac:');
      console.log(pc.cyan('     https://docs.docker.com/desktop/install/mac-install/'));
      console.log('');
      console.log('  2. Open the downloaded .dmg and drag Docker to Applications');
      console.log('');
      console.log('  3. Launch Docker from Applications');
      console.log('');
      console.log('  4. Wait for Docker to start (whale icon in menu bar)');
      console.log('');
      console.log('  5. Run this setup again:');
      console.log(pc.cyan('     npx clawignore'));
    } else if (os === 'win32') {
      console.log('  1. Download Docker Desktop for Windows:');
      console.log(pc.cyan('     https://docs.docker.com/desktop/install/windows-install/'));
      console.log('');
      console.log('  2. Run the installer and follow the prompts');
      console.log('');
      console.log('  3. Restart your computer if prompted');
      console.log('');
      console.log('  4. Launch Docker Desktop');
      console.log('');
      console.log('  5. Run this setup again:');
      console.log(pc.cyan('     npx clawignore'));
    } else {
      // Linux
      console.log('  1. Install Docker Engine:');
      console.log(pc.cyan('     curl -fsSL https://get.docker.com | sh'));
      console.log('');
      console.log('  2. Add your user to the docker group:');
      console.log(pc.cyan('     sudo usermod -aG docker $USER'));
      console.log('');
      console.log('  3. Log out and back in (or run: newgrp docker)');
      console.log('');
      console.log('  4. Verify Docker is working:');
      console.log(pc.cyan('     docker run hello-world'));
      console.log('');
      console.log('  5. Run this setup again:');
      console.log(pc.cyan('     npx clawignore'));
    }
  } else {
    // Docker not running
    console.log('');
    p.log.step(pc.bold('Starting Docker'));
    console.log('');

    if (os === 'darwin') {
      console.log('  1. Open Docker Desktop from your Applications folder');
      console.log('     Or run: ' + pc.cyan('open -a Docker'));
      console.log('');
      console.log('  2. Wait for the whale icon in your menu bar to stop animating');
      console.log('');
      console.log('  3. Run this setup again:');
      console.log(pc.cyan('     npx clawignore'));
    } else if (os === 'win32') {
      console.log('  1. Open Docker Desktop from Start Menu');
      console.log('');
      console.log('  2. Wait for Docker to start (icon in system tray)');
      console.log('');
      console.log('  3. Run this setup again:');
      console.log(pc.cyan('     npx clawignore'));
    } else {
      // Linux
      console.log('  1. Start the Docker service:');
      console.log(pc.cyan('     sudo systemctl start docker'));
      console.log('');
      console.log('  2. Verify Docker is running:');
      console.log(pc.cyan('     docker ps'));
      console.log('');
      console.log('  3. Run this setup again:');
      console.log(pc.cyan('     npx clawignore'));
    }
  }

  console.log('');

  const openDocs = await p.confirm({
    message: 'Open Docker installation guide in your browser?',
    initialValue: true,
  });

  if (!p.isCancel(openDocs) && openDocs) {
    const url = 'https://docs.docker.com/get-docker/';
    const openCmd =
      os === 'darwin'
        ? `open "${url}"`
        : os === 'win32'
        ? `start "${url}"`
        : `xdg-open "${url}"`;

    const { exec } = await import('child_process');
    exec(openCmd);
    p.log.success('Opened Docker docs in your browser');
  }

  p.outro('Come back after Docker is installed and running!');
  process.exit(0);
}
