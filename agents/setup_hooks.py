"""
Setup script — installs the git post-commit hook for the architecture agent.

Run once after cloning the repo:
  python agents/setup_hooks.py

This creates .git/hooks/post-commit which automatically runs the
architecture agent after every git commit.
"""

import os
import stat
from pathlib import Path

HOOK_PATH    = Path(".git/hooks/post-commit")
HOOK_CONTENT = """#!/bin/bash
# Gene Story — Architecture Agent post-commit hook
# Automatically updates docs/ARCHITECTURE.md after every commit.
# Installed by: python agents/setup_hooks.py

cd "$(git rev-parse --show-toplevel)"
python3 agents/architect_agent.py
"""


def main():
    if not Path(".git").exists():
        print("Error: run this from the root of the gene_story repository")
        return

    HOOK_PATH.write_text(HOOK_CONTENT)

    # Make the hook executable
    current = os.stat(HOOK_PATH)
    os.chmod(HOOK_PATH, current.st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

    print(f"✅ Git post-commit hook installed: {HOOK_PATH}")
    print("   The architecture agent will now run automatically after each commit.")
    print("   To trigger it manually: python agents/architect_agent.py")


if __name__ == "__main__":
    main()
