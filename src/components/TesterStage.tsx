import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, useGLTF } from '@react-three/drei'
import { MeshoptDecoder } from 'meshoptimizer/decoder'
import * as THREE from 'three'
import { RoundedBoxGeometry, type GLTFLoader } from 'three-stdlib'
import { loadEffectiveData, resolveAsset } from '../data/storage'
import type { StageFilter, SwitchForm, SwitchInfo } from '../types'

const MODEL_MX = resolveAsset('models/tester_mx.glb')
const MODEL_HE = resolveAsset('models/tester_he.glb')

/** モデルの最大寸法をこの大きさに正規化する */
const TARGET_SIZE = 2.45

/**
 * ボード直上ラベル(メカニカル / 磁気)の表示オフセット(ボード基準のローカル座標)。
 * y が上方向、z はカメラから遠ざかる向き(見下ろし表示でラベルが手前の基板に隠れず上に見える)。
 */
const BOARD_LABEL_OFFSET: [number, number, number] = [0, 1.0, -0.35]

/**
 * GLTFLoader に meshoptimizer デコーダを配線する(wasm はパッケージ内蔵、CDN 不使用)。
 * drei 既定の Draco CDN 読込を無効化するため useGLTF は (path, false, false, extendLoader) で呼ぶ。
 */
const extendLoader = (loader: GLTFLoader) => {
  loader.setMeshoptDecoder(MeshoptDecoder)
}

// 両モデルを起動時にプリロード(useLoader キャッシュは loader 種別 + パスで共有される)
useGLTF.preload(MODEL_MX, false, false, extendLoader)
useGLTF.preload(MODEL_HE, false, false, extendLoader)

/** キースイッチ押下アニメーションの時間配分(秒) */
const PRESS_DOWN_S = 0.09
const PRESS_HOLD_S = 0.06
const PRESS_UP_S = 0.3

/** 基板上面(mm。ModelPipeline の幾何解析: MX 高デッキ = z=8.355、MX 低デッキ(choc 行5〜6) = z=5.655、HE = z=8.36) */
const HE_TOP_Z = 8.36
/** MX 高デッキ(行1〜行4, y=47.65..-9.5)の上面(mm) */
const MX_TOP_Z = 8.355
/** MX 低デッキ(choc 行5〜行6, y=-28.55/-47.6)の上面(mm)。高デッキより 2.7mm 低い */
const CHOC_TOP_Z = 5.655

/**
 * スイッチ取付穴グリッド(mm, モデル空間・Z+ 上向き)。
 * case_top 上面ジオメトリの実測(0.5mm 解像度で穴中心を検出)。
 * 行は奥(来場者から遠い側)から数える(行1 = 一番奥)。列は x 昇順 = 左端から右端。
 * - mx: 6 行 × 8 列 = 48 穴。行1〜行4(y=47.65..-9.5)= 高デッキ(z=8.355)の MX 行、
 *   行5〜行6(y=-28.55..-47.6)= 低デッキ(z=5.655)の choc 専用行(手前 2 行)。
 * - he: 4 行 × 5 列 = 20 穴(全行 z=8.36)。
 * 配列は行1(奥)→手前の順(ys 降順)。zs は行ごとの基板上面(デッキ)の z。
 */
const HOLE_GRIDS: Record<Exclude<SwitchForm, 'choc'>, { xs: number[]; ys: number[]; zs: number[] }> = {
  mx: {
    xs: [-57.15, -38.10, -19.05, 0, 19.05, 38.10, 57.15, 76.20],
    ys: [47.65, 28.60, 9.55, -9.50, -28.55, -47.60],
    zs: [MX_TOP_Z, MX_TOP_Z, MX_TOP_Z, MX_TOP_Z, CHOC_TOP_Z, CHOC_TOP_Z],
  },
  he: { xs: [137, 156, 175, 194, 213], ys: [19, 0, -19, -38], zs: [HE_TOP_Z, HE_TOP_Z, HE_TOP_Z, HE_TOP_Z] },
}

/** スイッチ外観のスタイル(寸法は mm。ハウジングのフランジ下面が基板上面に載る) */
interface KeyStyle {
  /** ハウジング: [幅, 奥行き, 高さ](mm) */
  housing: [number, number, number]
  /** キーキャップ: 底面幅(mm)・高さ(mm)・上面縮小率 */
  capW: number
  capH: number
  capTopRatio: number
  /** 押下でキャップが沈む量(mm) */
  pressDepth: number
}

const KEY_STYLES: Record<SwitchForm, KeyStyle> = {
  mx: { housing: [15.6, 15.6, 6.0], capW: 18, capH: 10, capTopRatio: 0.72, pressDepth: 2.4 },
  // choc も mx 基板を使用(choc 用に低背・小サイズのキャップ)
  choc: { housing: [14, 14, 4.5], capW: 15, capH: 6.5, capTopRatio: 0.74, pressDepth: 1.6 },
  he: { housing: [15.6, 15.6, 6.0], capW: 18, capH: 10, capTopRatio: 0.72, pressDepth: 2.4 },
}

/**
 * 穴の中心座標列(行(y)優先の row-major 順: 行1=奥 → 手前、各行は列1=左端 から)。
 * z はその行が属するデッキの上面高さ(mm)。行ごとの z を持つことで、
 * 低デッキ(choc 行)と高デッキ(MX 行)でキャップの載る高さを変える。
 */
function holeCenters(form: SwitchForm): [number, number, number][] {
  const grid = HOLE_GRIDS[form === 'choc' ? 'mx' : form]
  const centers: [number, number, number][] = []
  grid.ys.forEach((y, yi) => {
    const z = grid.zs[yi] ?? HE_TOP_Z
    for (const x of grid.xs) centers.push([x, y, z])
  })
  return centers
}

/**
 * event.code → 穴インデックス(グローバル)の対応表。
 * docs/KEY_ASSIGNMENT.md の物理配置表(2-2: HE / 3-2: MX)に基づく。
 * 物理配線(実機)と同じ位置を 3D 上でも使うため、keymap の登録順に依らず
 * この表で 1:1 に対応させる。穴インデックス = 行優先(row-major)の番号。
 *
 * MX(48 穴): 行1 = Numpad1-8(0-7, y=47.65・最上段・奥),
 * 行2 = BracketRight,Backslash,Semicolon,Quote,Comma,Period,Slash,Backspace(8-15),
 * 行3 = Digit7-0,Backquote,Minus,Equal,BracketLeft(16-23),
 * 行4 = KeyY,KeyZ,Digit1-6(24-31),
 * 行5 = KeyQ..KeyX(32-39, y=-28.55・低デッキの choc 行),
 * 行6 = KeyI..KeyP(40-47, y=-47.6・低デッキの choc 行・手前)。
 * Numpad は iPadOS の F1〜F12/修飾/矢印/
 * Esc/Tab/Space と衝突しないため追加割当に使用する(KEY_ASSIGNMENT.md 基本ルール準拠)。
 */
