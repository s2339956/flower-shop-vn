"""精確回復本次修改；預設只檢查。遇到後續編輯就拒絕，絕不使用 git reset。"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--baseline', required=True, type=Path)
parser.add_argument('--target', type=Path)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
baseline = args.baseline.resolve()
metadata = json.loads((baseline / 'baseline.json').read_text())
target = (args.target or Path(metadata['root'])).resolve()
before = metadata['files']
changes = json.loads((baseline / 'changes.json').read_text())

def digest(file):
    return hashlib.sha256(file.read_bytes()).hexdigest() if file.is_file() else None

def within(root, name):
    candidate = (root / name).resolve()
    if not candidate.is_relative_to(root) or candidate == root:
        raise SystemExit('不安全的相對路徑，已停止：' + name)
    return candidate

pending = []
for name, state in changes.items():
    file = within(target, name)
    previous = before.get(name, {}).get('sha256')
    current = digest(file)
    if current == previous:
        continue  # 已回復的檔案不重複動作；完整退版可安全重跑。
    if current != state['after']:
        raise SystemExit('偵測到優化後的額外修改，尚未更動任何檔案：' + name)
    if previous and digest(within(baseline / 'site', name)) != previous:
        raise SystemExit('備份雜湊不符，尚未更動任何檔案：' + name)
    pending.append((name, file, previous))

# 先一次完成全部衝突檢查，通過後才寫入；不碰未列入 changes.json 的檔案。
if args.apply:
    for name, file, previous in pending:
        if previous:
            file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(within(baseline / 'site', name), file)
        else:
            file.unlink()
    for name in changes:
        if digest(within(target, name)) != before.get(name, {}).get('sha256'):
            raise SystemExit('退版後核對失敗：' + name)
print(json.dumps({'mode': 'restored' if args.apply else 'dry-run', 'files': len(pending), 'target': str(target), 'verified': True}, ensure_ascii=False))
