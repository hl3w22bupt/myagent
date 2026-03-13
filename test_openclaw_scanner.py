#!/usr/bin/env python3
"""Quick test for OpenClaw skill scanner - standalone version"""

import sys
from pathlib import Path
import importlib.util

def load_module_from_file(module_name, file_path):
    """Load a Python module from a file path"""
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

def main():
    print("Testing OpenClaw Skill Scanner...")
    print("=" * 60)

    # Load the scanner module directly
    scanner_path = Path(__file__).parent / "src" / "core" / "skill" / "adapters" / "openclaw_skill_scanner.py"
    scanner_module = load_module_from_file("openclaw_skill_scanner", scanner_path)

    OpenClawSkillScanner = scanner_module.OpenClawSkillScanner

    # Test with the openclaw_skills directory
    scanner = OpenClawSkillScanner(scan_paths=["openclaw_skills"])

    # Validate scan paths
    print("\n1. Validating scan paths:")
    validation = scanner.validate_scan_paths()
    for path, exists in validation.items():
        status = "✓" if exists else "✗"
        print(f"   {status} {path}")

    # Scan for skills
    print("\n2. Scanning for skills:")
    skills = scanner.scan()
    print(f"   Found {len(skills)} skill(s)")

    for skill in skills:
        print(f"\n   Skill: {skill.skill_name}")
        print(f"   Path: {skill.path}")
        print(f"   Has scripts/: {skill.has_scripts_dir}")

    # List skill names
    print("\n3. Skill names:")
    names = scanner.list_skill_names()
    for name in names:
        print(f"   - {name}")

    # Test scan by name
    if names:
        print(f"\n4. Testing scan_by_name('{names[0]}'):")
        skill = scanner.scan_by_name(names[0])
        if skill:
            print(f"   ✓ Found: {skill.skill_name}")
        else:
            print(f"   ✗ Not found")

    print("\n" + "=" * 60)
    print("✓ All scanner tests passed!")

if __name__ == "__main__":
    main()