const MX_CODE_POS: Record<string, number> = {
  Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad7: 6, Numpad8: 7,
  BracketRight: 8, Backslash: 9, Semicolon: 10, Quote: 11, Comma: 12, Period: 13, Slash: 14, Backspace: 15,
  Digit7: 16, Digit8: 17, Digit9: 18, Digit0: 19, Backquote: 20, Minus: 21, Equal: 22, BracketLeft: 23,
  KeyY: 24, KeyZ: 25, Digit1: 26, Digit2: 27, Digit3: 28, Digit4: 29, Digit5: 30, Digit6: 31,
  KeyQ: 32, KeyR: 33, KeyS: 34, KeyT: 35, KeyU: 36, KeyV: 37, KeyW: 38, KeyX: 39,
  KeyI: 40, KeyJ: 41, KeyK: 42, KeyL: 43, KeyM: 44, KeyN: 45, KeyO: 46, KeyP: 47,
}

/** HE(20 穴): 行1 = KeyD..KeyH(0-4, y=19・奥), 行2 = F23,F24,KeyA..KeyC(5-9), 行3 = F18..F22(10-14), 行4 = F13..F17(15-19, y=-38・手前) */
const HE_CODE_POS: Record<string, number> = {
  KeyD: 0, KeyE: 1, KeyF: 2, KeyG: 3, KeyH: 4,
  F23: 5, F24: 6, KeyA: 7, KeyB: 8, KeyC: 9,
  F18: 10, F19: 11, F20: 12, F21: 13, F22: 14,
  F13: 15, F14: 16, F15: 17, F16: 18, F17: 19,
}

/**
 * マッピング済みキー→穴位置の割り当て。
 * - 基板ごとに form でフィルタする: MX 基板は mx/choc キーのみ、HE 基板は he キーのみ。
 *   (form 不明のキーは基板の主 form として扱う: データ読込前の初期描画のため)
 * - 穴は docs/KEY_ASSIGNMENT.md の物理配置表と同じ位置(code → 穴インデックス)に 1:1 で割り当てる。
 * - フィルタに該当しないキーは -1(どの穴にも割り当てない)。
 * 変更時はこの関数と MX_CODE_POS / HE_CODE_POS を直せばよい。
 */
function mappedHolesFor(
  form: SwitchForm,
  keymapCodes: string[],
  formOf: (code: string) => SwitchForm | undefined,
): number[] {
  const isMxBoard = form === 'mx' || form === 'choc'
  const posTable = isMxBoard ? MX_CODE_POS : HE_CODE_POS
  return keymapCodes.map((code) => {
    const f = formOf(code)
    if (isMxBoard) {
      // MX 基板: he スイッチは載せない(mx/choc のみ。不明時は mx 扱い)
      if (f === 'he') return -1
    } else {
      // HE 基板: he スイッチのみ(不明時は he 扱い)
      if (f !== undefined && f !== 'he') return -1
    }
    return posTable[code] ?? -1
  })
}

const easeOutQuad = (k: number) => k * (2 - k)
const easeOutCubic = (k: number) => 1 - (1 - k) ** 3

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** GLB 読込失敗・WebGL コンテキスト生成失敗を捕捉して 2D レイアウトへフォールバックする */
class StageErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[TesterStage] 3D 表示をフォールバックしました:', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/**
 * カメラ位置。通常(回転展示)は従来どおりのアングル、
 * トップダウン時(フィルタモード中・縦長 'both' の固定表示)はグリッドの行構成が
 * ひと目で分かる見下ろし気味(仰角 35〜45°)のアングルへ、モデル回転と同じ damp
 * 係数でスムーズに遷移する。通常の回転展示中はカメラを動かさない。
 */
function CameraRig({
  display,
  aspect,
  topDown,
  reducedMotion,
}: {
  display: SwitchForm | 'both'
  aspect: number
  /** 見下ろし表示にするか(フィルタモード中、または縦長 'both' の固定表示) */
  topDown: boolean
  /** prefers-reduced-motion: カメラ遷移をアニメーションせず目標へ即時スナップする */
  reducedMotion: boolean
}) {
  const camera = useThree((state) => state.camera)
  /** 現在地から damp で追従する目標値(表示モード切替で更新される) */
  const target = useMemo(() => {
    if (display === 'both') {
      const portrait = aspect < 1
      if (topDown) {
        // 2 台並列を見下ろす: 両基板の全行が画面に収まるよう少し引き気味 + 高く
        return portrait
          ? { pos: new THREE.Vector3(0, 5.9, 6.4), look: new THREE.Vector3(0, 0.5, 0) }
          : { pos: new THREE.Vector3(0, 4.64, 5.0), look: new THREE.Vector3(0, 0.45, 0) }
      }
      return portrait
        ? { pos: new THREE.Vector3(0, 2.3, 8.0), look: new THREE.Vector3(0, 0.5, 0) }
        : { pos: new THREE.Vector3(0, 2.1, 6.3), look: new THREE.Vector3(0, 0.45, 0) }
    }
    return topDown
      ? { pos: new THREE.Vector3(0, 4.3, 4.4), look: new THREE.Vector3(0, 0.45, 0) }
      : { pos: new THREE.Vector3(0, 2.0, 5.6), look: new THREE.Vector3(0, 0.45, 0) }
  }, [display, aspect, topDown])

  const posRef = useRef(new THREE.Vector3(0, 2.0, 5.6))
  const lookRef = useRef(new THREE.Vector3(0, 0.45, 0))

  useFrame((_, delta) => {
    if (reducedMotion) {
      // prefers-reduced-motion: 遷移アニメーションなしで目標位置へ即時スナップ
      // (KeyCluster の明滅・回転停止と同様、動きのある演出をすべて止める)
      posRef.current.copy(target.pos)
      lookRef.current.copy(target.look)
    } else {
      // モデル回転の damp(3.4)と揃え、トップダウン切替時に瞬間移動せずなめらかに追従する
      const k = 1 - Math.exp(-3.4 * delta)
      posRef.current.lerp(target.pos, k)
      lookRef.current.lerp(target.look, k)
    }
    camera.position.copy(posRef.current)
    camera.lookAt(lookRef.current)
  })
  return null
}

