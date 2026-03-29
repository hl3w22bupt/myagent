#!/bin/bash
#
# MyAgent pgvector Installation Script
#
# This script installs the pgvector extension using Homebrew.
# For macOS systems with Homebrew PostgreSQL.
#
# Usage:
#   bash scripts/install-pgvector.sh
#

set -e  # Exit on error

echo "============================================================"
echo "  MyAgent pgvector Installation (Homebrew)"
echo "============================================================"
echo ""

# Check if running on macOS
if [[ "$(uname)" != "Darwin" ]]; then
  echo "❌ This script is designed for macOS with Homebrew."
  echo "For Linux systems, please follow the manual installation instructions at:"
  echo "https://github.com/pgvector/pgvector#installation"
  exit 1
fi

# Check if Homebrew is installed
if ! command -v brew &> /dev/null; then
  echo "❌ Homebrew not found. Please install Homebrew first:"
  echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
  exit 1
fi

echo "✓ Homebrew found"

# Check if PostgreSQL is installed via Homebrew
if ! brew list postgresql@18 &> /dev/null && ! brew list postgresql@17 &> /dev/null && ! brew list postgresql &> /dev/null; then
  echo "❌ PostgreSQL not found via Homebrew."
  echo "Please install PostgreSQL first:"
  echo "   brew install postgresql@18"
  exit 1
fi

echo "✓ PostgreSQL found via Homebrew"
echo ""

# Install pgvector via Homebrew
echo "Installing pgvector via Homebrew..."
brew install pgvector

echo ""
echo "============================================================"
echo "  ✅ pgvector installation completed!"
echo "============================================================"
echo ""
echo "Next steps:"
echo "1. Run: npm run setup:knowledge-base -- --execute"
echo "2. This will create the knowledge table and indexes"
echo ""
