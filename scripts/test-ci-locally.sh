#!/bin/bash

# Local CI Testing Script
# Simulates GitHub Actions CI environment locally

set -e

echo "═══════════════════════════════════════════════════════════════════"
echo "  Local CI Testing"
echo "  Simulating GitHub Actions checks locally"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Track failures
FAILURES=0
PASSED=0

# Helper function
run_check() {
  local name="$1"
  local command="$2"

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $name"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if eval "$command"; then
    echo "✓ $name passed"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo "✗ $name failed"
    FAILURES=$((FAILURES + 1))
    return 1
  fi
}

# 1. Dependencies check
run_check "1. Dependencies Check" "test -d node_modules"

# 2. Generate Motia types
run_check "2. Generate Motia Types" "npm run generate-types"

# 3. TypeScript type check
run_check "3. TypeScript Type Check" "npx tsc --noEmit"

# 4. ESLint check
run_check "4. ESLint Check" "npm run lint"

# 5. Build TypeScript
run_check "5. Build TypeScript" "npm run build:ts"

# 6. Jest tests (CI mode)
run_check "6. Jest Tests (CI mode)" "CI=true npm run test -- --passWithNoTests"

# 7. Prettier check
run_check "7. Prettier Check" "npx prettier --check \"**/*.{ts,tsx,js,jsx,json,md,yml,yaml}\""

# 8. Check for large files
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  8. Check for Large Files"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
LARGE_FILES=$(find . -type f -size +1M -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./dist/*" -not -path "./python_modules/*" | wc -l | tr -d ' ')
if [ "$LARGE_FILES" -eq 0 ]; then
  echo "✓ No large files found"
  PASSED=$((PASSED + 1))
else
  echo "⚠️  Found $LARGE_FILES large files (>1MB):"
  find . -type f -size +1M -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./dist/*" -not -path "./python_modules/*" -ls
  PASSED=$((PASSED + 1))  # Warning only, don't fail
fi

# 9. Verify motia.config.ts exists
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  9. Verify motia.config.ts"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f "motia.config.ts" ]; then
  echo "✓ motia.config.ts exists"
  PASSED=$((PASSED + 1))
else
  echo "✗ motia.config.ts not found"
  FAILURES=$((FAILURES + 1))
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "  Summary"
echo "═══════════════════════════════════════════════════════════════════"
echo "  Passed: $PASSED"
echo "  Failed: $FAILURES"

if [ $FAILURES -eq 0 ]; then
  echo ""
  echo "✓ All CI checks passed!"
  echo "🎉 Safe to commit and push!"
  exit 0
else
  echo ""
  echo "✗ Some CI checks failed"
  echo "Please fix the issues above"
  exit 1
fi