/** モデル直下のポディウム(台座 + 発光リング + グロー)。scale で全体を拡縮できる */
function Podium({
  reducedMotion,
  scale = 1,
  haloScale = 1,
}: {
  reducedMotion: boolean
  scale?: number
  /** ハロー(外周グロー)のみの追加縮小率。'both' 表示で 2 台のグローが中央で重ならないようにする */
  haloScale?: number
}) {
  const ringRef = useRef<THREE.Mesh>(null)
  const haloRef = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    if (reducedMotion) return
    const t = state.clock.elapsedTime
    const ring = ringRef.current
    if (ring) {
      ring.scale.setScalar(1 + Math.sin(t * 2.2) * 0.05)
      ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 2.2) * 0.2
    }
    const halo = haloRef.current
    if (halo) {
      halo.scale.setScalar(1 + Math.sin(t * 1.4 + 1) * 0.06)
    }
  })

  return (
    <group scale={scale}>
      {/* 台座: 上面(y=0)が基板下面に一致。基板より十分大きいステージ */}
      <mesh position={[0, -0.05, 0]}>
        <cylinderGeometry args={[1.8, 2.0, 0.1, 64]} />
        <meshStandardMaterial
          color="#16223a"
          metalness={0.7}
          roughness={0.38}
          emissive="#1d3566"
          emissiveIntensity={0.7}
        />
      </mesh>
      {/* コンタクトシャドウ(ポディウム上面・基板直下のすぐ下に描画) */}
      <mesh position={[0, -0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.38, 64]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} position={[0, -0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.5, 1.68, 64]} />
        <meshBasicMaterial
          color="#4f8cff"
          transparent
          opacity={0.65}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={haloRef} position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[2.35 * haloScale, 64]} />
        <meshBasicMaterial
          color="#2f7fff"
          transparent
          opacity={0.14}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/** 押下アニメーションの位相 */
type PressPhase = 'down' | 'hold' | 'up'

/** 未実装(placeholder)キャップの色: 暗すぎると空の穴に見えるため、明るいライトスレート系にする */
const CAP_UNMAPPED = '#c6d1e4'
const CAP_UNMAPPED_DECK = '#d6dfee'

/**
 * 絞り込みフィルタ時のキャップ色。
 * 該当 = 赤系(#ff5566)の発光色(useFrame で正弦波明滅。prefers-reduced-motion 時は静的発光)。
 * 非該当 = unmapped placeholder(#c6d1e4)よりさらに暗いスレート(マップ済み非該当も含めて暗転)。
 */
const CAP_FILTER_MATCH = '#ff5566'
const CAP_FILTER_MATCH_DECK = '#ff8f9b'
const CAP_FILTER_DIM = '#39445e'
const CAP_FILTER_DIM_DECK = '#45516f'

/** フィルタモード時の固定アングル(rad)。正面からやや斜めの展示向き */
const FILTER_FIXED_ANGLE = 0.12

