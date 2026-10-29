# 音声の仕様 —— Codex で音声を作り直すときの決まり

このアプリ（Speak Studio）は、`audio/` に入っている音声を **本文ごとに** 再生する。
音声を別の声・別のエンジンで作り直すときは、下の形に合わせて `audio/` を置き換えればよい。**JavaScript は変えなくてよい。**

## 1. 読む本文（出題のデータ）

| ファイル | 中身 | 音声のキー |
|---|---|---|
| `data/phrases.json` | 例文・単語（`id`, `en`, `ja`, `note`） | `p<id>`（例 `p12`） |
| `data/dialogues.json` | 会話（`id`, `a`, `b`） | `d<id>a` / `d<id>b` |
| `data/reading.json` | 長文（`id`, `en`） | 文ごとに `r<id>_<番号>`（`.` `!` `?` で区切った順。0 から） |
| `data/speeches.json` | スピーチ（`id`, `section`, `en`） | 同じ `section` を 1 つにつないで文ごとに `s<先頭のid>_<番号>` |

**ゆっくり版**は、同じキーに `@slow` を付ける（例 `p12@slow`）。0.75 倍くらいの速さ。無ければ通常の音声を 0.8 倍で再生する。

## 2. 置き方（2 通り。どちらでもよい）

### A. 1文1ファイル（いちばん簡単）
```
audio/
  audio_index.json
  clips/p1.mp3
  clips/p1_slow.mp3
  clips/d3a.mp3
  ...
```
`audio_index.json` は **キー → ファイル名（拡張子なし・audio/ からの相対）**:
```json
{"p1":"clips/p1","p1@slow":"clips/p1_slow","d3a":"clips/d3a"}
```

### B. 場面ごとに 1 ファイルにつなぐ（今の形。ファイル数が少ない）
`audio_index.json` は **キー → [ファイル名, 開始秒, 長さ秒]**:
```json
{"p1":["sit_grammar",0.0,0.683],"p1@slow":["sit_grammar_slow",0.0,0.91]}
```
文と文の間に 0.15 秒の無音を入れる。作り方の見本は `generate_audio.py`（Kokoro 用）。

## 3. 音声ファイルの決まり
- MP3（モノラル・48〜64 kbps で十分）。拡張子は `.mp3`。索引には拡張子を書かない。
- サンプリングレートは自由。
- 本文は `en` を **そのまま** 読む（言い換えない）。
- 無い文は、端末の読み上げに自動で戻る。全部そろえなくても動く。

## 4. 作り直したら
1. `audio/` を丸ごと置き換える（古い MP3 は消す）
2. `sw.js` の `CACHE = 'speak-studio-vNN'` の番号を 1 つ上げる（iPad の古い音声を捨てさせるため）
3. `README.md` の「自然な音声」の節に、使った声・エンジン・日付を書く
4. `main` に push。GitHub Pages が数分で更新する

## 5. 試し方
`index.html#quiz` を開き、「② 英語 → 日本語」で英文が読まれるか、「🐢 ゆっくり」で遅い版が鳴るかを見る。
`js/speech.js` の `speak()` が、キー → 索引 → 再生 の順で探している。
