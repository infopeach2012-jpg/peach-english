"""Audit every indexed English clip and the source-to-audio mapping.
Run from the repository root: python for_chatgpt/audit_audio.py [--report PATH]
Requires numpy and soundfile. No network, API key, or speech service is used.
"""
import argparse, collections, concurrent.futures, hashlib, json, re
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent.parent
VARIANTS = {'': 1, '@slow': .75, '@fast': 1.25, '@faster': 1.5, '@gentle': .6}

def source_texts():
    read = lambda name: json.loads((ROOT / 'data' / name).read_text())
    items = {}
    def add(key, text):
        if key in items: raise ValueError('Duplicate content key: ' + key)
        items[key] = text
    split = lambda text: [s.strip() for s in re.findall(r'[^.!?]+[.!?]*', text) if s.strip()]
    for row in read('phrases.json'): add('p' + str(row['id']), row['en'])
    for row in read('notes.json'):
        if row.get('en'): add('n' + str(row['id']), row['en'])
    for row in read('dialogues.json'):
        add(f"d{row['id']}a", row['a']); add(f"d{row['id']}b", row['b'])
    for row in read('reading.json'):
        for i, text in enumerate(split(row['en'])): add(f"r{row['id']}_{i}", text)
    groups = {}
    for row in read('speeches.json'):
        group = groups.setdefault(row.get('section') or 'スピーチ', {'key': 's' + str(row['id']), 'texts': []})
        group['texts'].append(row['en'])
    for group in groups.values():
        for i, text in enumerate(split(' '.join(group['texts']))): add(group['key'] + '_' + str(i), text)
    for course in read('patterns.json'):
        for item in course['items']: add(item['key'], item['en'])
    script = (ROOT / 'js/freetalk.js').read_text()
    for key, quoted in re.findall(r"key: '([a-z]+)'[^}]+?opener: (\"(?:[^\"\\]|\\.)*\")", script):
        add('ft_' + key, json.loads(quoted))
    return items

def scan(relative):
    path = ROOT / 'audio' / (relative + '.mp3')
    a, sr = sf.read(path, dtype='float32')
    if a.ndim != 1: raise ValueError('Not mono: ' + relative)
    if not len(a) or not np.isfinite(a).all(): raise ValueError('Empty/invalid PCM: ' + relative)
    peak = float(np.max(np.abs(a))); rms = float(np.sqrt(np.mean(a * a)))
    if rms < .00001: raise ValueError('Silent audio: ' + relative)
    if peak >= .999: raise ValueError('Clipped samples: ' + relative)
    return {'file': relative, 'sample_rate': sr, 'duration': len(a) / sr,
            'peak_dbfs': float(20 * np.log10(peak)), 'rms_dbfs': float(20 * np.log10(rms)),
            'edge_peak': float(max(np.max(np.abs(a[:24])), np.max(np.abs(a[-24:])))),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--report', default='work/audio-audit-full.json'); args = ap.parse_args()
    texts = source_texts(); index = json.loads((ROOT / 'audio/audio_index.json').read_text())
    expected = {key + suffix for key in texts for suffix in VARIANTS}
    problems = []
    for k in sorted(expected - index.keys()): problems.append({'missing_key': k})
    for k in sorted(index.keys() - expected): problems.append({'unexpected_key': k})
    files = sorted(set(index.values())); metrics = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        tasks = {pool.submit(scan, f): f for f in files}
        for future in concurrent.futures.as_completed(tasks):
            try: metrics[tasks[future]] = future.result()
            except Exception as e: problems.append({'file': tasks[future], 'error': str(e)})
    actual = {str(f.relative_to(ROOT / 'audio').with_suffix('')) for f in (ROOT / 'audio/clips').glob('*.mp3')}
    for f in sorted(actual - set(files)): problems.append({'unindexed_file': f})
    duration_warnings = []
    for key in texts:
        if index.get(key) not in metrics: continue
        normal = metrics[index[key]]['duration']
        for suffix, speed in VARIANTS.items():
            if not suffix or index.get(key + suffix) not in metrics: continue
            duration = metrics[index[key + suffix]]['duration']
            error = duration - normal / speed
            # Short atempo files have finite analysis-window/encoder padding.
            if abs(error) > max(.16, normal / speed * .04):
                duration_warnings.append({'key': key + suffix, 'duration': round(duration, 4), 'expected': round(normal / speed, 4), 'error': round(error, 4)})
    edge_warnings = [m['file'] for m in metrics.values() if m['edge_peak'] > .01]
    groups = collections.Counter('patterns' if k.startswith('pt_') else 'freetalk' if k.startswith('ft_') else k[0] for k in texts)
    result = {'source_text_count': len(texts), 'index_count': len(index), 'file_count': len(files), 'decoded_files': len(metrics),
              'groups': dict(groups), 'problems': problems, 'duration_warnings': duration_warnings, 'edge_warnings': edge_warnings,
              'sample_rates': sorted(set(m['sample_rate'] for m in metrics.values())),
              'peak_dbfs_max': max(m['peak_dbfs'] for m in metrics.values()),
              'metrics': metrics}
    Path(args.report).parent.mkdir(parents=True, exist_ok=True); Path(args.report).write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in result.items() if k != 'metrics'}, ensure_ascii=False), flush=True)
    if problems: raise SystemExit(1)

if __name__ == '__main__': main()
