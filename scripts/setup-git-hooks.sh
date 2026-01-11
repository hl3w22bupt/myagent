#!/bin/bash

# Setup Git Hooks
# This script installs the pre-commit hook to run tests before committing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOKS_DIR="$PROJECT_ROOT/.git/hooks"
PRE_COMMIT_HOOK="$HOOKS_DIR/pre-commit"

echo "🔧 Setting up git hooks..."

# Create the pre-commit hook
cat > "$PRE_COMMIT_HOOK" << 'EOF'
#!/bin/bash

# Pre-commit hook to run tests before committing
# This ensures that all tests pass before code is committed

set -e

echo "🔍 Running tests before commit..."
echo ""

# Run tests with --passWithNoTests flag
npm run test -- --passWithNoTests

# Check if tests passed
if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All tests passed! Proceeding with commit..."
    exit 0
else
    echo ""
    echo "❌ Tests failed! Commit aborted."
    echo ""
    echo "Please fix the failing tests before committing."
    echo "You can run tests manually with: npm run test -- --passWithNoTests"
    echo ""
    echo "If you absolutely need to commit without tests (not recommended),"
    echo "use: git commit --no-verify"
    exit 1
fi
EOF

# Make it executable
chmod +x "$PRE_COMMIT_HOOK"

echo "✅ Pre-commit hook installed successfully!"
echo ""
echo "The hook will run tests before each commit."
echo "To bypass the hook (not recommended), use: git commit --no-verify"
echo ""
