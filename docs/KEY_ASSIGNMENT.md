# キー割り当て定義書 (KEY_ASSIGNMENT)

SwitchTester 展示用テスター(HE / MX)の「物理スイッチ位置 → event.code → スイッチ名」の対応を定義するドキュメントです。

- 対応データ本体: `public/data/keymap.json`(event.code → switchId)
- スイッチ情報本体: `public/data/switches.json`(switchId → スイッチ詳細)
- このファイルに記載した割り当てに従って、テスターのファームウェア(QMK / VIA 等)のキーコードを設定してください。

---

## 1. 基本ルール

1. **event.code ベースで管理する**
   ブラウザは物理キーの位置から `event.code`(例 `F13`, `KeyA`, `Digit1`)を報告します。キーボードレイアウト(JIS/US)に依存しないため、テスターのキー識別に使用します。
2. **キーコードは 2 台のテスター間で重複させない**
   1 つの `event.code` は 1 つのスイッチにだけ割り当てます(押したテスターが誤って別テスターのスイッチを発動させるのを防ぐため)。
3. **iPad キオスクで安全なキーを優先する**
   iPadOS は F1〜F12 を輝度・メディア等のシステム機能に奪うため使用しません。F13〜F24 を最優先で使用し、足りない分は通常キー(英字・数字・記号)を使用します。修飾キー(⌘/⌥/⌃/⇧)・矢印・Home/End/PageUp/PageDown・Esc・Tab・Space は iPadOS のショートカットと衝突するため使用しません。
4. **「物理位置」の向きの定義**(このドキュメント全体で共通)
   - **行は奥から数える。行1 = 最上段(奥・来場者から遠い側)**、行6(MX)/行4(HE)= 最下段(手前・来場者側)。
   - **列は左から数える。列1 = 左端。**
   - 3D モデル上の y 座標との対応: 行1 = y 最大。MX は 行1 = y=47.65 〜 行6 = y=-47.60(**行1〜行4 = 高デッキ・上面 z=8.355、行5〜行6 = 低デッキ・上面 z=5.655**)、HE は 行1 = y=19 〜 行4 = y=-38(全行 z=8.36)。x 座標は 列1 が最小(MX: -57.15 / HE: 137)。

---

## 2. HE テスター(20 スイッチ)

20 穴(4 行 × 5 列)に HE スイッチ 20 個を実装済み。割り当てコード: **F13〜F24(12 個)+ KeyA〜KeyH(8 個)**。

### 2-1. 物理配置図(番号は割当コード)

```
        列1    列2    列3    列4    列5
行1(奥)  KeyD   KeyE   KeyF   KeyG   KeyH
行2      F23    F24    KeyA   KeyB   KeyC
行3      F18    F19    F20    F21    F22
行4(手前) F13   F14    F15    F16    F17
```

### 2-2. 対応表(位置・event.code・QMK キーコード・スイッチ)

| 位置 | event.code | QMK | スイッチ名 | 感触 |
|---|---|---|---|---|
| 行1列1 | KeyD | KC_D | WS Flux Deep Clacky | linear |
| 行1列2 | KeyE | KC_E | GravaStar UFO | linear |
| 行1列3 | KeyF | KC_F | Gateron Magnetic Jade Ultra | linear |
| 行1列4 | KeyG | KC_G | OUTEMU Red Sunset | linear |
| 行1列5 | KeyH | KC_H | MMD C1 | linear |
| 行2列1 | F23 | KC_F23 | UR Studio ICE Ultra | linear |
| 行2列2 | F24 | KC_F24 | UR Studio ICE Ultra PINK | linear |
| 行2列3 | KeyA | KC_A | UR Studio ICE Ultra BLUE | linear |
| 行2列4 | KeyB | KC_B | Everglide Siren V2 | linear |
| 行2列5 | KeyC | KC_C | WS Flux Pink Lotus | linear |
| 行3列1 | F18 | KC_F18 | PHYLINA ThunderFlash | linear |
| 行3列2 | F19 | KC_F19 | KeyTok NOVA | linear |
| 行3列3 | F20 | KC_F20 | Durock Rock HE | linear |
| 行3列4 | F21 | KC_F21 | GEON Raw HE 40g | linear |
| 行3列5 | F22 | KC_F22 | HUANO Omega | linear |
| 行4列1 | F13 | KC_F13 | TTC Uranus STANDARD | linear |
| 行4列2 | F14 | KC_F14 | TTC KOM | linear |
| 行4列3 | F15 | KC_F15 | Six Realms Silent (OFF Studio × TNT) | linear |
| 行4列4 | F16 | KC_F16 | XVX Whisper EC/HE 2-in-1 | tactile |
| 行4列5 | F17 | KC_F17 | Haimu Moonlight Silent | tactile |

