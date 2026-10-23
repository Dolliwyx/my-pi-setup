#!/usr/bin/env python3
"""Preview a Pi restore; --apply copies files with backups. No network calls."""

import argparse
import json
import os
from pathlib import Path
import shutil
import tempfile

REPO = Path(__file__).resolve().parents[1]
MAPPINGS = (
    ("agent", ".pi/agent"),
    ("extensions", ".pi/agent/extensions"),
    ("agents", ".pi/agent/agents"),
    ("pi-agents", ".pi/agents"),
    ("skills", ".agents/skills"),
    ("home", "."),
    ("settings.json", ".pi/settings.json"),
)


def restore(home, apply=False):
    home = home.resolve()
    changes = []
    for source_name, target_name in MAPPINGS:
        source = REPO / source_name
        files = sorted(source.rglob("*")) if source.is_dir() else [source]
        for file in files:
            if file.is_symlink():
                raise ValueError(f"Unexpected snapshot symlink: {file}")
            if not file.is_file():
                continue
            relative = file.relative_to(source) if source.is_dir() else Path()
            destination = home / target_name / relative
            if destination.is_symlink() or not destination.is_file() or destination.read_bytes() != file.read_bytes():
                changes.append((file, destination, None))

    for name in json.loads((REPO / "snapshot.json").read_text())["skillLinks"]:
        if Path(name).name != name or name in (".", ".."):
            raise ValueError("Invalid skill link name")
        destination = home / ".pi/agent/skills" / name
        target = f"../../../.agents/skills/{name}"
        if not destination.is_symlink() or os.readlink(destination) != target:
            changes.append((None, destination, target))

    # Preflight every path before modifying anything; never write through symlinks.
    for _, destination, _ in changes:
        for parent in destination.parents:
            if parent == home:
                break
            if parent.is_symlink() or (parent.exists() and not parent.is_dir()):
                raise ValueError(f"Destination parent is not a plain directory: {parent}")
        if destination.is_dir() and not destination.is_symlink():
            raise ValueError(f"Destination is a directory: {destination}")

    backup = None
    for source, destination, link in changes:
        relative = destination.relative_to(home)
        print(f"{'RESTORE' if apply else 'WOULD RESTORE'} {relative}")
        if not apply:
            continue
        if destination.exists() or destination.is_symlink():
            if backup is None:
                backup = Path(tempfile.mkdtemp(prefix="pi-restore-"))
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(destination, saved, follow_symlinks=False)
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.is_symlink() or (link is not None and destination.exists()):
            destination.unlink()
        if link is not None:
            destination.symlink_to(link)
        else:
            shutil.copy2(source, destination)
    if backup:
        print(f"Existing files backed up to {backup}; move this out of temporary storage to retain it.")
    print(f"{len(changes)} file/link changes. Unrelated destination files are never deleted.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Apply the previewed restore")
    args = parser.parse_args()
    restore(Path.home(), args.apply)


if __name__ == "__main__":
    main()
