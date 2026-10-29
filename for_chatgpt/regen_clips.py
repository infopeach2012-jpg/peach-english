"""音声を Kokoro（af_sarah）で作り直す。1文1ファイル・音量は最大 -3 dB にそろえる・MP3 96 kbps。
割れたように聞こえる原因（0 dB まで振れた音声）を避けるため。速さの版（slow 0.75 / fast 1.25 / faster 1.5）も作る。
使い方: python3 regen_clips.py --app .. --model-dir <kokoro の onnx と bin のフォルダ> [--voice af_sarah]
"""
import argparse, json, os, re, subprocess, shutil, sys
from concurrent.futures import ThreadPoolExecutor
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

ap = argparse.ArgumentParser()
ap.add_argument('--app', default=os.path.join(os.path.dirname(__file__), '..'))
ap.add_argument('--voice', default='af_sarah')
ap.add_argument('--model-dir', default='.')
ap.add_argument('--peak-db', type=float, default=-3.0)
ap.add_argument('--bitrate', default='96k')
args = ap.parse_args()
APP = os.path.abspath(args.app); OUT = os.path.join(APP, 'audio', 'clips'); os.makedirs(OUT, exist_ok=True)
FF = shutil.which('ffmpeg')
if not FF:
    import imageio_ffmpeg; FF = imageio_ffmpeg.get_ffmpeg_exe()
k = Kokoro(os.path.join(args.model_dir, 'kokoro-v1.0.onnx'), os.path.join(args.model_dir, 'voices-v1.0.bin'))
SR = 24000

def split(t): return [s.strip() for s in (re.findall(r'[^.!?]+[.!?]*', t) or [t]) if s.strip()]
J = lambda n: json.load(open(os.path.join(APP, 'data', n), encoding='utf-8'))
items = []  # (key, text)
for p in J('phrases.json'): items.append(('p%d' % p['id'], p['en']))
for d in J('dialogues.json'): items.append(('d%da' % d['id'], d['a'])); items.append(('d%db' % d['id'], d['b']))
for r in J('reading.json'):
    for i, s in enumerate(split(r['en'])): items.append(('r%d_%d' % (r['id'], i), s))
secs = {}
for s in J('speeches.json'):
    g = s.get('section') or 'スピーチ'
    if g not in secs: secs[g] = {'key': 's%d' % s['id'], 'en': ''}
    secs[g]['en'] += (' ' if secs[g]['en'] else '') + s['en']
for g in secs.values():
    for i, s in enumerate(split(g['en'])): items.append(('%s_%d' % (g['key'], i), s))
if os.path.exists(os.path.join(APP, 'data', 'patterns.json')):
    for c in J('patterns.json'):
        for it in c['items']: items.append((it['key'], it['en']))

peak = 10 ** (args.peak_db / 20)
def synth(key, text):
    wav = os.path.join(OUT, key + '.wav')
    try:
        a, _ = k.create(text, voice=args.voice, speed=1.0, lang='en-us'); a = a.astype(np.float32)
    except Exception as e:
        print('ERR', key, text, e, flush=True); a = np.zeros(int(SR * 0.5), dtype=np.float32)
    m = float(np.max(np.abs(a))) or 1.0
    a = a * (peak / m)
    sf.write(wav, a, SR)
    return wav

def encode(key, wav):
    outs = {}
    for suf, af in (('', 'anull'), ('_slow', 'atempo=0.75'), ('_fast', 'atempo=1.25'), ('_faster', 'atempo=1.5')):
        mp3 = os.path.join(OUT, key + suf + '.mp3')
        subprocess.run([FF, '-loglevel', 'error', '-y', '-i', wav, '-af', af + ',alimiter=limit=0.7', '-codec:a', 'libmp3lame', '-b:a', args.bitrate, '-ac', '1', mp3], check=True)
        outs[key + ('@' + suf[1:] if suf else '')] = 'clips/' + key + suf
    os.remove(wav)
    return outs

index = {}
total = len(items); done = 0
with ThreadPoolExecutor(3) as ex:
    futs = []
    for key, text in items:
        wav = synth(key, text)
        futs.append(ex.submit(encode, key, wav))
        done += 1
        if done % 50 == 0: print(f'{done}/{total}', flush=True)
    for f in futs: index.update(f.result())
json.dump(index, open(os.path.join(APP, 'audio', 'audio_index.json'), 'w'), separators=(',', ':'))
print('DONE', len(index), flush=True)
