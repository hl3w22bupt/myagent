#!/usr/bin/env python3
"""
Agent Components Verification Script.

This script verifies that the Agent TypeScript components are properly structured.
"""

import sys
import os
from pathlib import Path

def check_file_exists(filepath, description):
    """Check if a file exists and report."""
    if os.path.exists(filepath):
        print(f"✓ {description}: {filepath}")
        return True
    else:
        print(f"✗ {description}: {filepath} (NOT FOUND)")
        return False

def check_file_content(filepath, required_content, description):
    """Check if file contains required content."""
    try:
        with open(filepath, 'r') as f:
            content = f.read()

        missing = []
        for item in required_content:
            if item not in content:
                missing.append(item)

        if missing:
            print(f"✗ {description}: Missing {missing}")
            return False
        else:
            print(f"✓ {description}: All required content present")
            return True
    except Exception as e:
        print(f"✗ {description}: Error reading file: {e}")
        return False

def main():
    """Run all verification checks."""
    print("=" * 60)
    print("Agent Components Verification")
    print("=" * 60)

    checks = []

    # Check TypeScript files
    print("\n=== TypeScript Files ===")
    ts_files = [
        ('core/agent/types.ts', 'Agent Type Definitions'),
        ('core/agent/ptc-generator.ts', 'PTC Generator'),
        ('core/agent/agent.ts', 'Base Agent Class'),
        ('core/agent/master-agent.ts', 'MasterAgent Class'),
    ]

    for filepath, description in ts_files:
        checks.append(check_file_exists(filepath, description))

    # Check test files
    print("\n=== Test Files ===")
    test_files = [
        ('tests/unit/agent/agent.test.ts', 'Unit Tests'),
        ('tests/integration/agent/agent_integration.test.ts', 'Integration Tests'),
    ]

    for filepath, description in test_files:
        checks.append(check_file_exists(filepath, description))

    # Check content structure
    print("\n=== Content Structure ===")

    # Check types.ts
    checks.append(check_file_content(
        'core/agent/types.ts',
        ['AgentConfig', 'AgentResult', 'PTCGenerator', 'MasterAgentConfig'],
        'Agent Types'
    ))

    # Check ptc-generator.ts
    checks.append(check_file_content(
        'core/agent/ptc-generator.ts',
        ['PTCGenerator', 'generate(', 'planSkills', 'generateCode'],
        'PTC Generator'
    ))

    # Check agent.ts
    checks.append(check_file_content(
        'core/agent/agent.ts',
        ['class Agent', 'async run(', 'ptcGenerator', 'sandbox.execute'],
        'Base Agent'
    ))

    # Check master-agent.ts
    checks.append(check_file_content(
        'core/agent/master-agent.ts',
        ['class MasterAgent', 'extends Agent', 'planWithDelegation'],
        'Master Agent'
    ))

    # Summary
    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)

    passed = sum(1 for c in checks if c)
    total = len(checks)

    print(f"Total: {passed}/{total} checks passed")

    if passed == total:
        print("\n🎉 All Agent components verified!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} check(s) failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())
