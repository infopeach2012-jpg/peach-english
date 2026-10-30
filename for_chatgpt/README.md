# 現在の教材追加手順

毎日送られるノート・画像の取り込みは [DAILY_IMPORT.md](DAILY_IMPORT.md) に従ってください。現在の声は **Kokoro v1.0 / af_sarah**、配置は **1文1ファイル**、速度は **0.6 / 0.75 / 1 / 1.25 / 1.5倍**です。追加分は `generate_missing_audio.py` で作れます。

以下は初期版の資料です。声・音声配置は上記とルートREADMEの最新仕様を優先してください。

---

# Speak Studio を ChatGPT でも作る／直すための資料

このフォルダは、ChatGPT に渡して同じアプリを作らせたり直させたりするための一式です。
**アプリ本体は1つ上の `english-app/` にそのまま入っています**（HTML・CSS・JS・教材JSON）。
ChatGPT に渡すときは `english-app/` を zip にして（`audio/` は大きいので外してよい）アップロードし、
下の「ChatGPT への説明」を貼ってください。

## 声について（重要）

いま使っている自然な声は **Kokoro**（無料・オープンソースのニューラル音声合成）の
**`af_heart`** という声です。ChatGPT の中では音声を作れないので、**音声ファイルは自分のパソコンで作ります**。
手順は `generate_audio.py` の冒頭に書いてあります（Python と ffmpeg が要ります。全1,766文で30〜40分）。

できた `audio/` フォルダをアプリの横に置くと、アプリはその音声を優先して使い、
無い文だけスマホの読み上げに戻ります。

## ファイル

| ファイル | 中身 |
|---|---|
| `generate_audio.py` | 教材JSONから Kokoro で音声を作り、場面ごとの MP3 と `audio_index.json`（文ごとの開始位置と長さ）を出す |
| `SPEC.md` | アプリの仕様（画面・データの形・音声の仕組み）。ChatGPT に作らせるときの説明書 |

## ChatGPT への説明（そのまま貼る）

```
添付の english-app は、ブラウザだけで動く英会話トレーニングアプリ（静的HTML＋JS、ビルド不要）です。
仕様は SPEC.md にあります。教材は data/*.json、音声は audio/*.mp3 と audio/audio_index.json
（文ごとの開始秒と長さ）で、js/speech.js の playClip() が区間再生します。
音声は Kokoro（kokoro-onnx）の af_heart で for_chatgpt/generate_audio.py が作ります。
この構成を変えずに、次の改良をしてください: （ここに頼みたいことを書く）
```
