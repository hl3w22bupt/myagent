#!/bin/bash
# Code analysis script

echo "=== Code Analyzer ==="
echo "Analyzing code at: \${1:-.}"
echo ""

# Check if target exists
if [ ! -d "\${1:-.}" ] && [ ! -f "\${1:-.}" ]; then
    echo "Error: Target not found"
    exit 1
fi

# Run pylint if available
if command -v pylint &> /dev/null; then
    echo "Running pylint..."
    pylint "\${1:-.}" --output-format=text 2>&1 | head -50
fi

# Run bandit if available
if command -v bandit &> /dev/null; then
    echo ""
    echo "Running bandit security scan..."
    bandit "\${1:-.}" -f screen 2>&1 | head -30
fi

echo ""
echo "✓ Analysis complete"
EOF
chmod +x openclaw_skills/code-analyzer/scripts/analyze.sh
