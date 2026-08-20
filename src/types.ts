export type SwitchForm = 'mx' | 'choc' | 'he'
export type SwitchFeel = 'linear' | 'tactile' | 'clicky'

/** idle 絞り込み: 感触フィルタ('all' = 指定なし) */
export type FeelFilter = 'all' | SwitchFeel

export interface SwitchInfo {
  id: string
  name: string
  form: SwitchForm
  feel: SwitchFeel
  /** 操作荷重表示(例 "55g"。不明な場合は null または未定義) */
  force?: string | null
  description: string
  image: string
  buyUrl: string
  /** メーカー名(例 "Gateron") */
  manufacturer?: string
  /** 価格表示(例 "¥1,210(税込)") */
  price?: string
  /** スプリング荷重(例 "初期45g/終了60g") */
  spring?: string
  /** プリトラベル(例 "1.2mm") */
  preTravel?: string
  /** トータルトラベル(例 "3.4mm") */
  totalTravel?: string
  /** 主要素材(例 "ステムPOM/ハウジングPC") */
  materials?: string
  /** 画像クレジット表記用ショップ名(例 "遊舎工房") */
  shopName?: string
}

export type Keymap = Record<string, string>

export interface TesterData {
  switches: SwitchInfo[]
  keymap: Keymap
}

export const FORM_LABELS: Record<SwitchForm, string> = {
  mx: 'MX',
  choc: 'Choc',
  he: 'HE',
}

export const FEEL_LABELS: Record<SwitchFeel, string> = {
  linear: 'Linear',
  tactile: 'Tactile',
  clicky: 'Clicky',
}
