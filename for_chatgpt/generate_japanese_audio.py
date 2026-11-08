"""Build/audit Japanese translations for media playback without device TTS.

Requires pyopenjtalk, numpy, soundfile and FFmpeg. Open JTalk's dictionary must
already be installed (pyopenjtalk downloads its official dictionary on first use).
Japanese: Open JTalk / MMDAgent Mei, 24 kHz mono MP3, 112 kbps, peak -4 dBFS.
Existing content-addressed recordings are preserved; failures never create silence.
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

from audit_audio import ROOT, scan

INDEX = ROOT / 'audio/ja_index.json'


def normalize(text):
    # Match Speech.normText; preserve the original capitalization for synthesis.
    return re.sub(r'\s+', ' ', str(text or '')).strip().lower()


def source_translations():
    read = lambda name: json.loads((ROOT / 'data' / name).read_text())
    texts = {}
    def add(text):
        if normalize(text): texts.setdefault(normalize(text), text.strip())
    for name in ['phrases.json', 'notes.json', 'reading.json', 'speeches.json']:
        for row in read(name):
            add(row.get('ja', ''))
            if name in ['reading.json', 'speeches.json']:
                # Covers both paired sentences and paragraph fallback in ListenView.
                for text in re.findall(r'[^。！？!?]+[。！？!?]*', row['ja']): add(text)
    for row in read('dialogues.json'):
        add(row['aJa']); add(row['bJa'])
    for batch in read('note_batches.json'):
        for item in batch['items']: add(item.get('ja', ''))
    return texts


def filename(normalized):
    return 'ja/' + hashlib.sha256(normalized.encode()).hexdigest()[:24]


def generate(item):
    import pyopenjtalk
    normalized, text = item
    relative = filename(normalized)
    target = ROOT / 'audio' / (relative + '.mp3')
    if target.is_file():
        scan(relative)
        return normalized, relative
    audio, sr = pyopenjtalk.tts(text, speed=1.0)
    audio = np.asarray(audio, dtype=np.float32)
    if not len(audio) or not np.isfinite(audio).all() or np.max(np.abs(audio)) < .00001:
        raise ValueError('Invalid Japanese synthesis: ' + text)
    audio *= 10 ** (-4 / 20) / float(np.max(np.abs(audio)))
    with tempfile.TemporaryDirectory(prefix='.ja-', dir=ROOT / 'audio') as tmp:
        wav = Path(tmp) / 'speech.wav'; mp3 = Path(tmp) / 'speech.mp3'
        sf.write(wav, audio, sr)
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-threads', '1',
                        '-i', str(wav), '-filter_threads', '1', '-af', 'alimiter=limit=0.9:level=0',
                        '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '112k',
                        '-metadata', 'artist=MMDAgent Project Team / Mei voice',
                        '-metadata', 'comment=Voice: CC BY 3.0; see audio/ja/README.md', str(mp3)], check=True)
        mp3.replace(target)
    scan(relative)
    return normalized, relative


def save(index):
    temp = INDEX.with_suffix('.tmp.json')
    temp.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')) + '\n')
    temp.replace(INDEX)


def audit(texts, index, report):
    clips = index['clips']; problems = []
    for text in texts:
        if text not in clips: problems.append({'missing_translation': text})
    files = sorted(set(clips.values())); metrics = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        tasks = {pool.submit(scan, file): file for file in files}
        for task in concurrent.futures.as_completed(tasks):
            try:
                value = task.result(); metrics.append(value)
                if value['sample_rate'] != 24000: problems.append({'sample_rate': value['file']})
                if value['edge_peak'] > .01: problems.append({'edge_peak': value['file']})
            except Exception as e: problems.append({'file': tasks[task], 'error': str(e)})
    actual = {str(p.relative_to(ROOT / 'audio').with_suffix('')) for p in (ROOT / 'audio/ja').glob('*.mp3')}
    for file in sorted(actual - set(files)): problems.append({'unindexed_file': file})
    result = {'engine': index['engine'], 'voice': index['voice'], 'generated_on': index['generated_on'],
              'source_translations': len(texts), 'index_count': len(clips), 'file_count': len(files),
              'decoded_files': len(metrics), 'problems': problems,
              'duration_seconds': round(sum(m['duration'] for m in metrics), 2),
              'peak_dbfs_max': max((m['peak_dbfs'] for m in metrics), default=None),
              'sample_rates': sorted({m['sample_rate'] for m in metrics})}
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(result, ensure_ascii=False), flush=True)
    if problems: raise SystemExit(1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--workers', type=int, default=2)
    ap.add_argument('--audit-only', action='store_true')
    ap.add_argument('--report', type=Path, default=ROOT / 'work/japanese-audio-audit.json')
    args = ap.parse_args()
    texts = source_translations()
    index = json.loads(INDEX.read_text()) if INDEX.exists() else {
        'version': 1, 'engine': 'Open JTalk (pyopenjtalk 0.4.1)', 'voice': 'MMDAgent Mei normal',
        'generated_on': datetime.date.today().isoformat(), 'clips': {}}
    if not args.audit_only:
        pending = [(key, text) for key, text in texts.items()
                   if key not in index['clips'] or not (ROOT / 'audio' / (index['clips'][key] + '.mp3')).is_file()]
        (ROOT / 'audio/ja').mkdir(parents=True, exist_ok=True)
        print(f'Generating {len(pending)} Japanese recordings', flush=True)
        with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as pool:
            for i, (text, file) in enumerate(pool.map(generate, pending), 1):
                index['clips'][text] = file
                if i % 25 == 0 or i == len(pending):
                    save(index); print(f'{i}/{len(pending)} complete', flush=True)
        if not INDEX.exists(): save(index)
    audit(texts, index, args.report)


if __name__ == '__main__':
    main()
