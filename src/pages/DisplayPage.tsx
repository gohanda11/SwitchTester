import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { GachaCard } from '../components/GachaCard'
import { TesterStage } from '../components/TesterStage'
import { loadEffectiveData } from '../data/storage'
import { useKeyDown } from '../hooks/useKeyDown'
import type { FeelFilter, StageFilter, SwitchForm, SwitchInfo, TesterData } from '../types'

const DISPLAY_MS = 10_000
const REVEAL_MS = 1_050
/** 絞り込み条件変更・キー押下からフィルタを維持する時間(この間にキー押下がなければ全解除) */
const FILTER_IDLE_MS = 60_000

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
  const [filter, setFilter] = useState<StageFilter>({ feel: 'all', force: 'all' })
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

  /** keymap のエントリ順(key 押下→穴位置の割り当て順序) */
  const keymapCodes = useMemo(() => (data ? Object.keys(data.keymap) : []), [data])

  /** データに clicky スイッチが存在するか(存在する場合のみ UI にクリキーを出す) */
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
      setFilter({ feel: 'all', force: 'all' })
    }, FILTER_IDLE_MS)
  }, [clearFilterTimer])

  /** フィルタ条件変更(フィルタモード中のみタイマーを動かす) */
  const changeFilter = useCallback(
    (next: StageFilter) => {
      setFilter(next)
      if (next.feel !== 'all' || next.force !== 'all') resetFilterTimer()
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
                  {f === 'all' ? 'すべて' : f === 'linear' ? 'リニア' : f === 'tactile' ? 'タクタイル' : 'クリキー'}
                </button>
              ))}
            </div>
          </div>
          <div className="gacha-filter-row">
            <span className="gacha-filter-label">押下圧</span>
            <div className="gacha-filter-btns" role="group" aria-label="押下圧で絞り込み">
              {(
                [
                  ['all', 'すべて'],
                  ['lt35', '〜34g'],
                  ['35to39', '35〜39g'],
                  ['gte40', '40g〜'],
                ] as const
              ).map(([f, label]) => (
                <button
                  key={f}
                  type="button"
                  className={`gacha-filter-btn${filter.force === f ? ' is-active' : ''}`}
                  onClick={() => changeFilter({ ...filter, force: f })}
                >
                  {label}
                </button>
              ))}
            </div>
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
