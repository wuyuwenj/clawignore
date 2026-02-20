#!/bin/bash
set -e

echo ""
echo "  🦞 clawignore"
echo "  Block sensitive files from AI agent access"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "  ❌ Node.js is required"
  echo ""
  echo "  Install Node.js first:"
  echo "    https://nodejs.org"
  echo ""
  exit 1
fi

# Check Node version (need 18+)
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "  ❌ Node.js 18+ is required (you have v$NODE_VERSION)"
  echo ""
  echo "  Update Node.js:"
  echo "    https://nodejs.org"
  echo ""
  exit 1
fi

echo "  ✓ Node.js $(node -v) detected"
echo ""
echo "  Starting setup..."
echo ""

# Run clawignore via npx
npx clawignore@latest
