import { FeelBadge, FormBadge } from './Badges'
import { QrCode } from './QrCode'
import { resolveAsset } from '../data/storage'
import type { SwitchInfo } from '../types'

export interface GachaCardProps {
  info: SwitchInfo
  phase: 'revealing' | 'showing' | 'exiting'
}

/** スペック行の定義(値が無いフィールドは行ごと非表示) */
const SPEC_ROWS: Array<{ label: string; value: (info: SwitchInfo) => string | null | undefined }> = [
  { label: '操作荷重', value: (i) => i.force },
  { label: 'プリトラベル', value: (i) => i.preTravel },
  { label: 'トータルトラベル', value: (i) => i.totalTravel },
  { label: 'スプリング', value: (i) => i.spring },
  { label: '素材', value: (i) => i.materials },
]

/** ガチャで出現するスイッチ詳細カード(ホログラム枠 + 出現/浮遊/退場アニメーション) */
export function GachaCard({ info, phase }: GachaCardProps) {
  const imgSrc = info.image ? resolveAsset(info.image) : resolveAsset('images/placeholder-switch.svg')
  const specRows = SPEC_ROWS.filter((row) => row.value(info))

  return (
    <div className={`gacha-card gacha-card--${phase}`} role="dialog" aria-label={`${info.name} のスイッチ情報`}>
      <div className="gacha-card-frame">
        <div className="gacha-card-media">
          <div className="gacha-card-media-inner">
            <img src={imgSrc} alt={info.name} draggable={false} />
            {info.shopName ? <p className="gacha-card-credit">画像: © {info.shopName}</p> : null}
          </div>
        </div>
        <div className="gacha-card-body">
          <div className="badge-row">
            <FormBadge form={info.form} />
            <FeelBadge feel={info.feel} />
          </div>

          <div className="gacha-card-head">
            <h1 className="gacha-card-title">{info.name}</h1>
            {info.manufacturer ? <p className="gacha-card-manufacturer">{info.manufacturer}</p> : null}
          </div>

          <p className="gacha-card-desc">{info.description || '説明文未設定'}</p>

          <div className="gacha-card-foot">
            {specRows.length > 0 && (
              <dl className="gacha-card-specs">
                {specRows.map((row) => (
                  <div className="gacha-card-spec-row" key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value(info)}</dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="gacha-card-qr">
              <QrCode value={info.buyUrl} size={132} />
              {info.price ? <p className="gacha-card-price">{info.price}</p> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
