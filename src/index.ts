#!/usr/bin/env node

import * as p from '@clack/prompts';
import pc from 'picocolors';
import { checkDocker, getOpenClawWorkspace, findDockerComposeFile, modifyDockerCompose, restartOpenClaw } from './docker.js';
import { scanForSensitiveFiles, groupByCategory, getCategoryIcon } from './scanner.js';
import { runWizard, runDockerHelpWizard } from './wizard.js';
import { writeClawignore } from './writer.js';

async function main() {
  console.clear();

  p.intro(pc.cyan('🦞 Clawignore Setup'));

  const s = p.spinner();
  s.start('Checking your OpenClaw setup...');

  const dockerStatus = await checkDocker();
  const workspace = await getOpenClawWorkspace();

  s.stop('Setup check complete');

  // Handle non-Docker users
  if (!dockerStatus.installed) {
    await handleNoDocker('not_installed');
    return;
  }

  if (!dockerStatus.running) {
    await handleNoDocker('not_running');
    return;
  }

  if (!dockerStatus.openclawRunning) {
    p.log.warn('OpenClaw is not currently running in Docker.');
    const continueAnyway = await p.confirm({
      message: 'Continue with setup anyway?',
    });
    if (p.isCancel(continueAnyway) || !continueAnyway) {
      p.cancel('Setup cancelled');
      process.exit(0);
    }
  }

  if (!workspace) {
    p.log.error('Could not find OpenClaw workspace directory.');
    p.log.info(`Expected location: ~/openclaw/workspace or ~/.openclaw/workspace`);
    p.cancel('Setup cancelled');
    process.exit(1);
  }

  p.log.success(`Found workspace: ${pc.dim(workspace)}`);

  // Check if docker-compose.yml exists
  const composePath = await findDockerComposeFile();

  // Ask user what they want to do
  console.log('');
  const setupMode = await p.select({
    message: 'What would you like to do?',
    options: [
      {
        value: 'full',
        label: 'Browse my Mac and choose what to mount',
        hint: 'recommended - full control',
      },
      {
        value: 'quick',
        label: 'Quick setup - just block sensitive files in workspace',
        hint: 'faster',
      },
    ],
  });

  if (p.isCancel(setupMode)) {
    p.cancel('Setup cancelled');
    process.exit(0);
  }

  if (setupMode === 'full') {
    await runDockerSetupWithClawignore(workspace);
    return;
  }

  // Quick setup: just scan workspace for sensitive files
  if (!composePath) {
    p.log.warn('No docker-compose.yml found. Quick setup requires an existing Docker configuration.');
    p.log.info('Switching to full setup mode...');
    await runDockerSetupWithClawignore(workspace);
    return;
  }

  // Scan for sensitive files
  s.start('Scanning for sensitive files...');
  const sensitiveFiles = await scanForSensitiveFiles(workspace);
  s.stop(`Found ${sensitiveFiles.length} potentially sensitive files`);

  // Run the interactive wizard
  const selectedFiles = await runWizard(sensitiveFiles, workspace);

  if (selectedFiles.length === 0) {
    p.log.warn('No files selected to ignore.');
    const continueEmpty = await p.confirm({
      message: 'Create an empty .clawignore file?',
    });
    if (p.isCancel(continueEmpty) || !continueEmpty) {
      p.cancel('Setup cancelled');
      process.exit(0);
    }
  }

  // Write the .clawignore file
  const clawignorePath = await writeClawignore(workspace, selectedFiles);
  p.log.success(`Created ${pc.green('.clawignore')} with ${selectedFiles.length} entries`);

  // Modify docker-compose.yml to respect .clawignore
  s.start('Updating Docker configuration...');
  const dockerModified = await modifyDockerCompose(workspace, selectedFiles);
  if (dockerModified) {
    s.stop('Docker configuration updated');
  } else {
    s.stop('Docker configuration unchanged (manual update may be needed)');
  }

  // Restart OpenClaw
  const shouldRestart = await p.confirm({
    message: 'Restart OpenClaw now to apply changes?',
    initialValue: true,
  });

  if (p.isCancel(shouldRestart)) {
    p.cancel('Setup cancelled');
    process.exit(0);
  }

  // Get the OpenClaw root directory (workspace parent)
  const openclawRoot = workspace.replace(/\/workspace\/?$/, '');
  const restartCmd = `cd ${openclawRoot} && docker compose restart`;

  let restarted = false;
  if (shouldRestart) {
    s.start('Restarting OpenClaw...');
    restarted = await restartOpenClaw();
    if (restarted) {
      s.stop('OpenClaw restarted successfully');
    } else {
      s.stop('Could not restart automatically');
      p.log.info('Run manually from your OpenClaw directory:');
      p.log.info(pc.cyan(`  ${restartCmd}`));
    }
  }

  // Summary
  console.log('');
  const restartStatus = !shouldRestart
    ? `${pc.yellow('!')} Restart required to apply changes`
    : restarted
    ? `${pc.green('✓')} OpenClaw restarted`
    : `${pc.yellow('!')} Manual restart needed: ${restartCmd}`;

  p.note(
    [
      `${pc.green('✓')} .clawignore created at ${clawignorePath}`,
      `${pc.green('✓')} ${selectedFiles.length} files/patterns blocked`,
      dockerModified ? `${pc.green('✓')} Docker mounts updated` : `${pc.yellow('!')} Docker mounts need manual update`,
      restartStatus,
    ].join('\n'),
    'Summary'
  );

  p.outro(pc.green('Setup complete! Your secrets are now protected.'));
}

