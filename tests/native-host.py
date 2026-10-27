"""Test the real native-messaging binary using launchers that only record arguments."""
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent.parent
subprocess.run(['cargo', 'build', '--manifest-path', str(ROOT / 'native-host/Cargo.toml')], check=True)
with tempfile.TemporaryDirectory(prefix='cloe-actions-') as temporary:
    directory = Path(temporary)
    record = directory / 'launches.jsonl'
    sentinel = directory / 'must-not-exist'
    stub = '#!' + sys.executable + '\nimport json, os, sys\nwith open(os.environ["CLOE_TEST_RECORD"], "a") as out:\n out.write(json.dumps(sys.argv[1:]) + "\\n")\n'
    program = directory / 'custom program'
    for executable in (program, directory / 'xdg-open', directory / 'open'):
        executable.write_text(stub)
        executable.chmod(0o755)
    source = 'https://linear.app/team/issue/ABC-1?q=a&b=two'
    literal = f'$(touch "{sentinel}"); echo unsafe'
    requests = [
        {'url': source},
        {'url': source, 'action': {'type': 'deep_link', 'url': 'linear://linear.app/team/issue/ABC-1'}},
        {'url': source, 'action': {'type': 'command', 'program': str(program), 'args': ['launch', 'webapp', source, literal]}},
        {'url': source, 'action': {'type': 'command', 'program': str(directory / 'missing'), 'args': []}},
        {'url': 'file:///tmp/source', 'action': {'type': 'command', 'program': str(program), 'args': []}},
        {'url': source, 'action': {'type': 'deep_link', 'url': 'file:///tmp/destination'}},
        {'url': source, 'action': {'type': 'command', 'program': str(program), 'args': ['nul\0argument']}},
        {'url': 'cloe://ping'},
    ]
    payload = b''
    for request in requests:
        message = json.dumps(request).encode()
        payload += struct.pack('<I', len(message)) + message
    result = subprocess.run([str(ROOT / 'native-host/target/debug/cloe-host')], input=payload,
        capture_output=True, check=True, env=dict(os.environ, PATH=temporary + ':' + os.environ['PATH'], CLOE_TEST_RECORD=str(record)))
    output = result.stdout
    replies = []
    while output:
        size = struct.unpack('<I', output[:4])[0]
        replies.append(json.loads(output[4:4+size]))
        output = output[4+size:]
    assert [r['ok'] for r in replies] == [True, True, True, False, False, False, False, False], replies
    for _ in range(100):
        if record.exists() and len(record.read_text().splitlines()) == 3:
            break
        time.sleep(0.02)
    launches = [json.loads(line) for line in record.read_text().splitlines()]
    assert [source] in launches
    assert ['linear://linear.app/team/issue/ABC-1'] in launches
    assert ['launch', 'webapp', source, literal] in launches
    assert not sentinel.exists(), 'A command argument was evaluated as shell code'
    print('Native host: default URL, deep link, custom argv, failure handling and shell-literal forwarding passed')
