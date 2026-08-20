import type { Keymap, SwitchInfo, TesterData } from '../types'

const DRAFT_KEY = 'switch-tester:draft'

export function resolveAsset(path: string): string {
  if (!path) return ''
  if (path.startsWith('data:') || path.startsWith('blob:') || /^https?:/i.test(path)) {
    return path
  }
  const base = import.meta.env.BASE_URL || './'
  const normalized = path.replace(/^\.\//, '').replace(/^\//, '')
  if (base === './' || base === '.') {
    return `./${normalized}`
  }
  return `${base.replace(/\/?$/, '/')}${normalized}`
}

export async function loadBundledData(): Promise<TesterData> {
  const base = import.meta.env.BASE_URL || './'
  const prefix = base.endsWith('/') ? base : `${base}/`
  const [switchesRes, keymapRes] = await Promise.all([
    fetch(`${prefix}data/switches.json`),
    fetch(`${prefix}data/keymap.json`),
  ])

  if (!switchesRes.ok || !keymapRes.ok) {
    throw new Error('スイッチデータの読み込みに失敗しました')
  }

  const switches = (await switchesRes.json()) as SwitchInfo[]
  const keymap = (await keymapRes.json()) as Keymap
  return { switches, keymap }
}

export function loadDraft(): TesterData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as TesterData
  } catch {
    return null
  }
}

export function saveDraft(data: TesterData): void {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(data))
}

export function clearDraft(): void {
  localStorage.removeItem(DRAFT_KEY)
}

export async function loadEffectiveData(): Promise<{ data: TesterData; source: 'draft' | 'bundled' }> {
  const draft = loadDraft()
  if (draft?.switches && draft?.keymap) {
    return { data: draft, source: 'draft' }
  }
  const bundled = await loadBundledData()
  return { data: bundled, source: 'bundled' }
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Each switch maps to at most one key. */
export function bindKeyToSwitch(keymap: Keymap, switchId: string, code: string): Keymap {
  const next: Keymap = {}
  for (const [key, id] of Object.entries(keymap)) {
    if (id === switchId) continue
    if (key === code) continue
    next[key] = id
  }
  next[code] = switchId
  return next
}

export function unbindSwitch(keymap: Keymap, switchId: string): Keymap {
  const next: Keymap = {}
  for (const [key, id] of Object.entries(keymap)) {
    if (id !== switchId) next[key] = id
  }
  return next
}

export function findKeyForSwitch(keymap: Keymap, switchId: string): string | null {
  for (const [key, id] of Object.entries(keymap)) {
    if (id === switchId) return key
  }
  return null
}

export function createEmptySwitch(): SwitchInfo {
  return {
    id: `switch-${crypto.randomUUID().slice(0, 8)}`,
    name: '',
    form: 'mx',
    feel: 'linear',
    force: '',
    description: '',
    image: './images/placeholder-switch.svg',
    buyUrl: '',
  }
}