async function handleNoDocker(reason: 'not_installed' | 'not_running') {
  const message = reason === 'not_installed'
    ? 'Docker not detected on this system.'
    : 'Docker is installed but not running.';

  p.log.warn(message);

  console.log('');
  console.log(pc.dim('  .clawignore requires Docker to enforce file blocking'));
  console.log(pc.dim('  securely. Without Docker, blocked files can still be'));
  console.log(pc.dim('  accessed through shell commands.'));
  console.log('');

  const choice = await p.select({
    message: 'What would you like to do?',
    options: [
      {
        value: 'create_anyway',
        label: 'Create .clawignore anyway',
        hint: 'basic protection only'
      },
      {
        value: 'help_docker',
        label: 'Help me set up Docker',
        hint: 'recommended'
      },
      {
        value: 'exit',
        label: 'Exit'
      },
    ],
  });

  if (p.isCancel(choice) || choice === 'exit') {
    p.cancel('Setup cancelled');
    process.exit(0);
  }

  if (choice === 'help_docker') {
    await runDockerHelpWizard(reason);
    return;
  }

  if (choice === 'create_anyway') {
    await runNonDockerSetup();
  }
}

async function handleNoDockerCompose(workspace: string) {
  p.log.warn('No docker-compose.yml found.');

  console.log('');
  console.log(pc.dim('  Your OpenClaw is running in CLI mode (without Docker).'));
  console.log(pc.dim('  To enforce .clawignore securely, we can generate a'));
  console.log(pc.dim('  docker-compose.yml that only mounts allowed files.'));
  console.log('');

  const choice = await p.select({
    message: 'What would you like to do?',
    options: [
      {
        value: 'generate',
        label: 'Generate docker-compose.yml for me',
        hint: 'recommended - secure enforcement'
      },
      {
        value: 'create_anyway',
        label: 'Create .clawignore only',
        hint: 'no Docker - advisory mode'
      },
      {
        value: 'exit',
        label: 'Exit'
      },
    ],
  });

  if (p.isCancel(choice) || choice === 'exit') {
    p.cancel('Setup cancelled');
    process.exit(0);
  }

  if (choice === 'generate') {
    await runDockerSetupWithClawignore(workspace);
    return;
  }

  if (choice === 'create_anyway') {
    await runNonDockerSetup();
  }
}

