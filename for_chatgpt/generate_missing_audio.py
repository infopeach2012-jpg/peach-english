"""Generate only missing indexed English clips in all five supported speeds.
Run with the Python environment containing kokoro-onnx, numpy, soundfile and onnxruntime:
  python for_chatgpt/generate_missing_audio.py --model-dir work/models
Kokoro v1.0 / af_sarah; mono 24kHz, MP3 112kbps, normalized PCM peak -4dBFS.
No silent placeholder is published when synthesis fails. Existing files are preserved.
"""
import argparse, json, subprocess, tempfile
from pathlib import Path
import numpy as np
import soundfile as sf
import onnxruntime as ort
from kokoro_onnx import Kokoro
from audit_audio import ROOT, VARIANTS, source_texts, scan


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--model-dir', type=Path, required=True); args = parser.parse_args()
    path = ROOT / 'audio/audio_index.json'; index = json.loads(path.read_text())
    texts = source_texts()
    def present(key):
        return key in index and (ROOT / 'audio' / (index[key] + '.mp3')).is_file()
    pending = [(key, text) for key, text in texts.items() if any(not present(key + suffix) for suffix in VARIANTS)]
    if not pending: print('All audio variants already exist.'); return
    opts = ort.SessionOptions(); opts.intra_op_num_threads = 2; opts.inter_op_num_threads = 2
    model = Kokoro.from_session(ort.InferenceSession(str(args.model_dir / 'kokoro-v1.0.onnx'), sess_options=opts, providers=['CPUExecutionProvider']), str(args.model_dir / 'voices-v1.0.bin'))
    print(f'Generating {len(pending)} texts', flush=True)
    with tempfile.TemporaryDirectory(prefix='.peach-tts-', dir=ROOT / 'audio') as tmp:
        wav = Path(tmp) / 'speech.wav'
        for i, (key, text) in enumerate(pending, 1):
            if present(key):
                audio, sr = sf.read(ROOT / 'audio' / (index[key] + '.mp3'), dtype='float32')
            else:
                audio, sr = model.create(text, voice='af_sarah', speed=1.0, lang='en-us')
            audio = np.asarray(audio, dtype=np.float32)
            if not len(audio) or not np.isfinite(audio).all() or np.max(np.abs(audio)) < .00001: raise ValueError('Invalid synthesis: ' + key)
            if not present(key): audio *= 10 ** (-4 / 20) / float(np.max(np.abs(audio)))
            sf.write(wav, audio, sr)
            for suffix, speed in VARIANTS.items():
                full_key = key + suffix
                if present(full_key): continue
                name = 'clips/' + key + suffix.replace('@', '_'); target = ROOT / 'audio' / (name + '.mp3')
                temporary = Path(tmp) / 'encode.mp3'
                filters = ('anull' if speed == 1 else 'atempo=' + str(speed)) + ',alimiter=limit=0.9:level=0'
                subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(wav), '-af', filters,
                                '-ac', '1', '-ar', '24000', '-c:a', 'libmp3lame', '-b:a', '112k', str(temporary)], check=True)
                temporary.replace(target); scan(name); index[full_key] = name
            # Save after a complete text, so a resumed run can skip verified entries.
            temporary_index = path.with_suffix('.tmp.json')
            temporary_index.write_text(json.dumps(index, separators=(',', ':')) + '\n'); temporary_index.replace(path)
            if i % 5 == 0 or i == len(pending): print(f'{i}/{len(pending)} texts complete', flush=True)
    print('DONE: ' + str(len(index)) + ' index entries', flush=True)

if __name__ == '__main__': main()
