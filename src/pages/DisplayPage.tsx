import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { GachaCard } from '../components/GachaCard'
import { TesterStage } from '../components/TesterStage'
import { loadEffectiveData } from '../data/storage'
import { useKeyDown } from '../hooks/useKeyDown'
import type { FeelFilter, SwitchForm, SwitchInfo, TesterData } from '../types'

const DISPLAY_MS = 10_000
const REVEAL_MS = 1_050
/** 絞り込み条件変更・キー押下からフィルタを維持する時間(この間にキー押下がなければ全解除) */
const FILTER_IDLE_MS = 60_000

/** 押下圧スライダーの既定範囲(データ読込前のプレースホルダ。読込後に forceBounds へ合わせる) */
const DEFAULT_FORCE_RANGE = { min: 25, max: 70 } as const

/** 押下圧の絞り込み範囲(g)。[min, max] に force が含まれるスイッチだけ該当 */
interface ForceRange {
  min: number
  max: number
}

/**
 * idle 絞り込み状態。feel は従来どおり、force は [min,max] の範囲指定。
 * force が forceBounds(=全範囲)と一致するときのみ「すべて」(絞り込みなし)扱い。
 * 押下圧をレンジバー化したのに伴い types.ts のボタン式 StageFilter/ForceFilter を
 * 廃止し、このファイルと TesterStage.tsx にローカル定義している(両者の形状は構造的に同一)。
 */
interface StageFilter {
  feel: FeelFilter
  force: ForceRange
  /** force の取り得る全範囲(データの force 最小〜最大を 5g 刻みに丸めた見やすい境界) */
  forceBounds: ForceRange
}

/** 操作荷重表示(例 "55g")をグラム数へ。不明(null/undefined)は null(TesterStage と同一実装) */
function parseForceGrams(force: string | null | undefined): number | null {
  if (force == null) return null
  const n = parseFloat(String(force).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : null
}

/** force 範囲が全範囲(=絞り込みなし)か */
function isForceFull(force: ForceRange, bounds: ForceRange): boolean {
  return force.min <= bounds.min && force.max >= bounds.max
}

type Phase = 'loading' | 'idle' | 'revealing' | 'showing' | 'exiting'

/** ガチャ発動時のキラキラ粒子(中心から放射状に飛ばす) */
const SPARKLES: CSSProperties[] = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2 + ((i * 37) % 7) * 0.13
  const dist = 110 + ((i * 53) % 150)
  return {
    left: `${50 + Math.cos(angle) * 10}%`,
    top: `${45 + Math.sin(angle) * 8}%`,
    '--tx': `${Math.cos(angle) * dist}px`,
    '--ty': `${Math.sin(angle) * dist * 0.75}px`,
    '--d': `${(i % 6) * 0.055}s`,
    '--c': i % 3 === 0 ? '#ffd27e' : i % 3 === 1 ? '#6ef0c4' : '#9fc2ff',
  } as CSSProperties
})

