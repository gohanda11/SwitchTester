import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FeelBadge, FormBadge } from '../components/Badges'
import {
  bindKeyToSwitch,
  clearDraft,
  createEmptySwitch,
  downloadJson,
  findKeyForSwitch,
  loadBundledData,
  loadDraft,
  resolveAsset,
  saveDraft,
  unbindSwitch,
} from '../data/storage'
import type { SwitchFeel, SwitchForm, SwitchInfo, TesterData } from '../types'

type BindTarget = string | null

export function AdminPage() {
  const [data, setData] = useState<TesterData>({ switches: [], keymap: {} })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [bindTarget, setBindTarget] = useState<BindTarget>(null)
  const [message, setMessage] = useState<string>('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const boot = async () => {
      const draft = loadDraft()
      if (draft) {
        setData(draft)
        setSelectedId(draft.switches[0]?.id ?? null)
        setMessage('ローカル下書きを読み込みました')
      } else {
        const bundled = await loadBundledData()
        setData(bundled)
        setSelectedId(bundled.switches[0]?.id ?? null)
        setMessage('GitHub上のデータを読み込みました')
      }
      setLoaded(true)
    }
    void boot()
  }, [])

  const selected = useMemo(
    () => data.switches.find((s) => s.id === selectedId) ?? null,
    [data.switches, selectedId],
  )

  const boundKey = selected ? findKeyForSwitch(data.keymap, selected.id) : null

  const persist = useCallback((next: TesterData, note?: string) => {
    setData(next)
    saveDraft(next)
    if (note) setMessage(note)
  }, [])

  const updateSelected = (patch: Partial<SwitchInfo>) => {
    if (!selected) return
    const switches = data.switches.map((s) => (s.id === selected.id ? { ...s, ...patch } : s))
    persist({ ...data, switches })
  }

  const addSwitch = () => {
    const created = createEmptySwitch()
    created.name = '新しいスイッチ'
    persist({ ...data, switches: [...data.switches, created] }, 'スイッチを追加しました')
    setSelectedId(created.id)
  }

  const removeSwitch = () => {
    if (!selected) return
    if (!confirm(`「${selected.name || selected.id}」を削除しますか？`)) return
    const switches = data.switches.filter((s) => s.id !== selected.id)
    const keymap = unbindSwitch(data.keymap, selected.id)
    persist({ switches, keymap }, '削除しました')
    setSelectedId(switches[0]?.id ?? null)
  }

  const startBind = () => {
    if (!selected) return
    setBindTarget(selected.id)
    setMessage('テスターのキーを1つ押してください（1スイッチにつき1キー）')
  }

  const clearBind = () => {
    if (!selected) return
    persist(
      { ...data, keymap: unbindSwitch(data.keymap, selected.id) },
      'キー紐づけを解除しました',
    )
  }

  useEffect(() => {
    if (!bindTarget) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return
      event.preventDefault()
      event.stopPropagation()
      const code = event.code
      if (code === 'Escape') {
        setBindTarget(null)
        setMessage('キー紐づけをキャンセルしました')
        return
      }
      const stolenFrom = data.keymap[code]
      const nextKeymap = bindKeyToSwitch(data.keymap, bindTarget, code)
      const note =
        stolenFrom && stolenFrom !== bindTarget
          ? `${code} に紐づけ（以前の割り当てを上書き）`
          : `${code} に紐づけました`
      persist({ ...data, keymap: nextKeymap }, note)
      setBindTarget(null)
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [bindTarget, data, persist])

  const onImageFile = async (file: File | null) => {
    if (!file || !selected) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      updateSelected({ image: result })
      setMessage('画像を読み込みました（下書き保存済み。GitHub用はJSONエクスポート後に配置を推奨）')
    }
    reader.readAsDataURL(file)
  }

  const exportFiles = () => {
    // Avoid embedding huge data URLs into committed JSON if possible — still export as-is.
    downloadJson('switches.json', data.switches)
    downloadJson('keymap.json', data.keymap)
    setMessage('switches.json / keymap.json をダウンロードしました。public/data/ に上書きして push してください')
  }

  const resetToBundled = async () => {
    if (!confirm('下書きを破棄してリポジトリのデータを読み込み直しますか？')) return
    clearDraft()
    const bundled = await loadBundledData()
    setData(bundled)
    setSelectedId(bundled.switches[0]?.id ?? null)
    setMessage('下書きを破棄し、バンドルデータを読み込みました')
  }

  if (!loaded) {
    return (
      <main className="admin">
        <p className="muted">読み込み中…</p>
      </main>
    )
  }

  return (
    <main className="admin">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>スイッチ管理</h1>
          <p className="muted">登録・編集後に JSON をエクスポートし、GitHub へ格納してください。iPad は読み取り専用です。</p>
        </div>
        <div className="admin-actions">
          <Link className="btn ghost" to="/">
            展示ページへ
          </Link>
          <button type="button" className="btn ghost" onClick={() => void resetToBundled()}>
            下書き破棄
          </button>
          <button type="button" className="btn" onClick={exportFiles}>
            JSONエクスポート
          </button>
        </div>
      </header>

      {message ? <p className="banner">{message}</p> : null}
      {bindTarget ? <p className="banner warn">キー待受中… テスターのキーを押してください（Escでキャンセル）</p> : null}

      <div className="admin-layout">
        <section className="panel">
          <div className="panel-head">
            <h2>スイッチ一覧</h2>
            <button type="button" className="btn small" onClick={addSwitch}>
              追加
            </button>
          </div>
          <ul className="switch-list">
            {data.switches.map((s) => {
              const key = findKeyForSwitch(data.keymap, s.id)
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`switch-list-item ${s.id === selectedId ? 'active' : ''}`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <span className="switch-list-name">{s.name || '(無題)'}</span>
                    <span className="switch-list-meta">
                      <FormBadge form={s.form} />
                      <FeelBadge feel={s.feel} />
                      <span className="key-chip">{key ?? '未割当'}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section className="panel">
          {selected ? (
            <>
              <div className="panel-head">
                <h2>編集</h2>
                <button type="button" className="btn small danger" onClick={removeSwitch}>
                  削除
                </button>
              </div>

              <div className="form-grid">
                <label>
                  名前
                  <input
                    value={selected.name}
                    onChange={(e) => updateSelected({ name: e.target.value })}
                  />
                </label>
                <label>
                  ID
                  <input
                    value={selected.id}
                    onChange={(e) => {
                      const nextId = e.target.value.trim()
                      if (!nextId) return
                      const oldId = selected.id
                      const switches = data.switches.map((s) =>
                        s.id === oldId ? { ...s, id: nextId } : s,
                      )
                      const keymap = { ...data.keymap }
                      for (const [code, id] of Object.entries(keymap)) {
                        if (id === oldId) keymap[code] = nextId
                      }
                      persist({ switches, keymap })
                      setSelectedId(nextId)
                    }}
                  />
                </label>
                <label>
                  形状 (form)
                  <select
                    value={selected.form}
                    onChange={(e) => updateSelected({ form: e.target.value as SwitchForm })}
                  >
                    <option value="mx">MX</option>
                    <option value="choc">Choc</option>
                    <option value="he">HE</option>
                  </select>
                </label>
                <label>
                  感触 (feel)
                  <select
                    value={selected.feel}
                    onChange={(e) => updateSelected({ feel: e.target.value as SwitchFeel })}
                  >
                    <option value="linear">Linear</option>
                    <option value="tactile">Tactile</option>
                    <option value="clicky">Clicky</option>
                  </select>
                </label>
                <label>
                  荷重
                  <input
                    value={selected.force ?? ''}
                    onChange={(e) => updateSelected({ force: e.target.value })}
                    placeholder="55g"
                  />
                </label>
                <label>
                  購入URL
                  <input
                    value={selected.buyUrl}
                    onChange={(e) => updateSelected({ buyUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </label>
                <label className="full">
                  説明
                  <textarea
                    rows={3}
                    value={selected.description}
                    onChange={(e) => updateSelected({ description: e.target.value })}
                  />
                </label>
                <label className="full">
                  画像パス（または下のファイル選択）
                  <input
                    value={selected.image.startsWith('data:') ? '(埋め込み画像)' : selected.image}
                    onChange={(e) => updateSelected({ image: e.target.value })}
                    disabled={selected.image.startsWith('data:')}
                  />
                </label>
                <label className="full">
                  画像ファイル
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void onImageFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              <div className="bind-box">
                <div>
                  <h3>テスターキー紐づけ</h3>
                  <p className="muted">1スイッチにつき1キー。割当済みキーを押すと上書きされます。</p>
                  <p>
                    現在: <strong className="key-chip">{boundKey ?? '未割当'}</strong>
                  </p>
                </div>
                <div className="bind-actions">
                  <button type="button" className="btn" onClick={startBind}>
                    キーを押して紐づけ
                  </button>
                  <button type="button" className="btn ghost" onClick={clearBind} disabled={!boundKey}>
                    解除
                  </button>
                  {bindTarget ? (
                    <button type="button" className="btn ghost" onClick={() => setBindTarget(null)}>
                      キャンセル
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="preview-card">
                <img src={resolveAsset(selected.image)} alt="" />
                <div>
                  <div className="badge-row">
                    <FormBadge form={selected.form} />
                    <FeelBadge feel={selected.feel} />
                  </div>
                  <h3>{selected.name || '(無題)'}</h3>
                  <p className="muted">{selected.description || '説明なし'}</p>
                </div>
              </div>
            </>
          ) : (
            <p className="muted">左の一覧から選択するか、追加してください。</p>
          )}
        </section>
      </div>
    </main>
  )
}