/** 操作荷重表示(例 "55g")をグラム数へ。不明(null/undefined)は null */
function parseForceGrams(force: string | null | undefined): number | null {
  if (force == null) return null
  const n = parseFloat(String(force).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * 1 スタイル分のキースイッチ + キーキャップ群。
 * `holes`(グローバル穴インデックス)で指定された穴にハウジング/ステム/キャップを
 * InstancedMesh で並べ、押されたキーに対応するキャップだけ沈んで発光する。
 * MX 基板は choc 行と mx 行でスタイルが異なるため、TesterKey が 2 クラスタに分けて呼ぶ。
 */
function KeyCluster({
  style,
  centers,
  holes,
  mappedHoles,
  pressedHole,
  pulseCount,
  reducedMotion,
  filterActive,
  matchedHoles,
}: {
  style: KeyStyle
  /** 全穴の中心座標列(グローバル穴インデックス順)。z は行ごとのデッキ上面高さ */
  centers: [number, number, number][]
  /** このクラスタが描画する穴のグローバルインデックス */
  holes: number[]
  /** アクセント色(実装済みスイッチ)にする穴のグローバルインデックス */
  mappedHoles: Set<number>
  /** 現在押下中の穴(グローバル)。このクラスタに属さない場合は -1 */
  pressedHole: number
  pulseCount: number
  reducedMotion: boolean
  /** フィルタモード中か(キャップ色を該当/非該当で上書きし、回転も停止する) */
  filterActive: boolean
  /** フィルタに該当する穴のグローバルインデックス(フィルタ非アクティブ時は null) */
  matchedHoles: Set<number> | null
}) {
  /**
   * 穴ごとのベース色(押下発光中は白系に上書きされ、押下終了でここへ戻る)。
   * 優先順位: 押下中の発光(useFrame 内) > フィルタ該当/非該当 > 通常のアクセント/unmapped。
   */
  const colorFor = useCallback(
    (hole: number): { body: string; deck: string } => {
      if (filterActive) {
        const matched = matchedHoles != null && matchedHoles.has(hole)
        return matched
          ? { body: CAP_FILTER_MATCH, deck: CAP_FILTER_MATCH_DECK }
          : { body: CAP_FILTER_DIM, deck: CAP_FILTER_DIM_DECK }
      }
      return mappedHoles.has(hole)
        ? { body: '#5b9dff', deck: '#8ab4ff' }
        : { body: CAP_UNMAPPED, deck: CAP_UNMAPPED_DECK }
    },
    [filterActive, matchedHoles, mappedHoles],
  )
  const housingRef = useRef<THREE.InstancedMesh>(null)
  const stemARef = useRef<THREE.InstancedMesh>(null)
  const stemBRef = useRef<THREE.InstancedMesh>(null)
  const capBodyRef = useRef<THREE.InstancedMesh>(null)
  const capDeckRef = useRef<THREE.InstancedMesh>(null)
  const glowRef = useRef<THREE.PointLight>(null)
  const pressRef = useRef<{ start: number; hole: number; phase: PressPhase } | null>(null)
  const clock = useThree((state) => state.clock)
  /**
   * インスタンス初期化の確実化フラグ。
   * - initedMeshRef: 最後に配置を書き込んだ InstancedMesh(R3F が args 変更で
   *   メッシュを再構築するとオブジェクトが差し替わるため、参照不一致で検出する)。
   * - initDirtyRef: 初期化未完(初回 or effect が飛ばされたレース)。useFrame 側で
   *   描画より先に再初期化し、キャップ欠落を防ぐ。
   */
  const initedMeshRef = useRef<THREE.InstancedMesh | null>(null)
  const initDirtyRef = useRef(true)
  /** グローバル穴インデックス → クラスタ内ローカルインデックス(明滅の毎フレーム検索用) */
  const localIndex = useMemo(() => new Map(holes.map((h, i) => [h, i])), [holes])
  /** フィルタ該当キャップの明滅ベース色(フィルタ有効時のみ保持。毎フレームの確保を避ける) */
  const matchBaseRef = useRef<{ body: THREE.Color; deck: THREE.Color } | null>(null)
  /** 明滅で色をスケールするためのスクラッチ */
  const blinkScratchRef = useRef(new THREE.Color())

  const geos = useMemo(() => {
    const [hw, hd, hh] = style.housing
    const bodyH = style.capH * 0.78
    const deckH = style.capH * 0.22
    const deckW = style.capW * style.capTopRatio
    return {
      housing: new RoundedBoxGeometry(hw, hd, hh, 4, 1.0),
      stemA: new THREE.BoxGeometry(1.6, 4.4, 2.4),
      stemB: new THREE.BoxGeometry(4.4, 1.6, 2.4),
      capBody: new RoundedBoxGeometry(style.capW, style.capW, bodyH, 5, Math.min(2, style.capW * 0.09)),
      capDeck: new RoundedBoxGeometry(deckW, deckW, deckH, 5, Math.min(0.9, deckW * 0.07)),
    }
  }, [style])

  const materials = useMemo(
    () => ({
      housing: new THREE.MeshPhysicalMaterial({
        // 不透明化: 半透明(opacity 0.45)だとキャップと同化して手前の行が
        // 「空の穴」に見えるため不透明にし、さらに placeholder キャップ色
        // (#c6d1e4 明るいブルーグレー)と同化しないよう濃い色にする
        color: '#5f7ea6',
        roughness: 0.2,
        metalness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0.25,
      }),
      stem: new THREE.MeshStandardMaterial({ color: '#9fb4d8', roughness: 0.4 }),
      capBody: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.32, metalness: 0.12 }),
      capDeck: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.28, metalness: 0.1 }),
    }),
    [],
  )

  // アンマウント時に geometry / material を破棄
  useEffect(() => {
    const all = [geos.housing, geos.stemA, geos.stemB, geos.capBody, geos.capDeck]
    const mats = Object.values(materials)
    return () => {
      all.forEach((g) => g.dispose())
      mats.forEach((m) => m.dispose())
    }
  }, [geos, materials])

  // フィルタ有効時、該当キャップの明滅ベース色(赤)を保持する(useFrame の明滅で使用)
  useEffect(() => {
    matchBaseRef.current =
      filterActive && matchedHoles != null && matchedHoles.size > 0
        ? { body: new THREE.Color(CAP_FILTER_MATCH), deck: new THREE.Color(CAP_FILTER_MATCH_DECK) }
        : null
  }, [filterActive, matchedHoles])

  /**
   * 全インスタンスの配置(マトリクス)と色を現在の穴割当に合わせて書き込む。
   * useLayoutEffect(ペイント前の同期実行)と useFrame(毎フレームのガード)の
   * 両方から呼ばれ、R3F の InstancedMesh 再構築や effect 消失レースがあっても
   * instanceMatrix / instanceColor が未設定のまま描画されることを防ぐ。
   */
  const writeInstances = useCallback(() => {
    const housing = housingRef.current
    const stemA = stemARef.current
    const stemB = stemBRef.current
    const capBody = capBodyRef.current
    const capDeck = capDeckRef.current
    if (!housing || !stemA || !stemB || !capBody || !capDeck) {
      // メッシュ未生成(稀なレース): 次のフレームで再試行する
      initDirtyRef.current = true
      return
    }
    initDirtyRef.current = false
    initedMeshRef.current = housing

    const [, , hh] = style.housing
    const bodyH = style.capH * 0.78
    const deckH = style.capH * 0.22
    const stemZ = hh + 0.2 + 1.2
    const bodyZ = hh + 0.2 + 2.6 + bodyH / 2
    const deckZ = hh + 0.2 + 2.6 + bodyH + deckH / 2
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()

    holes.forEach((hole, i) => {
      const [hx, hy, hz] = centers[hole]
      const base = colorFor(hole)
      matrix.makeTranslation(hx, hy, hz + hh / 2)
      housing.setMatrixAt(i, matrix)
      matrix.makeTranslation(hx, hy, hz + stemZ)
      stemA.setMatrixAt(i, matrix)
      stemB.setMatrixAt(i, matrix)
      matrix.makeTranslation(hx, hy, hz + bodyZ)
      capBody.setMatrixAt(i, matrix)
      matrix.makeTranslation(hx, hy, hz + deckZ)
      capDeck.setMatrixAt(i, matrix)
      color.set(base.body)
      capBody.setColorAt(i, color)
      color.set(base.deck)
      capDeck.setColorAt(i, color)
    })
    housing.instanceMatrix.needsUpdate = true
    stemA.instanceMatrix.needsUpdate = true
    stemB.instanceMatrix.needsUpdate = true
    capBody.instanceMatrix.needsUpdate = true
    capDeck.instanceMatrix.needsUpdate = true
    if (capBody.instanceColor) capBody.instanceColor.needsUpdate = true
    if (capDeck.instanceColor) capDeck.instanceColor.needsUpdate = true
  }, [holes, centers, style, colorFor])

  // 穴割当・表示内容の再構築時は、ペイント前に配置を同期する
  // (useLayoutEffect により未初期化フレームの描画を防ぐ)。
  // 進行中の押下アニメも破棄する(全インスタンスが静止位置へ戻るため)。
  useLayoutEffect(() => {
    writeInstances()
    pressRef.current = null
  }, [writeInstances])

  /**
   * 押下中のキャップを静止位置(沈下量 0)と元の色へ復元する。
   * 割り込み押下・reducedMotion 切替・アニメ完了など、中断の全経路から呼ぶ。
   */
  const restoreCap = useCallback(
    (hole: number) => {
      const capBody = capBodyRef.current
      const capDeck = capDeckRef.current
      if (!capBody || !capDeck) return
      const local = holes.indexOf(hole)
      if (local < 0) return
      const [, , hh] = style.housing
      const bodyH = style.capH * 0.78
      const deckH = style.capH * 0.22
      const bodyZ = hh + 0.2 + 2.6 + bodyH / 2
      const deckZ = hh + 0.2 + 2.6 + bodyH + deckH / 2
      const [hx, hy, hz] = centers[hole]
      const matrix = new THREE.Matrix4()
      matrix.makeTranslation(hx, hy, hz + bodyZ)
      capBody.setMatrixAt(local, matrix)
      matrix.makeTranslation(hx, hy, hz + deckZ)
      capDeck.setMatrixAt(local, matrix)
      const base = colorFor(hole)
      const color = new THREE.Color(base.body)
      capBody.setColorAt(local, color)
      color.set(base.deck)
      capDeck.setColorAt(local, color)
      capBody.instanceMatrix.needsUpdate = true
      capDeck.instanceMatrix.needsUpdate = true
      if (capBody.instanceColor) capBody.instanceColor.needsUpdate = true
      if (capDeck.instanceColor) capDeck.instanceColor.needsUpdate = true
    },
    [centers, holes, style, colorFor],
  )

  // キー押下トリガ: ガチャ開始時、対応するキャップが沈む。
  // アニメ中の別キーが割り込んだ場合は、まず前のキャップを復元してから新しい押下を開始する
  useEffect(() => {
    if (pulseCount > 0 && pressedHole >= 0) {
      const prev = pressRef.current
      if (prev && prev.hole >= 0 && prev.hole !== pressedHole) restoreCap(prev.hole)
      const [hx, hy, hz] = centers[pressedHole]
      glowRef.current?.position.set(hx, hy, hz + style.housing[2] + 10)
      pressRef.current = { start: clock.elapsedTime, hole: pressedHole, phase: 'down' }
    }
  }, [pulseCount, pressedHole, centers, style, clock, restoreCap])

  useFrame((state) => {
    if (reducedMotion) {
      if (glowRef.current) glowRef.current.intensity = 0
      // アニメ中断: 沈下・発光中のキャップを静止状態へ戻してから破棄する
      const p = pressRef.current
      if (p && p.hole >= 0) restoreCap(p.hole)
      pressRef.current = null
      return
    }
    // 初期化漏れ・R3F による InstancedMesh 再構築を検出したら、アニメより先に
    // 配置を復旧する(effect が飛ばされた場合の最終防衛線)。
    const housingNow = housingRef.current
    if (initDirtyRef.current || (housingNow && housingNow !== initedMeshRef.current)) {
      writeInstances()
      pressRef.current = null
    }
    const capBody = capBodyRef.current
    const capDeck = capDeckRef.current
    const glow = glowRef.current
    if (!capBody || !capDeck || !glow) return

    // フィルタ該当キャップ: 赤発光を正弦波(2Hz)で明滅させる。
    // 明滅は 0.30〜1.0 の明度(正弦波)で、ピークは鮮やかな赤、谷は暗い赤。
    // 押下中の白発光は直後の press 分岐がこの明滅を上書きするため常に優先される。
    // reducedMotion 中は冒頭で return するため、静的赤発光のまま点滅しない。
    const matchBase = matchBaseRef.current
    if (filterActive && matchBase && matchedHoles) {
      const blink = 0.65 + 0.35 * Math.sin(state.clock.elapsedTime * Math.PI * 4)
      const scratch = blinkScratchRef.current
      for (const hole of matchedHoles) {
        const local = localIndex.get(hole)
        if (local == null) continue
        scratch.set(matchBase.body).multiplyScalar(blink)
        capBody.setColorAt(local, scratch)
        scratch.set(matchBase.deck).multiplyScalar(blink)
        capDeck.setColorAt(local, scratch)
      }
      if (capBody.instanceColor) capBody.instanceColor.needsUpdate = true
      if (capDeck.instanceColor) capDeck.instanceColor.needsUpdate = true
    }

    const [, , hh] = style.housing
    const bodyH = style.capH * 0.78
    const deckH = style.capH * 0.22
    const bodyZ = hh + 0.2 + 2.6 + bodyH / 2
    const deckZ = hh + 0.2 + 2.6 + bodyH + deckH / 2

    const p = pressRef.current
    if (p && p.hole >= 0) {
      const local = holes.indexOf(p.hole)
      if (local < 0) {
        pressRef.current = null
        glow.intensity = 0
        return
      }
      const t = state.clock.elapsedTime - p.start
      let sink = 0
      let glowLevel = 0
      if (p.phase === 'down') {
        const k = Math.min(1, t / PRESS_DOWN_S)
        sink = -style.pressDepth * easeOutQuad(k)
        glowLevel = k
        if (k >= 1) p.phase = 'hold'
      } else if (p.phase === 'hold') {
        sink = -style.pressDepth
        glowLevel = 1
        if (t >= PRESS_DOWN_S + PRESS_HOLD_S) p.phase = 'up'
      } else {
        const k = Math.min(1, (t - PRESS_DOWN_S - PRESS_HOLD_S) / PRESS_UP_S)
        sink = -style.pressDepth * (1 - easeOutCubic(k))
        glowLevel = 1 - k
        if (k >= 1) {
          pressRef.current = null
          // 発光解除: 元の色(mapped はアクセント、unmapped は placeholder)へ戻す
          restoreCap(p.hole)
        }
      }
      const [hx, hy, hz] = centers[p.hole]
      const matrix = new THREE.Matrix4()
      matrix.makeTranslation(hx, hy, hz + bodyZ + sink)
      capBody.setMatrixAt(local, matrix)
      matrix.makeTranslation(hx, hy, hz + deckZ + sink)
      capDeck.setMatrixAt(local, matrix)
      capBody.instanceMatrix.needsUpdate = true
      capDeck.instanceMatrix.needsUpdate = true
      glow.intensity = glowLevel * 26
      if (glowLevel > 0.05) {
        const color = new THREE.Color('#d9f2ff')
        capBody.setColorAt(local, color)
        capDeck.setColorAt(local, color)
        if (capBody.instanceColor) capBody.instanceColor.needsUpdate = true
        if (capDeck.instanceColor) capDeck.instanceColor.needsUpdate = true
      }
    } else {
      glow.intensity = 0
    }
  })

  const count = holes.length
  return (
    <>
      <instancedMesh ref={housingRef} args={[geos.housing, materials.housing, count]} />
      {/* 十字ステムは直交 2 本のボックスで表現 */}
      <instancedMesh ref={stemARef} args={[geos.stemA, materials.stem, count]} />
      <instancedMesh ref={stemBRef} args={[geos.stemB, materials.stem, count]} />
      <instancedMesh ref={capBodyRef} args={[geos.capBody, materials.capBody, count]} />
      <instancedMesh ref={capDeckRef} args={[geos.capDeck, materials.capDeck, count]} />
      <pointLight ref={glowRef} position={[0, 0, 16]} color="#7fd4ff" intensity={0} distance={14} decay={1.8} />
    </>
  )
}

