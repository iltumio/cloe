"""Exercise installers without changing the user's browser registrations."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory(prefix="cloe-install-test-") as temporary:
    work = Path(temporary)
    commands = work / "bin"
    commands.mkdir()
    archive = work / "extension.zip"
    with zipfile.ZipFile(archive, "w") as package:
        package.writestr("manifest.json", "{}")
    mocks = {
        "uname": '#!/bin/bash\nif [[ "$1" == "-s" ]]; then echo "$TEST_OS"; else echo x86_64; fi\n',
        "curl": '#!/bin/bash\nwhile [[ "$1" != "-o" ]]; do shift; done\ncp "$TEST_ARCHIVE" "$2"\n',
        "cargo": '#!/bin/bash\nexit 0\n',
        "install": '#!/bin/bash\ntouch "${@: -1}"\n',
    }
    for name, source in mocks.items():
        path = commands / name
        path.write_text(source)
        path.chmod(0o755)
    count = 0
    for script in ("install.sh", "install-native-host.sh", "install-all.sh"):
        for platform in ("Linux", "Darwin"):
            for browser in ("firefox", "chromium"):
                home = work / f'{script}-{platform}-{browser}-space "quoted"'
                home.mkdir()
                # Substitute only in the test copy; never change the real HOME.
                source = (ROOT / "scripts" / script).read_text().replace('$HOME', '$TEST_INSTALL_HOME')
                test_script = work / script
                test_script.write_text(source)
                identifier = "firefox" if browser == "firefox" else "abcdefghijklmnopabcdefghijklmnop"
                args = ["latest", browser] if script == "install-all.sh" else [identifier]
                env = dict(os.environ, PATH=f'{commands}:{os.environ["PATH"]}', TEST_OS=platform,
                           TEST_ARCHIVE=str(archive), TEST_INSTALL_HOME=str(home))
                # Installer's interactive Chromium step is deliberately exercised with a real stdin.
                if script == "install-all.sh" and browser == "chromium":
                    source = source.replace('if [[ ! -t 0 ]]; then', 'if false; then')
                    test_script.write_text(source)
                subprocess.run(["bash", str(test_script), *args], input=identifier + '\n',
                               text=True, env=env, check=True, capture_output=True)
                if browser == "firefox":
                    relative = '.mozilla/native-messaging-hosts' if platform == "Linux" else 'Library/Application Support/Mozilla/NativeMessagingHosts'
                else:
                    relative = '.config/chromium/NativeMessagingHosts' if platform == "Linux" else 'Library/Application Support/Chromium/NativeMessagingHosts'
                manifest = json.loads((home / relative / "com.iltumio.cloe.json").read_text())
                assert manifest['path'] == str(home / '.local/bin/cloe-host')
                if browser == "firefox":
                    assert manifest['allowed_extensions'] == ['cloe@iltumio.dev']
                    assert 'allowed_origins' not in manifest
                else:
                    assert manifest['allowed_origins'] == [f'chrome-extension://{identifier}/']
                    assert 'allowed_extensions' not in manifest
                count += 1
    print(f'{count} installer/browser/platform combinations passed')
