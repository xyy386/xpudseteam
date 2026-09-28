"""Compatibility entry point: isolated website-account tests, no preview DB writes."""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
subprocess.run([
    "node", "--experimental-strip-types", "--experimental-vm-modules",
    "--test", "tests/editor-auth.test.mjs",
], cwd=root, check=True)