---

## 3. MX テスター(48 穴)

48 穴(6 行 × 8 列)。**行1〜行4(奥 4 行)= MX スイッチ用(高デッキ・z=8.355)、行5〜行6(手前 2 行)= Choc ロープロファイルスイッチ用(低デッキ・z=5.655)** です。

- MX 基板の case_top は 2 段構造で、**行5〜行6 は高デッキより 2.7mm 低い低デッキ(上面 z=5.655)** にあり、choc ロープロファイルスイッチ(Choc V2 等)が載ります。行1〜行4 は高デッキ(上面 z=8.355)です。
- 全 48 位置に MX 32 個 + Choc 16 個を割り当て済み(2026-08-20 時点)。
- MX / Choc それぞれで「リニア → タクタイル → クリッキー」の順に並び、各感触グループ内では押下圧の軽い → 重い順(左 → 右)になるよう配置しています。

### 3-1. 物理配置図(番号は割当コード)

```
           列1          列2        列3        列4        列5       列6       列7        列8
行1(奥)    Numpad1      Numpad2    Numpad3    Numpad4    Numpad5   Numpad6   Numpad7    Numpad8
行2        BracketRight Backslash  Semicolon  Quote      Comma     Period    Slash      Backspace
行3        Digit7       Digit8     Digit9     Digit0     Backquote Minus     Equal      BracketLeft
行4        KeyY         KeyZ       Digit1     Digit2     Digit3    Digit4    Digit5     Digit6
行5        KeyQ         KeyR       KeyS       KeyT       KeyU      KeyV      KeyW       KeyX
行6(手前)  KeyI         KeyJ       KeyK       KeyL       KeyM      KeyN      KeyO       KeyP
※行5(y=-28.55)・行6(y=-47.6・最手前)= 低デッキの choc 専用行
```

### 3-2. 対応表(48 位置)

