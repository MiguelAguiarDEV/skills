#!/usr/bin/env python3
"""Merge (or remove) this repo's hook configs into the user's settings.json.

Used by `install.sh --copy`, which installs skills by copying them into the
Claude config directory instead of going through a marketplace. Hooks are the
one component that cannot be installed by copying a file: they have to be
declared in settings.json.

    merge-hooks.py add    <settings.json> <hooks.json> [<hooks.json> ...]
    merge-hooks.py remove <settings.json>

`add` records every hook entry it inserts in a sidecar file next to
settings.json, so `remove` can take out exactly those and leave the user's own
hooks untouched. Entries already present are not duplicated, which makes a
re-run idempotent.

${CLAUDE_PLUGIN_ROOT} is rewritten to ${CLAUDE_CONFIG_DIR:-$HOME/.claude}: the
plugin variable only exists for installed plugins, and the copy layout mirrors
the plugin layout, so the same relative paths resolve.
"""

import json
import os
import shutil
import sys

SIDECAR = ".miguelaguiardev-skills-hooks.json"
PLUGIN_ROOT = "${CLAUDE_PLUGIN_ROOT}"
CONFIG_ROOT = "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"


def rewrite(value):
    if isinstance(value, str):
        return value.replace(PLUGIN_ROOT, CONFIG_ROOT)
    if isinstance(value, list):
        return [rewrite(v) for v in value]
    if isinstance(value, dict):
        return {k: rewrite(v) for k, v in value.items()}
    return value


def load(path, default):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as fh:
        text = fh.read().strip()
    return json.loads(text) if text else default


def save(path, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
        fh.write("\n")


def add(settings_path, hook_files):
    settings = load(settings_path, {})
    sidecar_path = os.path.join(os.path.dirname(settings_path), SIDECAR)
    installed = load(sidecar_path, {})

    backed_up = os.path.exists(settings_path)
    if backed_up:
        shutil.copyfile(settings_path, settings_path + ".bak")

    hooks = settings.setdefault("hooks", {})
    added = 0
    for path in hook_files:
        config = rewrite(load(path, {})).get("hooks", {})
        for event, groups in config.items():
            existing = hooks.setdefault(event, [])
            for group in groups:
                if group in existing:
                    continue
                existing.append(group)
                installed.setdefault(event, []).append(group)
                added += 1

    save(settings_path, settings)
    save(sidecar_path, installed)
    print(f"{added} hook group(s) added to {settings_path}")
    if added and backed_up:
        print(f"Backup of the previous file: {settings_path}.bak")


def remove(settings_path):
    settings = load(settings_path, {})
    sidecar_path = os.path.join(os.path.dirname(settings_path), SIDECAR)
    installed = load(sidecar_path, {})
    if not installed:
        print("Nothing recorded as installed by this repo; settings.json untouched.")
        return

    if os.path.exists(settings_path):
        shutil.copyfile(settings_path, settings_path + ".bak")

    hooks = settings.get("hooks", {})
    removed = 0
    for event, groups in installed.items():
        remaining = []
        for group in hooks.get(event, []):
            if group in groups:
                removed += 1
            else:
                remaining.append(group)
        if remaining:
            hooks[event] = remaining
        else:
            hooks.pop(event, None)
    if not hooks:
        settings.pop("hooks", None)

    save(settings_path, settings)
    os.remove(sidecar_path)
    print(f"{removed} hook group(s) removed from {settings_path}")


def main(argv):
    if len(argv) < 3:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    action, settings_path = argv[1], argv[2]
    if action == "add":
        if len(argv) < 4:
            print("add needs at least one hooks.json", file=sys.stderr)
            return 2
        add(settings_path, argv[3:])
    elif action == "remove":
        remove(settings_path)
    else:
        print(f"unknown action: {action}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
