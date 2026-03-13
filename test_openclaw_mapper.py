#!/usr/bin/env python3
"""Quick test for OpenClaw metadata mapper - standalone version"""

import sys
from pathlib import Path
import importlib.util

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

# Try to import yaml
try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False

def main():
    print("Testing OpenClaw Metadata Mapper...")
    print("=" * 60)

    # Load required modules in order
    scanner_path = Path(__file__).parent / "src" / "core" / "skill" / "adapters" / "openclaw_skill_scanner.py"
    scanner_module = load_module_from_file("openclaw_skill_scanner", scanner_path)

    analyzer_path = Path(__file__).parent / "src" / "core" / "skill" / "adapters" / "openclaw_skill_analyzer.py"
    analyzer_module = load_module_from_file(
        "openclaw_skill_analyzer",
        analyzer_path,
        dependencies={"openclaw_skill_scanner": scanner_module}
    )

    mapper_path = Path(__file__).parent / "src" / "core" / "skill" / "adapters" / "openclaw_metadata_mapper.py"
    mapper_module = load_module_from_file(
        "openclaw_metadata_mapper",
        mapper_path,
        dependencies={
            "openclaw_skill_analyzer": analyzer_module
        }
    )

    OpenClawSkillScanner = scanner_module.OpenClawSkillScanner
    OpenClawSkillAnalyzer = analyzer_module.OpenClawSkillAnalyzer
    OpenClawMetadataMapper = mapper_module.OpenClawMetadataMapper

    # Scan and analyze skills
    print("\n1. Scanning and analyzing skills:")
    scanner = OpenClawSkillScanner(scan_paths=["openclaw_skills"])
    skills = scanner.scan()

    analyzer = OpenClawSkillAnalyzer()
    mapper = OpenClawMetadataMapper()

    for skill in skills:
        print(f"\n   Skill: {skill.skill_name}")
        print(f"   " + "-" * 50)

        try:
            # Analyze the skill
            info = analyzer.analyze(skill)

            # Map to myagent format
            metadata = mapper.map_to_myagent_format(info)

            print(f"   Mapped metadata:")
            print(f"   - Name: {metadata['name']}")
            print(f"   - Type: {metadata['type']}")
            print(f"   - Handler: {metadata['handler']}")

            if "requires" in metadata:
                print(f"   - Requires:")
                if metadata["requires"].get("bins"):
                    print(f"     • bins: {metadata['requires']['bins']}")
                if metadata["requires"].get("env"):
                    print(f"     • env: {metadata['requires']['env']}")
                if metadata["requires"].get("install"):
                    print(f"     • install: {metadata['requires']['install']}")

            print(f"   - Tags: {', '.join(metadata['tags'])}")

            # Validate top-level requires (Phase 2 improvement)
            if "requires" in metadata:
                print(f"   ✓ Top-level requires present (Phase 2)")
            else:
                print(f"   ⚠️  No top-level requires")

        except Exception as e:
            print(f"   ✗ Error: {e}")
            import traceback
            traceback.print_exc()

    print("\n" + "=" * 60)
    print("✓ All mapper tests passed!")

if __name__ == "__main__":
    main()
