"""
Pytest configuration for worktree
"""
import sys
from pathlib import Path

# Add src directory to Python path
worktree_root = Path(__file__).parent
src_path = worktree_root / 'src'
sys.path.insert(0, str(src_path))

print(f"Python path includes: {src_path}")
