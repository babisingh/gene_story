"""
Architecture Agent — automatically maintains ARCHITECTURE.md.

This script runs as a git post-commit hook. After every commit it:
  1. Reads the git diff from the latest commit
  2. Reads the current ARCHITECTURE.md
  3. Asks Claude to update only the relevant sections based on the diff
  4. Writes the updated ARCHITECTURE.md
  5. Commits the updated doc automatically (with --no-verify to avoid
     an infinite hook loop)

The agent maintains these sections in ARCHITECTURE.md:
  - System Overview (Mermaid diagram)
  - Layer descriptions (data / API / frontend / agents)
  - API endpoint inventory
  - Database schema summary
  - Data flow description
  - Change log (timestamped entry per commit)

Install as a git hook:
  python agents/setup_hooks.py

Or run manually after a commit:
  python agents/architect_agent.py
"""

import os
import subprocess
from datetime import datetime
from pathlib import Path

import anthropic
from dotenv import load_dotenv

load_dotenv()

ARCHITECTURE_PATH = Path("docs/ARCHITECTURE.md")

UPDATE_PROMPT = """\
You maintain the architecture documentation for "Gene Story" — a web application \
that reads genomic annotation data and generates AI-written gene stories for a \
book-like interface.

Current ARCHITECTURE.md:
<current_doc>
{current_doc}
</current_doc>

Latest git commit diff:
<git_diff>
{git_diff}
</git_diff>

Commit message: {commit_message}

Your task: Update ARCHITECTURE.md to reflect the changes in this commit.

Rules:
- Only update sections that are actually affected by the diff
- Keep all existing content that is still accurate
- Add a new entry to the Change Log section with today's date and a one-line summary
- If new files, endpoints, tables, or agents were added — add them to the relevant sections
- If things were removed or renamed — update accordingly
- Keep the Mermaid diagram accurate if the system topology changed
- Be concise — this is a reference document, not an essay
- Preserve all Mermaid code blocks exactly — they must remain valid Mermaid syntax

Return the complete updated ARCHITECTURE.md content, nothing else. \
No preamble, no explanation — just the full document.
"""


def get_git_diff() -> str:
    """Get the diff from the most recent commit."""
    result = subprocess.run(
        ["git", "diff", "HEAD~1", "HEAD", "--stat", "--unified=2"],
        capture_output=True, text=True
    )
    return result.stdout[:8000]  # cap at 8000 chars to stay within token limits


def get_commit_message() -> str:
    """Get the most recent commit message."""
    result = subprocess.run(
        ["git", "log", "-1", "--pretty=%s"],
        capture_output=True, text=True
    )
    return result.stdout.strip()


def update_architecture(current_doc: str, git_diff: str, commit_message: str) -> str:
    """Ask Claude to update the architecture doc based on the latest commit."""
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4000,
        messages=[
            {
                "role": "user",
                "content": UPDATE_PROMPT.format(
                    current_doc=current_doc,
                    git_diff=git_diff,
                    commit_message=commit_message,
                ),
            }
        ],
    )

    return message.content[0].text


def commit_architecture_update() -> None:
    """Stage and commit the updated ARCHITECTURE.md."""
    subprocess.run(["git", "add", str(ARCHITECTURE_PATH)], check=True)

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    subprocess.run(
        [
            "git", "commit",
            "--no-verify",   # prevents infinite hook loop
            "-m", f"docs: update architecture [{timestamp}]",
        ],
        check=True,
    )
    print(f"Architecture doc committed: {ARCHITECTURE_PATH}")


def main():
    # Skip if this commit is itself an architecture update (avoid infinite loop)
    commit_msg = get_commit_message()
    if commit_msg.startswith("docs: update architecture"):
        print("Architecture agent: skipping (this is an architecture commit)")
        return

    print("Architecture agent: updating ARCHITECTURE.md…")

    current_doc = ARCHITECTURE_PATH.read_text(encoding="utf-8") \
        if ARCHITECTURE_PATH.exists() else ""

    git_diff       = get_git_diff()
    commit_message = commit_msg

    if not git_diff.strip():
        print("Architecture agent: no diff found, skipping")
        return

    updated_doc = update_architecture(current_doc, git_diff, commit_message)

    ARCHITECTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    ARCHITECTURE_PATH.write_text(updated_doc, encoding="utf-8")
    print(f"ARCHITECTURE.md updated ({len(updated_doc)} chars)")

    commit_architecture_update()


if __name__ == "__main__":
    main()