/**
 * 手続き生成のキースイッチ + キーキャップ群(基板単位)。
 * MX 基板は 行5〜行6(手前 2 行, y=-28.55/-47.6・低デッキ z=5.655 の 16 穴)=
 * choc ロープロファイル専用、行1〜行4 は MX スタイル(高デッキ z=8.355)。
 * HE 基板は全穴 HE スタイル(z=8.36)。
 * 押されたキー(ガチャ開始)に対応するキャップだけ沈んで発光する。
 */
function TesterKey({
  form,
  keymapCodes,
  formByCode,
  infoByCode,
  pressedCode,
  pulseCount,
  reducedMotion,
  filter,
}: {
  form: SwitchForm
  keymapCodes: string[]
  formByCode: Map<string, SwitchForm>
  /** キーコード → スイッチ情報(フィルタの feel/force 判定に使用) */
  infoByCode: Map<string, SwitchInfo>
  pressedCode: string | null
  pulseCount: number
  reducedMotion: boolean
  filter: StageFilter
}) {
  const formOf = useCallback((code: string) => formByCode.get(code), [formByCode])
  const mapped = useMemo(
    () => mappedHolesFor(form, keymapCodes, formOf),
    [form, keymapCodes, formOf],
  )
  const pressedIndex = pressedCode ? keymapCodes.indexOf(pressedCode) : -1
  const pressedHole = pressedIndex >= 0 ? (mapped[pressedIndex] ?? -1) : -1
  const mappedSet = useMemo(() => new Set(mapped.filter((h) => h >= 0)), [mapped])
  const centers = useMemo(() => holeCenters(form), [form])

  const filterActive = filter.feel !== 'all' || filter.force !== 'all'

  /**
   * フィルタに該当する穴(グローバルインデックス)。
   * マップ済みキーのうち feel/force の両条件(AND)を満たすもののみ。
   * force=null は force 条件が 'all' の時だけ該当(それ以外は非該当扱い)。
   * 非該当(マップ済み非該当・unmapped placeholder)は KeyCluster 側で暗色になる。
   */
  const matchedHoles = useMemo(() => {
    if (!filterActive) return null
    const set = new Set<number>()
    keymapCodes.forEach((code, i) => {
      const hole = mapped[i]
      if (hole < 0) return
      const info = infoByCode.get(code)
      if (!info) return
      if (filter.feel !== 'all' && info.feel !== filter.feel) return
      if (filter.force !== 'all') {
        const g = parseForceGrams(info.force)
        if (g == null) return
        if (filter.force === 'lt35' && !(g < 35)) return
        if (filter.force === '35to39' && !(g >= 35 && g <= 39)) return
        if (filter.force === 'gte40' && !(g >= 40)) return
      }
      set.add(hole)
    })
    return set
  }, [filterActive, filter.feel, filter.force, keymapCodes, mapped, infoByCode])

  // 穴インデックスは行1(奥)→手前の row-major 順(行5〜行6 = 末尾 16 穴 = y=-28.55..-47.6・低デッキ)。
  const allHoles = useMemo(() => centers.map((_, i) => i), [centers])
  const isMxBoard = form === 'mx' || form === 'choc'
  const mxCols = HOLE_GRIDS.mx.xs.length
  // MX 基板(choc 含む): 行1〜行4 = 穴 0..31(y=47.65..-9.5・高デッキ)は MX スタイル、
  // 行5〜行6 = 穴 32..47(y=-28.55..-47.6・低デッキ)は choc スタイル
  const chocRows = 2
  const chocHoleCount = chocRows * mxCols
  const mxHoles = useMemo(
    () => (isMxBoard ? allHoles.slice(0, allHoles.length - chocHoleCount) : allHoles),
    [allHoles, isMxBoard, chocHoleCount],
  )
  const chocHoles = useMemo(
    () => (isMxBoard ? allHoles.slice(allHoles.length - chocHoleCount) : []),
    [allHoles, isMxBoard, chocHoleCount],
  )
  const pressedInMx = mxHoles.includes(pressedHole) ? pressedHole : -1
  const pressedInChoc = chocHoles.includes(pressedHole) ? pressedHole : -1

  // 行ごとのデッキ上面 z は holeCenters が穴座標に持たせているため、
  // グループ自体は z=0 に置く(従来の一括オフセットは廃止)。
  return (
    <group>
      <KeyCluster
        style={isMxBoard ? KEY_STYLES.mx : KEY_STYLES[form]}
        centers={centers}
        holes={mxHoles}
        mappedHoles={mappedSet}
        pressedHole={pressedInMx}
        pulseCount={pulseCount}
        reducedMotion={reducedMotion}
        filterActive={filterActive}
        matchedHoles={matchedHoles}
      />
      {isMxBoard && (
        <KeyCluster
          style={KEY_STYLES.choc}
          centers={centers}
          holes={chocHoles}
          mappedHoles={mappedSet}
          pressedHole={pressedInChoc}
          pulseCount={pulseCount}
          reducedMotion={reducedMotion}
          filterActive={filterActive}
          matchedHoles={matchedHoles}
        />
      )}
    </group>
  )
}

