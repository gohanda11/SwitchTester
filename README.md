# Switch Tester

自作キーボードオフラインイベント向けのキースイッチテスター展示サイトです。

- 展示ページ: キー押下 → スイッチ情報を10秒表示 → ホーム
- 管理画面: スイッチ登録・編集、キー押下で1キー紐づけ
- データ: 静的 JSON + 画像（GitHub Pages）
- オフライン: PWA（Service Worker）キャッシュ

## 使い方

```bash
npm install
npm run dev
```

- 展示: http://localhost:5173/
- 管理: http://localhost:5173/#/admin

### 管理画面の流れ（Windows）

1. `/#/admin` でスイッチ情報を登録
2. 「キーを押して紐づけ」→ テスターの該当キーを1つ押す
3. 「JSONエクスポート」で `switches.json` / `keymap.json` をダウンロード
4. `public/data/` に上書き（画像は `public/images/` へ配置し、パスを設定）
5. GitHub に push → Pages へデプロイ
6. 前日に iPad で Pages を一度開き、キャッシュしておく（当日は Wi-Fi なしでも可）

### データ形式

`public/data/switches.json`

- `form`: `mx` | `choc` | `he`
- `feel`: `linear` | `tactile` | `clicky`

`public/data/keymap.json`

- `event.code` → `switchId`（例: `"KeyA": "urstudio-ice-blue"`）
- 1スイッチにつき1キー

### GitHub Pages

1. リポジトリ設定で Pages を GitHub Actions か `dist` デプロイに設定
2. プロジェクトページの場合は `vite.config.ts` の `base` を `/<repo-name>/` に変更
3. `npm run build` の成果物を公開

```bash
npm run build
npm run preview
```

## ファーム注意

iPad Safari のショートカットに吸われにくいキー（F13–F24 など）を推奨。2台分のキーコードは重複させないでください。