async function runDockerSetupWithClawignore(workspace: string) {
  const openclawRoot = workspace.replace(/\/workspace\/?$/, '');
  const { homedir } = await import('os');
  const home = homedir();

  // Step 1: Scan entire Mac for sensitive files
  const s = p.spinner();
  s.start('Scanning your Mac for sensitive files...');
  const sensitiveFiles = await scanForSensitiveFiles(home);
  s.stop(`Found ${sensitiveFiles.length} potentially sensitive files`);

  // Step 2: Show detected sensitive files and ask what to do
  let preSelectedPaths: string[] = [];

  if (sensitiveFiles.length > 0) {
    // Display found files grouped by category
    console.log('');
    const grouped = groupByCategory(sensitiveFiles);

    for (const [category, files] of grouped) {
      const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1);
      console.log(pc.bold(`  ${categoryLabel}:`));
      for (const file of files.slice(0, 5)) {
        const icon = getCategoryIcon(file.category);
        console.log(`    ${icon} ${file.path}`);
        console.log(pc.dim(`       ${file.reason}`));
      }
      if (files.length > 5) {
        console.log(pc.dim(`       ... and ${files.length - 5} more`));
      }
      console.log('');
    }

    const blockChoice = await p.select({
      message: 'Block all detected sensitive files?',
      options: [
        { value: 'all', label: 'Yes, block all detected files', hint: 'recommended' },
        { value: 'choose', label: 'Let me review in the browser' },
        { value: 'skip', label: 'Skip auto-detection, I\'ll choose manually' },
      ],
    });

    if (p.isCancel(blockChoice)) {
      p.cancel('Setup cancelled');
      process.exit(0);
    }

    if (blockChoice === 'all') {
      preSelectedPaths = sensitiveFiles.map(f => f.path);
    } else if (blockChoice === 'choose') {
      // Will be pre-selected in the browser
      preSelectedPaths = sensitiveFiles.map(f => f.path);
    }
    // 'skip' means preSelectedPaths stays empty
  }

  // Step 3: Open browser for additional selection
  p.log.info('Opening file browser to select additional files to hide...');
  p.log.info(pc.dim('Sensitive files are pre-selected. You can add/remove as needed.'));
  console.log('');

  const { browseAndSelectIgnored } = await import('./browser.js');

  let browseResult: { ignoredPaths: string[]; allPaths: string[] };
  try {
    browseResult = await browseAndSelectIgnored();
  } catch (err) {
    p.log.error('Could not open file browser.');
    p.cancel('Setup cancelled');
    process.exit(1);
  }

  const { ignoredPaths, allPaths } = browseResult;

  if (allPaths.length === 0) {
    p.log.warn('No folders found. Cancelled.');
    process.exit(0);
  }

  const mountedCount = allPaths.length - ignoredPaths.length;
  p.log.success(`${pc.green(mountedCount + ' folders')} will be accessible to OpenClaw`);
  p.log.success(`${pc.red(ignoredPaths.length + ' items')} will be HIDDEN`);

  // Generate docker-compose.yml
  const s2 = p.spinner();
  s2.start('Generating docker-compose.yml...');

  const { generateDockerCompose } = await import('./docker-generator.js');

  const { composePath, envPath, clawignorePath } = await generateDockerCompose({
    openclawRoot,
    allPaths,
    ignoredPaths,
  });

  s2.stop('Docker configuration generated');

  // Check for old sessions with incompatible paths
  const { rm } = await import('fs/promises');
  const { existsSync, readdirSync } = await import('fs');
  const { join } = await import('path');

  const sessionsDir = join(home, '.openclaw/agents/main/sessions');
  const hasOldSessions = existsSync(sessionsDir) && readdirSync(sessionsDir).length > 0;

  if (hasOldSessions) {
    console.log('');
    p.log.warn('Found existing session data with host paths.');
    console.log(pc.dim('  Old sessions contain paths like /Users/... which don\'t work inside Docker.'));
    console.log(pc.dim('  Clearing them prevents "permission denied" errors.'));
    console.log('');

    const clearSessions = await p.confirm({
      message: 'Clear old session data? (Recommended for Docker)',
      initialValue: true,
    });

    if (!p.isCancel(clearSessions) && clearSessions) {
      try {
        await rm(sessionsDir, { recursive: true, force: true });
        p.log.success('Cleared old sessions');
      } catch {
        p.log.warn('Could not clear sessions automatically. You may need to run:');
        console.log(pc.cyan(`  rm -rf ${sessionsDir}`));
      }
    }
  }

  // Show summary
  console.log('');
  const summaryLines = [
    `${pc.green('✓')} docker-compose.yml created at ${composePath}`,
    `${pc.green('✓')} .env created at ${envPath}`,
    `${pc.green('✓')} .clawignore created at ${clawignorePath}`,
    '',
    pc.bold('Mounted folders (accessible to AI):'),
  ];

  const mountedPaths = allPaths.filter(p => !ignoredPaths.some(ip => p === ip || p.startsWith(ip + '/')));
  for (const path of mountedPaths.slice(0, 5)) {
    summaryLines.push(`  ${pc.green('✓')} ${path}`);
  }
  if (mountedPaths.length > 5) {
    summaryLines.push(pc.dim(`  ... and ${mountedPaths.length - 5} more`));
  }

  if (ignoredPaths.length > 0) {
    summaryLines.push('');
    summaryLines.push(pc.bold('Hidden folders (NOT accessible):'));
    for (const path of ignoredPaths.slice(0, 5)) {
      summaryLines.push(`  ${pc.red('✗')} ${path}`);
    }
    if (ignoredPaths.length > 5) {
      summaryLines.push(pc.dim(`  ... and ${ignoredPaths.length - 5} more`));
    }
  }

  p.note(summaryLines.join('\n'), 'Setup Complete');

  console.log('');
  p.log.step(pc.bold('Next steps:'));
  console.log('');
  console.log(pc.dim('  1. Stop your current OpenClaw CLI (if running)'));
  console.log('');
  console.log(pc.dim('  2. Start OpenClaw in Docker:'));
  console.log(pc.cyan(`     cd ${openclawRoot}`));
  console.log(pc.cyan('     docker compose up -d'));
  console.log('');
  console.log(pc.dim('  3. View logs:'));
  console.log(pc.cyan('     docker compose logs -f openclaw-gateway'));
  console.log('');
  console.log(pc.dim('  4. To stop:'));
  console.log(pc.cyan('     docker compose down'));
  console.log('');

  // Ask if they want to start now
  const startNow = await p.confirm({
    message: 'Start OpenClaw in Docker now?',
    initialValue: true,
  });

  if (!p.isCancel(startNow) && startNow) {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Stop any non-Docker OpenClaw processes first
    const s3 = p.spinner();
    s3.start('Stopping any running OpenClaw CLI instances...');
    try {
      // First, stop and unload any launchd services that would respawn the process
      const launchAgentDir = `${home}/Library/LaunchAgents`;
      const possiblePlists = [
        'ai.openclaw.gateway.plist',
        'com.openclaw.gateway.plist',
        'com.clawdbot.gateway.plist',
        'bot.molt.gateway.plist',
      ];

      let stoppedService = false;
      for (const plist of possiblePlists) {
        const plistPath = `${launchAgentDir}/${plist}`;
        try {
          // Check if plist exists and unload it
          await execAsync(`test -f "${plistPath}" && launchctl unload "${plistPath}" 2>/dev/null`);
          stoppedService = true;
        } catch {
          // Plist doesn't exist or already unloaded, continue
        }
      }

      // Also try to stop by service name directly
      const possibleServices = [
        'ai.openclaw.gateway',
        'com.openclaw.gateway',
        'com.clawdbot.gateway',
        'bot.molt.gateway',
      ];

      for (const service of possibleServices) {
        await execAsync(`launchctl stop ${service} 2>/dev/null || true`);
      }

      // Give launchd time to stop the service
      if (stoppedService) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Now find and kill any remaining native openclaw-gateway processes
      const { stdout: pids } = await execAsync(
        `ps aux | grep -E "openclaw-gateway|openclaw serve|node.*openclaw" | grep -v grep | grep -v "docker" | awk '{print $2}'`
      ).catch(() => ({ stdout: '' }));

      const pidList = pids.trim().split('\n').filter(Boolean);
      if (pidList.length > 0) {
        for (const pid of pidList) {
          await execAsync(`kill ${pid} 2>/dev/null || true`);
        }
        // Give processes time to terminate
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      if (stoppedService || pidList.length > 0) {
        s3.stop(`Stopped OpenClaw CLI${stoppedService ? ' (launchd service unloaded)' : ''}`);
      } else {
        s3.stop('No running CLI instances found');
      }
    } catch {
      s3.stop('No running instances found');
    }

    const s4 = p.spinner();
    s4.start('Starting OpenClaw in Docker...');
    try {
      await execAsync(`cd "${openclawRoot}" && docker compose up -d`);
      s4.stop('OpenClaw started successfully!');

      console.log('');
      p.log.success(`OpenClaw is now running with secure .clawignore enforcement`);
      console.log('');
      console.log(pc.dim('  Dashboard: ') + pc.cyan('http://localhost:18789'));
      console.log(pc.dim('  Logs: ') + pc.cyan(`cd ${openclawRoot} && docker compose logs -f`));
    } catch (err) {
      s3.stop('Failed to start Docker');
      p.log.error('Could not start Docker automatically');
      console.log(pc.dim('  Run manually:'));
      console.log(pc.cyan(`  cd ${openclawRoot} && docker compose up -d`));
    }
  }

  p.outro(pc.green('Your secrets are now protected!'));
}