| 位置 | event.code | QMK | 割当スイッチ | 感触 |
|---|---|---|---|---|
| 行1列1 | Numpad1 | KC_KP_1 | Athena Linear 40g | linear |
| 行1列2 | Numpad2 | KC_KP_2 | Gateron KS-9 Silent 2.0 (White) | linear |
| 行1列3 | Numpad3 | KC_KP_3 | HC Studio HMX Xinhai Linear 37g | linear |
| 行1列4 | Numpad4 | KC_KP_4 | HMX LuLu Silent | linear |
| 行1列5 | Numpad5 | KC_KP_5 | Kailh Super Speed Silver (Linear) | linear |
| 行1列6 | Numpad6 | KC_KP_6 | TTC Frozen Silent V2 | linear |
| 行1列7 | Numpad7 | KC_KP_7 | Kailh Midnight Silent V2 Linear | linear |
| 行1列8 | Numpad8 | KC_KP_8 | Durock Silent Linear Dolphin | linear |
| 行2列1 | BracketRight | KC_RBRC | HMX Blackberry | linear |
| 行2列2 | Backslash | KC_BSLS | Gateron Mint Smoothie | linear |
| 行2列3 | Semicolon | KC_SCLN | HMX SnowCrash | linear |
| 行2列4 | Quote | KC_QUOT | Durock Ice King Linear | linear |
| 行2列5 | Comma | KC_COMM | Gateron Oil King (V2) | linear |
| 行2列6 | Period | KC_DOT | HMX Purple Dawn | linear |
| 行2列7 | Slash | KC_SLSH | Outemu Lemon V3 Silent Tactile | tactile |
| 行2列8 | Backspace | KC_BSPC | Kailh Super Speed Copper (Tactile) | tactile |
| 行3列1 | Digit7 | KC_7 | WingTree Puer Tea | tactile |
| 行3列2 | Digit8 | KC_8 | WingTree Golden Apple V2 | tactile |
| 行3列3 | Digit9 | KC_9 | Outemu Creamy Yellow | tactile |
| 行3列4 | Digit0 | KC_0 | WS BigLucky Tactile | tactile |
| 行3列5 | Backquote | KC_GRV | Gateron Mini i | tactile |
| 行3列6 | Minus | KC_MINS | Sillyworks × HMX Waverider V2 | tactile |
| 行3列7 | Equal | KC_EQL | Durock Full POK Mocha Tactile | tactile |
| 行3列8 | BracketLeft | KC_LBRC | Kailh Midnight Silent V2 Tactile | tactile |
| 行4列1 | KeyY | KC_Y | Durock Ice King Tactile | tactile |
| 行4列2 | KeyZ | KC_Z | Gateron Jupiter Banana | tactile |
| 行4列3 | Digit1 | KC_1 | Gateron Grape Smoothie | tactile |
| 行4列4 | Digit2 | KC_2 | Gateron Lanes | tactile |
| 行4列5 | Digit3 | KC_3 | Durock T1 Shrimp | tactile |
| 行4列6 | Digit4 | KC_4 | WS BigLucky Clicky | clicky |
| 行4列7 | Digit5 | KC_5 | Kailh Super Speed Bronze (Clicky) | clicky |
| 行4列8 | Digit6 | KC_6 | Gateron Harmonic | clicky |
| 行5列1 | KeyQ | KC_Q | **Kailh Choc V2 Silent Purple (Purple Iris)** | linear |
| 行5列2 | KeyR | KC_R | **Kailh Deep Sea Mini Pink Island** | linear |
| 行5列3 | KeyS | KC_S | **Kailh Saker Mini** | linear |
| 行5列4 | KeyT | KC_T | **Kailh Taro Ice Cream Mini Full-POM** | linear |
| 行5列5 | KeyU | KC_U | **Kailh Glacial Silver** | linear |
| 行5列6 | KeyV | KC_V | **Mist Switch(霧)** | linear |
| 行5列7 | KeyW | KC_W | **LOFREE Specter Low-profile POM** | linear |
| 行5列8 | KeyX | KC_X | **LOFREE Surfer Low-profile POM** | linear |
| 行6列1 | KeyI | KC_I | **LOFREE Hades Low-profile POM** | linear |
| 行6列2 | KeyJ | KC_J | **LOFREE Void Low-profile POM** | linear |
| 行6列3 | KeyK | KC_K | **Kailh Deep Sea Silent mini Islet** | linear |
| 行6列4 | KeyL | KC_L | **Kailh White Rain** | linear |
| 行6列5 | KeyM | KC_M | **Kailh Black Cloud** | tactile |
| 行6列6 | KeyN | KC_N | **Kailh Deep Sea Mini Whale** | tactile |
| 行6列7 | KeyO | KC_O | **Kailh White Owl Mini (Saker Clicky)** | clicky |
| 行6列8 | KeyP | KC_P | **Kailh ALL-POM HIDE MOUNTAIN** | clicky |

> 行5〜行6(太字)= Choc ロープロファイルスイッチ。低デッキ(z=5.655)に載せ、3D 上でも choc スタイル(低背ハウジング + 15mm 低背キャップ)で描画されます。
> 行1(奥)の Numpad1〜8 は、基本ルール 3 の「iPad キオスクで安全なキー」(F13〜F24 → 通常キー → それ以外)の続きとして追加定義した割当です。F1〜F12・修飾キー・矢印・Home/End/PageUp/PageDown・Esc・Tab・Space・Enter は引き続き使用しません。

### 3-3. 予備スイッチ(未配置)

調達状況・特徴重複の観点で今回採用を見送った 6 件です。差し替え時に `switches.json` / `keymap.json` / 本表を更新してください。

