#!/usr/bin/env python3
"""Build Chromium and Firefox packages from the shared extension sources."""
import json
from pathlib import Path
import shutil
import sys
import zipfile

FIREFOX_ID = "cloe@iltumio.dev"


def build(output):
    source = Path(__file__).resolve().parent.parent / "extension"
    output.mkdir(parents=True, exist_ok=True)
    for browser, name in (("chromium", "cloe-extension"), ("firefox", "cloe-extension-firefox")):
        target = output / name
        if target.exists():
            shutil.rmtree(target)
        shutil.copytree(source, target)
        manifest = json.loads((source / "manifest.json").read_text())
        if browser == "firefox":
            # Firefox MV3 uses an event page rather than a service worker.
            manifest["background"] = {"scripts": ["rules.js", "background.js"]}
            manifest["browser_specific_settings"] = {"gecko_android": {
                "strict_min_version": "142.0",
            }, "gecko": {
                "id": FIREFOX_ID,
                "strict_min_version": "140.0",
                "data_collection_permissions": {"required": ["none"]},
            }}
        (target / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        with zipfile.ZipFile(output / (name + ".zip"), "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(target.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(target))
        print(target)


if __name__ == "__main__":
    build(Path(sys.argv[1]) if len(sys.argv) > 1 else Path("dist"))