/** テスター本体。bounding box でセンタリング + 正規化スケールし、ゆっくり回転 + 浮遊させる */
function TesterModel({
  form,
  keymapCodes,
  formByCode,
  infoByCode,
  pressedCode,
  pulseCount,
  reducedMotion,
  filter,
  filterMode,
  compact = false,
  rotate = true,
}: {
  form: SwitchForm
  keymapCodes: string[]
  formByCode: Map<string, SwitchForm>
  infoByCode: Map<string, SwitchInfo>
  pressedCode: string | null
  pulseCount: number
  reducedMotion: boolean
  filter: StageFilter
  /** フィルタモード中: 回転を止め、やや斜めの固定アングル(カメラは CameraRig が見下ろしへ移動)へスムーズに移動 */
  filterMode: boolean
  /** 'both' 表示時にポディウムを縮小し、2 台のステージが重ならないようにする */
  compact?: boolean
  /**
   * ゆっくり回転させるか。'both' の縦長表示では幅広の基板 2 台が回転中に
   * 中央で衝突するため、固定角度(手前を向いた展示向き)で表示する。
   */
  rotate?: boolean
}) {
  const path = form === 'he' ? MODEL_HE : MODEL_MX
  const gltf = useGLTF(path, false, false, extendLoader)
  const motionRef = useRef<THREE.Group>(null)
  const fitRef = useRef<THREE.Group>(null)
  const glowRef = useRef<THREE.PointLight>(null)
  const pulseRef = useRef(0)
  /** 回転角度の累積値(rad)。フィルタ解除後に回転を再開するときの連続性を保つ */
  const rotRef = useRef(0)
  const fit = useMemo(() => ({ scale: 1, x: 0, y: 0, z: 0 }), [])

  // モデル差し替え時: GLB(単位 mm・Z-up)を X 軸 -90° 回転で水平に寝かせ、
  // bounding box でセンタリング + 正規化スケール(基板下面を y=0 に)。
  // 計測は fit グループ(回転 -90°X のみ)の空間で行う。Box3.setFromObject は
  // ワールド空間で計測するため、祖先の motion group(回転+浮遊)のトランスフォームが
  // 混入しないよう、計測中だけ全祖先の回転/位置/スケールを一時リセットする
  // (前回のスケール/位置の混入も防ぐ)。
  useEffect(() => {
    const group = fitRef.current
    if (!group) return
    // 祖先のトランスフォームを退避してリセット
    const saved: { obj: THREE.Object3D; pos: THREE.Vector3; rot: THREE.Euler; scale: THREE.Vector3 }[] = []
    let node: THREE.Object3D | null = group.parent
    while (node) {
      saved.push({ obj: node, pos: node.position.clone(), rot: node.rotation.clone(), scale: node.scale.clone() })
      node = node.parent
    }
    for (const { obj } of saved) {
      obj.position.set(0, 0, 0)
      obj.rotation.set(0, 0, 0)
      obj.scale.set(1, 1, 1)
    }
    const prevPos = group.position.clone()
    const prevScale = group.scale.clone()
    group.position.set(0, 0, 0)
    group.scale.set(1, 1, 1)
    group.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(gltf.scene)
    // 祖先・fit グループのトランスフォームを復元
    for (const { obj, pos, rot, scale } of saved) {
      obj.position.copy(pos)
      obj.rotation.copy(rot)
      obj.scale.copy(scale)
    }
    group.position.copy(prevPos)
    group.scale.copy(prevScale)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    if (maxDim <= 0) return
    const scale = TARGET_SIZE / maxDim
    fit.scale = scale
    // 回転 -90°X の回転のみ空間: ワールド x = s*box.x, ワールド y = s*box.y, ワールド z = s*box.z
    fit.x = -center.x * scale
    fit.y = -box.min.y * scale
    fit.z = -center.z * scale
    group.scale.setScalar(scale)
    group.position.set(fit.x, fit.y, fit.z)
  }, [gltf, fit])

  // キー押下(ガチャ開始)で発光パルス
  useEffect(() => {
    if (pulseCount > 0) pulseRef.current = 1
  }, [pulseCount])

  useFrame((state, delta) => {
    const motion = motionRef.current
    if (!motion) return
    if (reducedMotion) {
      rotRef.current = 0
      motion.rotation.y = 0
      motion.position.y = 0
      motion.scale.setScalar(1)
      return
    }
    const t = state.clock.elapsedTime
    // フィルタモード: 回転を止め、正面からやや斜めの固定アングルへスムーズ(damp)に移動。
    // 解除時は累積角度から回転を再開する(解除直後に暴走スピンしないよう rotRef で連続性を保つ)。
    if (filterMode) {
      rotRef.current = THREE.MathUtils.damp(rotRef.current, FILTER_FIXED_ANGLE, 3.4, delta)
    } else if (rotate) {
      rotRef.current += delta * 0.28
    } else {
      // 縦長 'both' の展示向き固定角度
      rotRef.current = THREE.MathUtils.damp(rotRef.current, FILTER_FIXED_ANGLE, 3.4, delta)
    }
    motion.rotation.y = rotRef.current
    motion.position.y = Math.sin(t * 1.1) * 0.045
    pulseRef.current = THREE.MathUtils.damp(pulseRef.current, 0, 2.6, delta)
    motion.scale.setScalar(1 + pulseRef.current * 0.045)
    if (glowRef.current) {
      glowRef.current.intensity = 4 + pulseRef.current * 30
    }
  })

  return (
    <group ref={motionRef}>
      <group ref={fitRef} rotation={[-Math.PI / 2, 0, 0]}>
        <primitive object={gltf.scene} />
        <TesterKey
          form={form}
          keymapCodes={keymapCodes}
          formByCode={formByCode}
          infoByCode={infoByCode}
          pressedCode={pressedCode}
          pulseCount={pulseCount}
          reducedMotion={reducedMotion}
          filter={filter}
        />
      </group>
      {/* ポディウムも motion group 内に置き、機械全体が一体で回転・浮遊する */}
      <Podium reducedMotion={reducedMotion} scale={compact ? 0.62 : 1} haloScale={compact ? 0.55 : 1} />
      <pointLight ref={glowRef} position={[0, 0.3, 0]} color="#5ee6ff" intensity={4} distance={7} decay={1.8} />
    </group>
  )
}

