# clawignore

**Protect your sensitive files from AI agent access.**

When you use OpenClaw, the AI agent can see all your files — including secrets you probably don't want it to access. This tool helps you block sensitive files so they're completely invisible to the AI.

## Why?

AI agents are powerful, but they don't need access to:
- Your `.env` files with API keys
- Your AWS/GCP credentials
- Your SSH private keys
- Your database passwords
- Your company's private documents

**clawignore** scans your machine, finds sensitive files, and blocks them from OpenClaw using Docker isolation. Blocked files are never mounted into the container — the AI literally cannot see them.

## Quick Start

```bash
npx clawignore
```

That's it. The wizard will guide you through the rest.

## Prerequisites

Before running the setup:

1. **Docker** — Install [Docker Desktop](https://docs.docker.com/get-docker/) and make sure it's running (you should see the whale icon in your menu bar or system tray)

2. **OpenClaw** — Should already be installed. If not, install it first from the OpenClaw website

Don't worry if you don't have Docker installed yet — the tool will detect this and help you set it up.

## How It Works

1. **Scans your machine** for sensitive files (`.env`, private keys, credentials, etc.)
2. **Shows you what it found** and lets you choose what to block
3. **Creates a `.clawignore` file** listing all blocked patterns
4. **Generates Docker configuration** that enforces the block
5. **Restarts OpenClaw** in Docker with the new settings

### What is `.clawignore`?

It's like `.gitignore`, but for AI access. Files matching patterns in `.clawignore` will be hidden from OpenClaw.

Example `.clawignore`:
```gitignore
# Secrets & environment variables
.env
.env.local
.env.production

# Private keys & certificates
*.pem
*.key
id_rsa

# Credentials & auth tokens
.aws/credentials
.kube/config

# Custom patterns
company-secrets/
client-data/*.xlsx
```

## Setup Modes

When you run the tool, you'll be asked to choose a setup mode:

### Full Setup (Recommended)

- Scans your entire Mac for sensitive files
- Opens a file browser to select what to mount
- Generates a complete `docker-compose.yml`
- Gives you full control over what OpenClaw can access

### Quick Setup

- Only scans your OpenClaw workspace folder
- Updates your existing Docker configuration
- Faster if you just want to block a few files

## Docker Setup

The tool handles Docker configuration automatically. Here's what happens behind the scenes:

### If you already have Docker set up with OpenClaw

The tool will modify your existing `docker-compose.yml` to exclude blocked files from the mounted volumes.

### If you're running OpenClaw without Docker

The tool will generate a new `docker-compose.yml` that:
- Mounts only the folders you've approved
- Excludes all blocked files
- Sets up OpenClaw to run securely in a container

### If you don't have Docker installed

No problem! The tool will:
1. Detect that Docker is missing
2. Show you step-by-step instructions to install it
3. Offer to open the Docker installation page
4. Wait for you to come back and run the setup again

## After Setup

Once setup is complete, start OpenClaw with:

```bash
cd ~/openclaw   # or wherever your OpenClaw is installed
docker compose up -d
```

View logs:
```bash
docker compose logs -f
```

Stop OpenClaw:
```bash
docker compose down
```

## Editing `.clawignore` Manually

You can view `.clawignore` to see what's currently blocked. It uses the same syntax as `.gitignore`:

```gitignore
# Block a specific file
secrets.json

# Block all files with an extension
*.pem
*.key

# Block a folder
private-data/

# Block files in any subdirectory
**/credentials.json

# Block with wildcards
*.secret.*
company-*/internal/
```

### Important: Re-run setup after editing

The `.clawignore` file is a record of what's blocked, but the actual enforcement happens through Docker volume mounts in `docker-compose.yml`.

**If you manually edit `.clawignore`, you need to re-run the setup:**

```bash
npx clawignore
```

This will regenerate `docker-compose.yml` with the updated mounts. Then restart OpenClaw:

```bash
docker compose down
docker compose up -d
```

Simply restarting the container won't apply manual changes to `.clawignore` — the volume mounts need to be regenerated.

## Running Again

Need to add more files to block? Or changed your mind about something? Just run the tool again:

```bash
npx clawignore
```

It will:
- Detect your existing `.clawignore`
- Merge new patterns with existing ones
- Regenerate your Docker configuration with updated volume mounts

**Note:** This is the only way to apply changes. The Docker volume mounts are generated at setup time, so you must re-run the setup whenever you want to block or unblock files.

## Troubleshooting

### "Docker not detected"

Make sure Docker Desktop is installed and running:
- **Mac**: Look for the whale icon in your menu bar
- **Windows**: Look for the whale icon in your system tray
- **Linux**: Run `docker ps` to check if Docker is running

If Docker isn't installed, the tool will show you how to install it.

### "OpenClaw workspace not found"

The tool looks for your workspace in these locations:
- `~/openclaw/workspace`
- `~/.openclaw/workspace`

Make sure OpenClaw is installed and you've run it at least once.

### "Could not restart OpenClaw automatically"

You can restart manually:

```bash
cd ~/openclaw
docker compose down
docker compose up -d
```

### "Files are still visible to OpenClaw"

Make sure you:
1. Re-ran `npx clawignore` after any changes to `.clawignore`
2. Restarted OpenClaw after setup (`docker compose down && docker compose up -d`)
3. Are running OpenClaw through Docker, not the CLI directly

**Common mistake:** Manually editing `.clawignore` and only restarting the container. This won't work because the blocked files are enforced through Docker volume mounts, which are set when you run `npx clawignore`. Always re-run the setup after making changes.

If you're running the CLI directly (not Docker), `.clawignore` only works in advisory mode — the AI can still technically access blocked files through shell commands. For full enforcement, use Docker.

### Interactive browser not working

If the file browser doesn't open, the tool will fall back to a simpler text-based selection. This is normal on some systems.

## How Secure Is This?

| Mode | Security Level | How it works |
|------|----------------|--------------|
| **Docker (recommended)** | Strong | Blocked files are never mounted — they don't exist in the AI's environment |
| **CLI only** | Advisory | `.clawignore` tells the AI not to read files, but it could bypass this through shell commands |

For real security, always use Docker mode.

## Contributing

Found a bug? Have a suggestion? Open an issue or PR:

https://github.com/wuyuwenj/clawignore

## License

MIT
