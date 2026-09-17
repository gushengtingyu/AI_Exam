"""Low-priority daily SQLite snapshot and incremental upload mirror."""
import datetime
from pathlib import Path
import shutil
import sqlite3

source = Path('/opt/semester-paper-insight')
root = Path('/opt/ai-exam-backups')
root.mkdir(mode=0o700, parents=True, exist_ok=True)
stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
snapshot = root / stamp
snapshot.mkdir(mode=0o700)
db = sqlite3.connect(f'file:{source}/data/app.db?mode=ro', uri=True)
dest = sqlite3.connect(str(snapshot / 'app.db'))
db.backup(dest, pages=128, sleep=0.1)
dest.close()
db.close()
for name in ['runtime.env', '.env', 'compose.release.yml']:
    shutil.copy2(source / 'deployment' / name, snapshot / name)
# Copy only changed files. Keep removed files so retained DB snapshots stay usable.
storage = source / 'storage'
for entry in storage.rglob('*'):
    if not entry.is_file():
        continue
    target = root / 'storage' / entry.relative_to(storage)
    if not target.exists() or target.stat().st_size != entry.stat().st_size or target.stat().st_mtime < entry.stat().st_mtime:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(entry, target)
snapshots = sorted(p for p in root.iterdir() if p.is_dir() and len(p.name) == 15 and p.name.replace('-', '').isdigit())
for old in snapshots[:-7]:
    shutil.rmtree(old)
print(f'Backup complete: {snapshot}')