/**
 * ボード直上のラベル(メカニカル / 磁気)。drei の Html でボードのグループ座標に
 * 張り付けるため、カメラ(回転展示 / トップダウン)や画面サイズが変わっても
 * 常に各ボードの中央直上へ追従する。idle の both 表示時のみ TesterScene が描画する。
 * scale: 所属グループの scale。両ボードでラベルのワールド高を揃えるため
 * オフセットを scale で割ってローカル座標に変換する(HE は 0.86 に縮小されている)。
 */
function BoardLabel({ scale, children }: { scale: number; children: ReactNode }) {
  return (
    <Html
      position={[0, BOARD_LABEL_OFFSET[1] / scale, BOARD_LABEL_OFFSET[2] / scale]}
      center
      zIndexRange={[6, 4]}
      className="gacha-board-label"
    >
      {/* ステージ自体が aria-hidden のため、装飾ラベルも読み上げ対象外にする */}
      <span aria-hidden>{children}</span>
    </Html>
  )
}

function TesterScene({
  display,
  keymapCodes,
  formByCode,
  infoByCode,
  pressedCode,
  pulseCount,
  reducedMotion,
  filter,
}: {
  display: SwitchForm | 'both'
  keymapCodes: string[]
  formByCode: Map<string, SwitchForm>
  infoByCode: Map<string, SwitchInfo>
  pressedCode: string | null
  pulseCount: number
  reducedMotion: boolean
  filter: StageFilter
}) {
  const aspect = useThree((state) => state.viewport.aspect)
  const portrait = aspect < 1
  const filterMode = filter.feel !== 'all' || filter.force !== 'all'
  // 見下ろし表示: フィルタモード中、または縦長 'both'(回転せず固定角度で展示)のとき。
  // 通常の回転展示(横長 'both'・単台)では従来どおりのカメラを維持する。
  const topDown = filterMode || (display === 'both' && portrait)
  return (
    <>
      <CameraRig display={display} aspect={aspect} topDown={topDown} reducedMotion={reducedMotion} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 3]} intensity={1.9} color="#eaf2ff" />
      <directionalLight position={[-5, 2.5, -4]} intensity={0.65} color="#7fb0ff" />
      <pointLight position={[0, 2.8, -3.6]} intensity={24} distance={10} decay={1.8} color="#4f8cff" />
      {display === 'both' ? (
        <>
          {/* idle: MX と HE のテスターを左右に並べて展示。
              縦長画面では間隔を詰めて全体を縮小し、2 台を画面に収める。
              HE は正規化スケールで大きく見えるため compact で少し小さくして MX と釣り合わせ、
              ポディウムも compact(両台のステージが重ならないサイズ)にする。 */}
          <group position={[-(portrait ? 0.9 : 1.65), 0, 0]} scale={portrait ? 0.68 : 1}>
            <BoardLabel scale={portrait ? 0.68 : 1}>メカニカル</BoardLabel>
            <TesterModel
              form="mx"
              compact
              rotate={!portrait}
              keymapCodes={keymapCodes}
              formByCode={formByCode}
              infoByCode={infoByCode}
              pressedCode={pressedCode}
              pulseCount={pulseCount}
              reducedMotion={reducedMotion}
              filter={filter}
              filterMode={filterMode}
            />
          </group>
          <group position={[portrait ? 0.9 : 1.65, 0, 0]} scale={portrait ? 0.68 * 0.96 : 0.86}>
            <BoardLabel scale={portrait ? 0.68 * 0.96 : 0.86}>磁気</BoardLabel>
            <TesterModel
              form="he"
              compact
              rotate={!portrait}
              keymapCodes={keymapCodes}
              formByCode={formByCode}
              infoByCode={infoByCode}
              pressedCode={pressedCode}
              pulseCount={pulseCount}
              reducedMotion={reducedMotion}
              filter={filter}
              filterMode={filterMode}
            />
          </group>
        </>
      ) : (
        <TesterModel
          form={display}
          keymapCodes={keymapCodes}
          formByCode={formByCode}
          infoByCode={infoByCode}
          pressedCode={pressedCode}
          pulseCount={pulseCount}
          reducedMotion={reducedMotion}
          filter={filter}
          filterMode={filterMode}
        />
      )}
    </>
  )
}