| form | id | 名称(略) | 力 | 感触 | 見送り理由 |
|---|---|---|---|---|---|
| MX | yushakobo-fairy-silent-linear | Fairy 静音リニア | 35g | linear | Midnight Silent V2 Linear 派生のため特徴重複 |
| MX | ws-light-tactile | Light Tactile | 45g | tactile | Gateron Mini i と実質同感触 |
| MX | durock-blue-lotus | Blue Lotus | 55g | tactile | T1 系が 3 連続になるため |
| MX | gateron-green-apple | Green Apple | 63g | tactile | 同ブランド重めタクタイルとニッチ重複 |
| Choc | kailh-spring-mini | Spring MINI | 40g | linear | Mist Switch に差し替えのため |
| Choc | lofree-ghost-low-profile-pom | Ghost | 50g | linear | Full POM 50g リニアで White Rain / Spring MINI と重複 |

---

## 4. ファームウェア設定例(QMK)

テスターは USB キーボードとして認識させ、各物理スイッチ位置に上表のキーコードを割り当てます。
VIA を使う場合は VIA の keymap 編集画面で**同じ QMK キーコード名**(`KC_F13` 等)を設定します。

### HE テスター(4 行 × 5 列)

```c
// 行1 = 奥(最上段)、行4 = 手前
const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {
  [0] = LAYOUT(
    KC_D,   KC_E,   KC_F,   KC_G,   KC_H,      // 行1(奥)
    KC_F23, KC_F24, KC_A,   KC_B,   KC_C,      // 行2
    KC_F18, KC_F19, KC_F20, KC_F21, KC_F22,    // 行3
    KC_F13, KC_F14, KC_F15, KC_F16, KC_F17     // 行4(手前)
  ),
};
```

### MX テスター(6 行 × 8 列)

```c
// 行1 = 奥(最上段)、行5〜行6 = 手前(最下段 2 行・低デッキ・choc 専用)
const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {
  [0] = LAYOUT(
    KC_KP_1,KC_KP_2,KC_KP_3,KC_KP_4,KC_KP_5,KC_KP_6,KC_KP_7,KC_KP_8,   // 行1(奥) MX
    KC_RBRC,KC_BSLS,KC_SCLN,KC_QUOT,KC_COMM,KC_DOT, KC_SLSH,KC_BSPC,   // 行2     MX
    KC_7,   KC_8,   KC_9,   KC_0,   KC_GRV, KC_MINS,KC_EQL, KC_LBRC,   // 行3     MX
    KC_Y,   KC_Z,   KC_1,   KC_2,   KC_3,   KC_4,   KC_5,   KC_6,      // 行4     MX
    KC_Q,   KC_R,   KC_S,   KC_T,   KC_U,   KC_V,   KC_W,   KC_X,      // 行5     Choc
    KC_I,   KC_J,   KC_K,   KC_L,   KC_M,   KC_N,   KC_O,   KC_P       // 行6(手前) Choc
  ),
};
```

> `LAYOUT` マクロの行順は QMK の matrix 定義に合わせて調整してください(上下反転の場合は 行1/行6 を入れ替え)。

---

## 5. 新しいスイッチを追加する手順

例: MX テスターの 行5列5(`KeyU`)に「Test Switch X」を追加する場合。

1. **スイッチ情報を `public/data/switches.json` に追加**
   配列の末尾に以下を追加します(`id` は半角英数字とハイフンで一意に)。
   ```json
   {
     "id": "test-switch-x",
     "name": "Test Switch X",
     "form": "mx",
     "feel": "linear",
     "force": "45g",
     "description": "説明文",
     "image": "images/switches/test-switch-x.jpg",
     "buyUrl": "https://example.com/test-switch-x",
     "manufacturer": "メーカー名",
     "price": "¥1,000(税込・35個入り)",
     "shopName": "ショップ名"
   }
   ```
   - `form` は `mx` | `choc` | `he`、`feel` は `linear` | `tactile` | `clicky`。
   - `force` は不明な場合は**省略または null** にできます(カードでは「操作荷重」行が非表示になります)。
   - `price` は**個数が分かる形式**(例: `¥1,000(税込・35個入り)` / `¥180(税込)/個`)で記載します。
   - 画像は `public/images/switches/` に配置し、`image` は `images/switches/<ファイル名>` の形式で指定します。
