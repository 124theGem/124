"""Exercise the production updater against a local HTTP server and temporary releases."""
from pathlib import Path
import http.server
import json
import os
import subprocess
import tempfile
import threading
import urllib.parse

project = Path(__file__).resolve().parents[1]
source = (project / 'deploy/update-game.sh').read_text()
archive = project / 'releases/coastline-night-v3.zip'
with tempfile.TemporaryDirectory(prefix='coastline-update-') as temp:
    root = Path(temp)
    base = root / 'game'
    old = base / 'releases/old'
    old.mkdir(parents=True)
    (old / 'index.html').write_text('OLD GAME')
    (base / 'current').symlink_to(old)
    state = {'fail': False}

    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_GET(self):
            if state['fail']:
                self.send_error(503)
                return
            super().do_GET()
        def translate_path(self, path):
            return str(base / 'current' / urllib.parse.unquote(path).split('/racing/', 1)[-1])

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    script = root / 'update.sh'
    script.write_text(source.replace('[[ $EUID -eq 0 ]]', '[[ 1 -eq 1 ]]')
        .replace('/var/www/coastline-racing', str(base))
        .replace('https://bot.razdorhouse.ru/racing/', f'http://127.0.0.1:{server.server_port}/racing/'))

    def run(path=archive):
        return subprocess.run(['bash', str(script), str(path)], capture_output=True, text=True)

    try:
        result = run()
        assert result.returncode == 0, (result.stdout, result.stderr)
        assert 'READY:' in result.stdout
        assert (base / 'current/vendor/telegram-web-app-8.0.2.js').exists()
        persistent = base / 'car-config.json'
        assert json.loads(persistent.read_text())['maxSteerDegrees'] == 36
        assert (base / 'current/car-config.json').is_symlink()
        assert (base / 'current/car-config.json').resolve() == persistent
        tuned = {'maxSpeedKmh': 144, 'mass': 1400}
        persistent.write_text(json.dumps(tuned))
        first = os.readlink(base / 'current')
        result = run()
        assert result.returncode == 0, result.stderr
        second = os.readlink(base / 'current')
        assert second != first and Path(first).exists()
        assert json.loads((base / 'current/car-config.json').read_text()) == tuned
        state['fail'] = True
        result = run()
        assert result.returncode != 0 and os.readlink(base / 'current') == second and 'restored' in result.stderr
        assert json.loads(persistent.read_text()) == tuned
        state['fail'] = False
        tampered = root / 'tampered.zip'
        tampered.write_bytes(archive.read_bytes() + b'bad')
        result = run(tampered)
        assert result.returncode != 0 and os.readlink(base / 'current') == second and 'checksum mismatch' in result.stderr
        persistent.write_text('{broken')
        result = run()
        assert result.returncode != 0 and os.readlink(base / 'current') == second
        assert persistent.read_text() == '{broken', 'do not overwrite an invalid user file'
        # Migrating a legacy per-release configuration also preserves custom values.
        persistent.unlink()
        (old / 'car-config.json').write_text(json.dumps(tuned))
        (base / 'current').unlink()
        (base / 'current').symlink_to(old)
        result = run()
        assert result.returncode == 0, result.stderr
        assert json.loads(persistent.read_text()) == tuned
        print('PASS: first/repeat update, persistent tuning, legacy migration, real HTTP HTML/JS/SDK/JSON, readiness rollback, checksum guard, invalid JSON retains active release.')
    finally:
        server.shutdown()
        server.server_close()