export interface TesterStageProps {
  /** 表示するスイッチ形式。'both' は MX と HE を並べて展示(idle 時) */
  display: SwitchForm | 'both'
  /** マッピング済みキーのコード(keymap のエントリ順。穴位置割り当てに使用) */
  keymapCodes: string[]
  /** 現在ガチャを発動中のキーコード(なければ null) */
  pressedCode: string | null
  /** ガチャ開始ごとにインクリメントされるカウンタ(発光パルス・キー押下のトリガ) */
  pulseCount: number
  reducedMotion: boolean
  /** WebGL 非対応 / GLB 読込失敗時の 2D フォールバック */
  fallback: ReactNode
  /**
   * idle 絞り込み状態。いずれかの条件が 'all' 以外のとき:
   * - キャップ色を該当=赤発光(明滅) / 非該当=暗色に上書き
   * - モデル回転を停止し、やや斜めの固定アングルへ移動(カメラは見下ろしへ damp 遷移)
   */
  filter: StageFilter
}

export function TesterStage({
  display,
  keymapCodes,
  pressedCode,
  pulseCount,
  reducedMotion,
  fallback,
  filter,
}: TesterStageProps) {
  const [webglOk] = useState(detectWebGL)
  const [formByCode, setFormByCode] = useState<Map<string, SwitchForm>>(() => new Map())
  const [infoByCode, setInfoByCode] = useState<Map<string, SwitchInfo>>(() => new Map())

  // キーコード → スイッチ form / 情報(feel・force)の対応を実効データから取得する。
  // 穴割当の form フィルタ(MX 基板= mx/choc のみ / HE 基板= he のみ)と
  // choc 行への割り当て、絞り込みフィルタの該当判定に使用。DisplayPage が渡すのは
  // keymapCodes のみのため TesterStage 内で読み直す(draft があれば draft、なければ bundled。
  // 同じファイルを DisplayPage が読み込み済みなのでブラウザキャッシュで即時)。
  useEffect(() => {
    let alive = true
    loadEffectiveData()
      .then(({ data }) => {
        if (!alive) return
        const byId = new Map(data.switches.map((s) => [s.id, s]))
        const map = new Map<string, SwitchForm>()
        const infoMap = new Map<string, SwitchInfo>()
        for (const [code, id] of Object.entries(data.keymap)) {
          const info = byId.get(id)
          if (info) {
            map.set(code, info.form)
            infoMap.set(code, info)
          }
        }
        setFormByCode(map)
        setInfoByCode(infoMap)
      })
      .catch(() => {
        // 読めない場合は form 不明扱い(基板の主 form として扱う)
      })
    return () => {
      alive = false
    }
  }, [])

  if (!webglOk) {
    return <>{fallback}</>
  }

  return (
    <StageErrorBoundary fallback={fallback}>
      <div className="gacha-stage" aria-hidden>
        <Canvas
          dpr={[1, 1.75]}
          camera={{ position: [0, 2.0, 5.6], fov: 38 }}
          gl={{ antialias: true, powerPreference: 'high-performance', alpha: true }}
        >
          <Suspense fallback={null}>
            <TesterScene
              display={display}
              keymapCodes={keymapCodes}
              formByCode={formByCode}
              infoByCode={infoByCode}
              pressedCode={pressedCode}
              pulseCount={pulseCount}
              reducedMotion={reducedMotion}
              filter={filter}
            />
          </Suspense>
        </Canvas>
      </div>
    </StageErrorBoundary>
  )
}