2. **商品画像を `public/images/switches/` に配置**
   `public/data/switches.json` の `image` フィールドとファイル名が一致していることを確認します。
3. **キーを `public/data/keymap.json` に登録**
   上表(3-2)から割り当てる位置の event.code を選び、1 行追加します。
   ```json
   {
     ...
     "KeyU": "test-switch-x"
   }
   ```
   - 1 つの code は 1 つのスイッチにだけ割り当てます(2 台のテスター間でも重複禁止)。
   - 行5〜行6(choc 行)に MX スイッチを、行1〜行4(MX 行)に choc スイッチを載せる場合は、ファームウェアと 3D 表示(デッキ高さ・キャップ形状)が実機と一致するよう配置表と `TesterStage.tsx` の分割定義を更新してください。
4. **ファームウェア側のキーコードを合わせる**
   物理的にその位置に配線されたキーが、上表の event.code(例 行5列5 → `KeyU` = `KC_U`)を送るように QMK / VIA で設定します。
5. **ビルドして確認**
   ```bash
   npm run build
   ```
   `switches.json` / `keymap.json` を更新したら GitHub へ push し、前日に iPad で開いてキャッシュしてください。

> 管理画面(`/#/admin`)からも「キーを押して紐づけ」で keymap.json に登録できます。その場合も、使うキーコードは本表の「未割当」位置のものを選んでください。

---

## 6. 補足: 3D 表示上のスイッチ位置について

展示ページの 3D ビューは、**本ドキュメントの物理配置表(2-2 / 3-2)と同じ位置**にキーキャップを配置します(実装: `TesterStage.tsx` の `MX_CODE_POS` / `HE_CODE_POS` と `mappedHolesFor`)。3D 上でキーキャップが沈む位置 = 実機の取付位置です。

- **form フィルタ**: 各基板は form でフィルタします。MX 基板には form=`mx` / `choc` のスイッチのみ、HE 基板には form=`he` のスイッチのみを配置します(現行データでは MX 基板に 48 個(MX 32 + Choc 16)、HE に 20 個)。他 form のスイッチが押されても該当基板では発光しません。
- **割り当て**: keymap の登録順に依らず、`event.code` → 穴インデックスの対応表(物理配線と同じ)で 1:1 に対応します。未登録のコードはどの穴にも配置されません。
- **MX の行5〜行6(y=-28.55..-47.6・低デッキ)= choc 専用行**: この 2 行のキャップは choc ロープロファイル(低いハウジング + 15mm 低背キャップ)で描画され、フランジ下面が低デッキ上面(z=5.655)に載ります。行1〜行4 は高デッキ(z=8.355)の MX スタイルです。
- **プレースホルダーキャップ**: スイッチが実装されていない穴には明るいグレーキャップを表示し、空の穴に見えないようにしています(実装済みスイッチは青のアクセント色)。現行は MX 基板の全 48 穴・HE の全 20 穴が実装済みのため、placeholder は表示されません。
- 押下されたキーに対応するキャップだけが沈み、発光します。押下は基板ごとに form フィルタ済みの割り当てに従います。

実機の物理配線・キー入力は本ドキュメントの表(2-2 / 3-2)に従ってください。

---

## 7. 現在の登録状況(2026-08-20)

- `switches.json`: **68 件** = MX 32 + Choc 16 + HE 20(sample 3 件は削除)
- `keymap.json`: **68 エントリ** = HE 20(F13〜F24 + KeyA〜KeyH)+ MX 32 + Choc 16(全 48 コード、重複なし)
- MX 基板の全 48 穴・HE の全 20 穴が一意に割り当て済み。
- 2026-08-20 更新: MX 基板を実測(ModelUpdate)に合わせた新ジオメトリへ統合 — 穴グリッド(xs = -57.15..76.20 / ys = 47.65..-47.60)、行5・行6 を Choc 低デッキ(z=5.655)に変更(従来は行6 のみ)。配置決定表(本ドキュメント 3 章に統合済み)に従い MX 32 + Choc 16 を全 48 位置に割り当て、`keymap.json` の code↔穴の物理対応(MX_CODE_POS)は不変。