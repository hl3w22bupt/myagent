"""
Pytest configuration for skill-hook tests
"""

import sys
from pathlib import Path

# Get worktree root
worktree_root = Path(__file__).parent.parent

# Add src to Python path
src_path = worktree_root / 'src'
if src_path.exists():
    sys.path.insert(0, str(src_path))

# Add skills to Python path
skills_path = worktree_root / 'skills'
if skills_path.exists():
    sys.path.insert(0, str(skills_path))
