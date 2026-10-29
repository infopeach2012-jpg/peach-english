"""english-app の音声を Kokoro（ニューラルTTS）で生成し、場面ごとの1ファイル（MP3）と位置の索引を作る。"""
"""
使い方（パソコンで実行。ChatGPT の中では動かない）:
  pip install kokoro-onnx soundfile numpy
  ffmpeg をインストール（Mac: brew install ffmpeg / Windows: https://ffmpeg.org）
  モデル2つを同じフォルダに置く:
    https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
  python generate_audio.py --app ../english-app --voice af_heart
  → ../english-app/audio/ に 場面ごとの MP3 と audio_index.json ができる

声の名前: af_heart（いま使っている声・女性・米）/ af_bella / af_nicole / am_michael（男性・米）
          / am_adam / bf_emma（女性・英）/ bm_george（男性・英）
"""
import argparse, json, re, sys, subprocess, os
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
ap=argparse.ArgumentParser()
ap.add_argument('--app',default=os.path.join(os.path.dirname(__file__),'..'),help='english-app のフォルダ')
ap.add_argument('--voice',default='af_heart')
ap.add_argument('--model-dir',default=os.path.dirname(__file__) or '.')
args=ap.parse_args()
APP=os.path.abspath(args.app); OUT=os.path.join(APP,'audio'); os.makedirs(OUT,exist_ok=True)
VOICE=args.voice
k=Kokoro(os.path.join(args.model_dir,'kokoro-v1.0.onnx'),os.path.join(args.model_dir,'voices-v1.0.bin'))
SR=24000; GAP=np.zeros(int(SR*0.15),dtype=np.float32)
ph=json.load(open(f'{APP}/data/phrases.json')); dl=json.load(open(f'{APP}/data/dialogues.json'))
sit=json.load(open(f'{APP}/data/situations.json')); rd=json.load(open(f'{APP}/data/reading.json')); sp=json.load(open(f'{APP}/data/speeches.json'))
def split(t): return [s.strip() for s in (re.findall(r'[^.!?]+[.!?]*',t) or [t]) if s.strip()]
groups={}  # name -> [(key,text)]
for p in ph: groups.setdefault('sit_'+sit.get('p%d'%p['id'],'grammar'),[]).append(('p%d'%p['id'],p['en']))
for d in dl:
    g='sit_'+sit.get('d%d'%d['id'],'greet'); groups.setdefault(g,[]).append(('d%da'%d['id'],d['a'])); groups[g].append(('d%db'%d['id'],d['b']))
for r in rd: groups['text_r%d'%r['id']]=[('r%d_%d'%(r['id'],i),s) for i,s in enumerate(split(r['en']))]
secs={}
for s in sp:
    g=s['section'] or 'スピーチ'
    if g not in secs: secs[g]={'key':'s%d'%s['id'],'en':''}
    secs[g]['en']+=(' ' if secs[g]['en'] else '')+s['en']
for g in secs.values(): groups['text_'+g['key']]=[('%s_%d'%(g['key'],i),s) for i,s in enumerate(split(g['en']))]
index={}; total=sum(len(v) for v in groups.values()); done=0
for name,items in groups.items():
    mp3=f'{OUT}/{name}.mp3'
    if os.path.exists(mp3) and os.path.exists(mp3+'.json'):
        index.update(json.load(open(mp3+'.json'))); done+=len(items); continue
    chunks=[]; pos=0.0; idx={}
    for key,text in items:
        try:
            a,_=k.create(text,voice=VOICE,speed=1.0,lang='en-us'); a=a.astype(np.float32)
        except Exception as e:
            print('ERR',key,text,e,flush=True); a=np.zeros(int(SR*0.5),dtype=np.float32)
        dur=len(a)/SR; idx[key]=[name,round(pos,3),round(dur,3)]
        chunks.append(a); chunks.append(GAP); pos+=dur+0.15; done+=1
        if done%50==0: print(f'{done}/{total}',flush=True)
    wav=f'{OUT}/{name}.wav'; sf.write(wav,np.concatenate(chunks),SR)
    subprocess.run(['ffmpeg','-loglevel','error','-y','-i',wav,'-codec:a','libmp3lame','-b:a','48k','-ac','1',mp3],check=True); os.remove(wav)
    json.dump(idx,open(mp3+'.json','w')); index.update(idx); print('group',name,len(items),flush=True)
json.dump(index,open(f'{OUT}/audio_index.json','w'),separators=(',',':'))
print('DONE',done,flush=True)
