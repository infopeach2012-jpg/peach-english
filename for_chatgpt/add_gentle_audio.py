"""Add the 0.6x option without changing pitch on the iPad.
Decode the existing, headroom-normalized normal MP3 once and encode with FFmpeg.
Existing normal/0.75/1.25/1.5 files and mappings are preserved.
"""
import concurrent.futures, json, subprocess
from pathlib import Path
from audit_audio import ROOT, source_texts

index_path = ROOT / 'audio/audio_index.json'
index = json.loads(index_path.read_text())
items = list(source_texts())

def create(key):
    name = 'clips/' + key + '_gentle'
    target = ROOT / 'audio' / (name + '.mp3')
    source = ROOT / 'audio' / (index[key] + '.mp3')
    if not target.exists():
        temporary = target.with_suffix('.tmp.mp3')
        subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                        '-af', 'atempo=0.6', '-ac', '1', '-ar', '24000', '-codec:a', 'libmp3lame', '-b:a', '112k',
                        str(temporary)], check=True)
        temporary.replace(target)
    return key + '@gentle', name

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for i, (key, name) in enumerate(pool.map(create, items), 1):
        index[key] = name
        if i % 400 == 0: print(f'Created {i}/{len(items)} gentle clips', flush=True)
index_path.write_text(json.dumps(index, separators=(',', ':')) + '\n')
print(f'DONE: {len(items)} gentle clips; {len(index)} index entries', flush=True)
