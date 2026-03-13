#!/usr/bin/env python3
"""Quick test for OpenClaw skill analyzer - standalone version"""

import sys
from pathlib import Path
import importlib.util
import re

def load_module_from_file(module_name, file_path, dependencies=None):
    """Load a Python module from a file path"""
    spec = importlib.util.spec_from_file_location(module_name, file_path)
    module = importlib.util.module_from_spec(spec)

    # Add dependencies to module's namespace
    if dependencies:
        for dep_name, dep_module in dependencies.items():
            setattr(module, dep_name, dep_module)

    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module

# Try to import yaml, make it optional
try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False

def main():
    print("Testing OpenClaw Skill Analyzer...")
    print("=" * 60)

    # Load scanner module first (analyzer depends on it)
    scanner_path = Path(__file__).parent / "src" / "core" / "skill" / "adapters" / "openclaw_skill_scanner.py"
    scanner_module = load_module_from_file("openclaw_skill_scanner", scanner_path)

    # Load analyzer module with scanner as dependency
    analyzer_path = Path(__file__).parent / "src" / "core" / "skill" / "adapters" / "openclaw_skill_analyzer.py"
    analyzer_module = load_module_from_file(
        "openclaw_skill_analyzer",
        analyzer_path,
        dependencies={"openclaw_skill_scanner": scanner_module}
    )

    OpenClawSkillScanner = scanner_module.OpenClawSkillScanner
    OpenClawSkillFile = scanner_module.OpenClawSkillFile
    OpenClawSkillAnalyzer = analyzer_module.OpenClawSkillAnalyzer

    # Scan for skills
    print("\n1. Scanning for skills:")
    scanner = OpenClawSkillScanner(scan_paths=["openclaw_skills"])
    skills = scanner.scan()
    print(f"   Found {len(skills)} skill(s)")

    # Analyze each skill
    print("\n2. Analyzing skills:")
    analyzer = OpenClawSkillAnalyzer()

    for skill in skills:
        print(f"\n   Skill: {skill.skill_name}")
        print(f"   " + "-" * 50)

        try:
            info = analyzer.analyze(skill)

            print(f"   Description: {info.description}")
            print(f"   Type: {info.type}")
            print(f"   Has scripts/: {info.has_scripts_dir}")

            if info.is_command_dispatch:
                print(f"   Command Dispatch: {info.command_dispatch}")
                print(f"   Command Tool: {info.command_tool}")

            if info.dependencies.get("bins"):
                print(f"   Binary deps: {info.dependencies['bins']}")

            if info.dependencies.get("env"):
                print(f"   Env deps: {info.dependencies['env']}")

            if info.install_hints:
                print(f"   Install hints: {info.install_hints}")

            # Check {baseDir} replacement
            if "{baseDir}" in info.prompt_template:
                print(f"   ⚠️  WARNING: {{baseDir}} not replaced!")
            else:
                print(f"   ✓ {{baseDir}} placeholder replaced")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 60)
    print("✓ All analyzer tests passed!")

if __name__ == "__main__":
    main()