export function DisplayPage() {
  const [data, setData] = useState<TesterData | null>(null)
  const [source, setSource] = useState<'draft' | 'bundled'>('bundled')
  const [error, setError] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [active, setActive] = useState<SwitchInfo | null>(null)
  const [remainingMs, setRemainingMs] = useState(0)
  const [stageDisplay, setStageDisplay] = useState<SwitchForm | 'both'>('both')
  const [revealCount, setRevealCount] = useState(0)
  const [pressedCode, setPressedCode] = useState<string | null>(null)
  const [filter, setFilter] = useState<StageFilter>({
    feel: 'all',
    force: { ...DEFAULT_FORCE_RANGE },
    forceBounds: { ...DEFAULT_FORCE_RANGE },
  })
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const revealTimerRef = useRef<number | null>(null)
  const showTimerRef = useRef<number | null>(null)
  const exitTimerRef = useRef<number | null>(null)
  const filterTimerRef = useRef<number | null>(null)
  const endsAtRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    loadEffectiveData()
      .then(({ data: next, source: src }) => {
        if (cancelled) return
        setData(next)
        setSource(src)
        setPhase('idle')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '読み込みエラー')
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (event: MediaQueryListEvent) => setReducedMotion(event.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const byId = useMemo(() => {
    const map = new Map<string, SwitchInfo>()
    data?.switches.forEach((s) => map.set(s.id, s))
    return map
  }, [data])

  /**
   * 押下圧スライダーの全範囲: データの force 最小〜最大を 5g 刻みの見やすい境界に丸める。
   * (現行データは 27g〜67g → 25〜70g。force 不明のスイッチは除外)
   */
  const forceBounds = useMemo<ForceRange>(() => {
    let min = Infinity
    let max = -Infinity
    for (const s of data?.switches ?? []) {
      const g = parseForceGrams(s.force)
      if (g == null) continue
      if (g < min) min = g
      if (g > max) max = g
    }
    if (!Number.isFinite(min)) return { ...DEFAULT_FORCE_RANGE }
    return { min: Math.floor(min / 5) * 5, max: Math.ceil(max / 5) * 5 }
  }, [data])

  // データ読込後に既定範囲(全範囲)を実データへ合わせる。ユーザーが絞り込み中でも
  // forceBounds が変わった場合は force を新しい全範囲内にクランプする。
  useEffect(() => {
    setFilter((f) => {
      if (isForceFull(f.force, f.forceBounds)) {
        return { ...f, forceBounds, force: { ...forceBounds } }
      }
      const min = Math.max(f.force.min, forceBounds.min)
      const max = Math.min(f.force.max, forceBounds.max)
      // 範囲縮小でクランプが反転する(min > max)場合は全範囲へ戻す
      const force = min <= max ? { min, max } : { ...forceBounds }
      return { ...f, forceBounds, force }
    })
  }, [forceBounds])

  /** keymap のエントリ順(key 押下→穴位置の割り当て順序) */
  const keymapCodes = useMemo(() => (data ? Object.keys(data.keymap) : []), [data])

  /** データに clicky スイッチが存在するか(存在する場合のみ UI にクリッキーを出す) */
  const hasClicky = useMemo(() => data?.switches.some((s) => s.feel === 'clicky') ?? false, [data])

  /** 感触フィルタの選択肢(clicky がデータに無ければ出さない) */
  const feelOptions: readonly FeelFilter[] = hasClicky
    ? (['all', 'linear', 'tactile', 'clicky'] as const)
    : (['all', 'linear', 'tactile'] as const)

  const clearTimers = useCallback(() => {
    if (revealTimerRef.current != null) {
      window.clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
    if (showTimerRef.current != null) {
      window.clearInterval(showTimerRef.current)
      showTimerRef.current = null
    }
    if (exitTimerRef.current != null) {
      window.clearTimeout(exitTimerRef.current)
      exitTimerRef.current = null
    }
  }, [])

  const clearFilterTimer = useCallback(() => {
    if (filterTimerRef.current != null) {
      window.clearTimeout(filterTimerRef.current)
      filterTimerRef.current = null
    }
  }, [])

  /**
   * フィルタ維持タイマー: 発火で全解除(all/all)→回転再開。
   * 条件変更・キー押下のたびに呼び直す(1 分間キー押下がなければ解除)。
   */
  const resetFilterTimer = useCallback(() => {
    clearFilterTimer()
    filterTimerRef.current = window.setTimeout(() => {
      filterTimerRef.current = null
      // 全解除: 感触 all + 押下圧を全範囲へ戻す
      setFilter((f) => ({ ...f, feel: 'all', force: { ...f.forceBounds } }))
    }, FILTER_IDLE_MS)
  }, [clearFilterTimer])

  /** フィルタ条件変更(フィルタモード中のみタイマーを動かす) */
  const changeFilter = useCallback(
    (next: StageFilter) => {
      setFilter(next)
      if (next.feel !== 'all' || !isForceFull(next.force, next.forceBounds)) resetFilterTimer()
    },
    [resetFilterTimer],
  )

  /** idle へ復帰(表示中カードの縮小・フェードアウトは CSS 側の phase 切り替えで担う) */
  const goIdle = useCallback(() => {
    clearTimers()
    setPhase('idle')
    setActive(null)
    setPressedCode(null)
    setRemainingMs(0)
    setStageDisplay('both')
  }, [clearTimers])

  /**
   * キー押下 → ガチャ演出開始。
   * revealing/showing 中に別スイッチのキーが押された場合は、タイマーを破棄して
   * 1回目と同じ revealing シーケンス(フラッシュ/バースト/粒子/シェイク/pulseCount 加算)からやり直す。
   */
  const startReveal = useCallback(
    (code: string, info: SwitchInfo) => {
      clearTimers()
      setActive(info)
      setPressedCode(code)
      setStageDisplay(info.form)
      setPhase('revealing')
      setRevealCount((c) => c + 1)
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null
        setPhase('showing')
        endsAtRef.current = Date.now() + DISPLAY_MS
        setRemainingMs(DISPLAY_MS)
        showTimerRef.current = window.setInterval(() => {
          const left = Math.max(0, endsAtRef.current - Date.now())
          setRemainingMs(left)
          if (left <= 0) {
            clearTimers()
            setPhase('exiting')
            exitTimerRef.current = window.setTimeout(() => {
              exitTimerRef.current = null
              goIdle()
            }, 420)
          }
        }, 100)
      }, REVEAL_MS)
    },
    [clearTimers, goIdle],
  )

  useEffect(() => () => {
    clearTimers()
    clearFilterTimer()
  }, [clearTimers, clearFilterTimer])

  const onKey = useCallback(
    (code: string) => {
      if (!data) return
      // キー押下はフィルタ維持タイマーをリセット(1 分間押下がなければ全解除)
      resetFilterTimer()
      if (code === 'Escape') {
        goIdle()
        return
      }
      const switchId = data.keymap[code]
      if (!switchId) return
      const info = byId.get(switchId)
      if (!info) return
      // 同一キー連打は無視(カード・演出・残り秒数カウントダウンを継続)。
      // 別スイッチのキーは startReveal がフル演出からやり直す。
      if ((phase === 'revealing' || phase === 'showing') && pressedCode === code) return
      startReveal(code, info)
    },
    [byId, data, goIdle, phase, pressedCode, resetFilterTimer, startReveal],
  )

  useKeyDown(onKey, Boolean(data))

  /** 押下圧スライダー(最小側)の変更。最大値は超えないようクランプ */
  const onForceMinChange = (e: ChangeEvent<HTMLInputElement>) => {
    const min = Math.min(Number(e.target.value), filter.force.max)
    changeFilter({ ...filter, force: { ...filter.force, min } })
  }

  /** 押下圧スライダー(最大側)の変更。最小値未満にはならないようクランプ */
  const onForceMaxChange = (e: ChangeEvent<HTMLInputElement>) => {
    const max = Math.max(Number(e.target.value), filter.force.min)
    changeFilter({ ...filter, force: { ...filter.force, max } })
  }

  if (error) {
    return (
      <main className="kiosk kiosk-center">
        <p className="error">{error}</p>
        <Link to="/admin">管理画面へ</Link>
      </main>
    )
  }

  if (!data || phase === 'loading') {
    return (
      <main className="kiosk kiosk-center">
        <p className="muted">読み込み中…</p>
      </main>
    )
  }

  const progress = remainingMs / DISPLAY_MS
  const secondsLeft = Math.ceil(remainingMs / 1000)

  /** 押下圧スライダー表示用のパーセント(塗り範囲)とラベル */
  const forceSpan = Math.max(1, filter.forceBounds.max - filter.forceBounds.min)
  const forceMinPct = ((filter.force.min - filter.forceBounds.min) / forceSpan) * 100
  const forceMaxPct = ((filter.force.max - filter.forceBounds.min) / forceSpan) * 100
  const forceText = isForceFull(filter.force, filter.forceBounds)
    ? 'すべて'
    : `${filter.force.min}〜${filter.force.max}g`

  /** WebGL 非対応 / GLB 読込失敗時の 2D 待機画面 */
  const fallbackHome = (
    <div className="gacha-fallback kiosk-home">
      <div className="home-card">
        <p className="eyebrow">Mechanical Switch Tester</p>
        <h1>
          スイッチを
          <br />
          押してください
        </h1>
        <div className="home-pulse" aria-hidden>
          <span className="home-pulse-ring" />
          <span className="home-pulse-core">⬇</span>
        </div>
        <p className="home-sub">押したスイッチの情報・写真・購入QRを表示します</p>
        <p className="home-hint">表示は 10 秒でホームに戻ります</p>
      </div>
    </div>
  )

  return (
    <main className={`kiosk kiosk-gacha kiosk-gacha--${phase}`}>
      <TesterStage
        display={stageDisplay}
        keymapCodes={keymapCodes}
        pressedCode={pressedCode}
        pulseCount={revealCount}
        reducedMotion={reducedMotion}
        fallback={fallbackHome}
        filter={filter}
      />

      {phase === 'idle' && (
        <div className="gacha-idle-overlay">
          <div className="gacha-prompt">
            <p className="eyebrow">Mechanical Switch Tester</p>
            <h1>
              スイッチを
              <br />
              押してください
            </h1>
            <p className="home-sub">押したスイッチの情報・写真・購入QRを表示します</p>
            <p className="home-hint">表示は 10 秒でホームに戻ります</p>
          </div>
        </div>
      )}

      {phase === 'idle' && (
        <div className="gacha-filter">
          <div className="gacha-filter-row">
            <span className="gacha-filter-label">感触</span>
            <div className="gacha-filter-btns" role="group" aria-label="感触で絞り込み">
              {feelOptions.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`gacha-filter-btn${filter.feel === f ? ' is-active' : ''}`}
                  onClick={() => changeFilter({ ...filter, feel: f })}
                >
                  {f === 'all' ? 'すべて' : f === 'linear' ? 'リニア' : f === 'tactile' ? 'タクタイル' : 'クリッキー'}
                </button>
              ))}
            </div>
          </div>
          <div className="gacha-filter-row">
            <span className="gacha-filter-label">押下圧</span>
            <div className="gacha-force-range">
              <div className="gacha-range-track" aria-hidden="true">
                <div
                  className="gacha-range-fill"
                  style={{
                    left: `${forceMinPct}%`,
                    right: `${100 - forceMaxPct}%`,
                  }}
                />
              </div>
              <input
                type="range"
                className="gacha-range-input gacha-range-input--min"
                min={filter.forceBounds.min}
                max={filter.forceBounds.max}
                step={1}
                value={filter.force.min}
                aria-label="押下圧の最小値"
                onChange={onForceMinChange}
              />
              <input
                type="range"
                className="gacha-range-input gacha-range-input--max"
                min={filter.forceBounds.min}
                max={filter.forceBounds.max}
                step={1}
                value={filter.force.max}
                aria-label="押下圧の最大値"
                onChange={onForceMaxChange}
              />
            </div>
            <span className="gacha-range-value" aria-live="polite">
              {forceText}
            </span>
          </div>
        </div>
      )}

      {phase !== 'idle' && active && (
        <div className="reveal-layer" key={revealCount}>
          {phase === 'revealing' && !reducedMotion && (
            <>
              <div className="reveal-flash" aria-hidden />
              <div className="reveal-burst" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              {SPARKLES.map((style, i) => (
                <span key={i} className="sparkle" style={style} aria-hidden />
              ))}
            </>
          )}
          <GachaCard info={active} phase={phase} />
        </div>
      )}

      {phase === 'showing' && (
        <div className="gacha-progress" aria-hidden>
          <div className="progress-track">
            <div className="progress-bar" style={{ transform: `scaleX(${progress})` }} />
          </div>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {phase === 'showing' && active ? `${active.name} を表示中。残り ${secondsLeft} 秒` : ''}
      </p>

      <div className="home-footer">
        <span className="source-tag">data: {source}</span>
        <Link className="admin-link" to="/admin">
          管理画面
        </Link>
      </div>
    </main>
  )
}
