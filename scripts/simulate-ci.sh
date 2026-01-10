#!/bin/bash
set -e

echo "=========================================="
echo "Simulating GitHub Actions CI Environment"
echo "=========================================="
echo ""

# Export CI=true to match GitHub Actions environment
export CI=true

# Step 1: Install dependencies (like npm ci in CI)
echo "Step 1: Installing dependencies..."
if [ ! -d "node_modules" ]; then
  npm ci
else
  echo "✓ Dependencies already installed"
fi
echo ""

# Step 2: Generate Motia types
echo "Step 2: Generating Motia types..."
npm run generate-types
echo "✓ Motia types generated"
echo ""

# Step 3: TypeScript type check
echo "Step 3: TypeScript type check..."
npx tsc --noEmit
echo "✓ TypeScript type check passed"
echo ""

# Step 4: ESLint check
echo "Step 4: ESLint check..."
npm run lint
echo "✓ ESLint passed"
echo ""

# Step 5: Run Jest tests with --maxWorkers=1
echo "Step 5: Running Jest tests (CI mode, maxWorkers=1)..."
npm run test -- --passWithNoTests --maxWorkers=1
echo "✓ Jest tests passed"
echo ""

# Step 6: Build project
echo "Step 6: Building project..."
npm run build:ts
echo "✓ Build successful"
echo ""

# Step 7: Additional checks from PR workflow
echo "Step 7: Prettier check..."
npx prettier --check "**/*.{ts,tsx,js,jsx,json,md,yml,yaml}" || echo "⚠️  Some files need formatting (continue-on-error)"
echo ""

echo "=========================================="
echo "✓ All CI simulations passed!"
echo "=========================================="
