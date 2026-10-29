# Speak Studio 仕様（ChatGPT 用）

## 全体
- 静的な SPA。`index.html` が画面の枠（ヘッダー・ボトムナビ・各ビューの div）。`js/app.js` がルーター。
- ビューは `window.〇〇View = { render(container), onLeave() }` の形で `js/*.js` に1つずつ。
- データは `js/store.js` が `data/*.json` を fetch して `window.Store.content` に持つ。
  進捗（XP・連続日数・SRS・お気に入り）は localStorage `speak.progress.v1`。
- CSS は Tailwind（CDN または `vendor/tailwind.min.css`）＋ `css/style.css`。
- 1ファイル版は `scripts/build_english_single.py`（リポジトリ直下）で `SpeakStudio.html` を作る。

## データの形
- `data/phrases.json`: `[{id, en, ja, note, src?}]`（1,587件。1069〜はスクリーンショット由来）
- `data/dialogues.json`: `[{id, a, aJa, b, bJa, note}]`（43場面。A が相手、B が自分）
- `data/notes.json`: `[{id, date, en, ja, note}]`（レッスンノート）
- `data/reading.json`: `[{id, section, en, ja}]`（長文・東北旅行12章）
- `data/speeches.json`: `[{id, section, en, ja}]`（スピーチ。同じ section は1章にまとめる）
- `data/situations.json`: `{"p12": "food", "d3": "shop", ...}` フレーズ・会話 → 場面キー。
  場面キー: greet work food shop health travel home hobby study plan feel people tech grammar

## 音声
- `audio/<場面 or 章>.mp3` に文を 0.15秒の無音をはさんで連結。`audio/audio_index.json` が
  `{ key: [ファイル名(拡張子なし), 開始秒, 長さ秒] }`。
  key: フレーズ `p<id>`、会話 `d<id>a` / `d<id>b`、長文 `r<id>_<文番号>`、スピーチ `s<最初のid>_<文番号>`。
- `js/speech.js`: `speak(text, {rate, key, lang})` はクリップがあれば `playClip` で区間再生、無ければ
  Web Speech API（端末の声）。`stopSpeaking()` で両方止まる。日本語（lang:'ja'）は常に端末の声。
- iPhone は最初のタップで `unlockAudio()` を呼ぶ（単一の Audio 要素を使い回す）。

## 画面
- ホーム: 今日の目標リング・連続日数・XP・各機能への入口
- 聞き流し（`js/listen.js`）: タブ「フレーズ・単語」「長文」。フレーズは場面チップと
  文だけ/単語だけで絞り、英語→和訳の順に連続再生。長文は章を選び、文をハイライトしながら自動で進み
  章末で次章へ。設定: 速さ 0.8/1/1.2、和訳の読み上げ、1文の繰り返し 1〜3、文の間 0.3/0.8/1.5秒、英語の声。
- 発音・スピーキング: お手本→声に出す→単語ごとに採点（マイク必要）
- ロールプレイ: A の問いに B を発話
- フラッシュカード: SRS（SM-2）
- 長文・シャドーイング: 文ごとの再生とマイク採点
- クイズ・統計・辞書・復習ボックス・今日のレッスン・AI会話（Anthropic API キー必要）

## 気をつけること
- 既存フレーズの id は変えない（進捗が id に紐づく）。
- Service Worker（`sw.js`）はキャッシュ名 `speak-studio-vN` を上げると更新される。
- 1ファイル版（file:// で開く）では fetch ができないので音声は入らない。URL で配る版に音声を付ける。