async function runNonDockerSetup() {
  p.log.warn(pc.yellow('⚠️  Creating .clawignore without Docker enforcement'));
  console.log('');
  console.log(pc.dim('  This file will be advisory only. OpenClaw may still'));
  console.log(pc.dim('  be able to access these files through shell commands.'));
  console.log(pc.dim('  For full protection, consider switching to Docker.'));
  console.log('');

  // Try to find a workspace directory
  const workspace = process.cwd();

  const s = p.spinner();
  s.start('Scanning for sensitive files...');
  const sensitiveFiles = await scanForSensitiveFiles(workspace);
  s.stop(`Found ${sensitiveFiles.length} potentially sensitive files`);

  const selectedFiles = await runWizard(sensitiveFiles, workspace);

  if (selectedFiles.length === 0) {
    p.cancel('No files selected');
    process.exit(0);
  }

  const clawignorePath = await writeClawignore(workspace, selectedFiles);

  console.log('');
  p.note(
    [
      `${pc.yellow('!')} .clawignore created at ${clawignorePath}`,
      `${pc.yellow('!')} ${selectedFiles.length} files/patterns listed`,
      `${pc.yellow('!')} Enforcement is ${pc.bold('NOT ACTIVE')} without Docker`,
      '',
      'To enable enforcement, set up Docker:',
      pc.cyan('  npx clawignore --help-docker'),
    ].join('\n'),
    'Warning: Advisory Mode Only'
  );

  p.outro(pc.yellow('Setup complete (advisory mode)'));
}

main().catch((err) => {
  p.log.error('An error occurred:');
  console.error(err);
  process.exit(1);
});
