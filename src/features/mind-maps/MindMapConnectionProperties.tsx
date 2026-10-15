import { useCallback, useEffect, useRef, useState } from 'react'
import type { MindMapConnection } from './types'

interface Props {
  connection: MindMapConnection
  selected: boolean
  onChange: (id: string, changes: Partial<MindMapConnection>) => void
  onRemove: (id: string) => void
}

export function MindMapConnectionProperties({ connection, selected, onChange, onRemove }: Props) {
  const [label, setLabel] = useState(connection.label)
  const labelRef = useRef(label)
  const savedLabelRef = useRef(label)
  const connectionIdRef = useRef(connection.id)
  const timerRef = useRef<number | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const flushLabel = useCallback(() => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null }
    if (labelRef.current === savedLabelRef.current) return
    savedLabelRef.current = labelRef.current
    onChangeRef.current(connectionIdRef.current, { label: labelRef.current })
  }, [])

  useEffect(() => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = null }
    connectionIdRef.current = connection.id; labelRef.current = connection.label; savedLabelRef.current = connection.label; setLabel(connection.label)
    return flushLabel
  }, [connection.id, connection.label, flushLabel])

  return <div aria-label={selected ? 'Conexão selecionada' : undefined} className={`mt-2 rounded-lg border p-3 ${selected ? 'border-violet-400 bg-violet-500/10' : 'border-transparent bg-slate-800'}`}>
    <input aria-label="Rótulo da conexão" value={label} maxLength={120} placeholder="Rótulo" onChange={(event) => { const value = event.target.value; labelRef.current = value; setLabel(value); if (timerRef.current) window.clearTimeout(timerRef.current); timerRef.current = window.setTimeout(flushLabel, 500) }} onBlur={flushLabel} className="min-h-9 w-full rounded bg-slate-950 px-2 text-xs text-white" />
    <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-xs text-slate-400">Formato<select aria-label="Formato da conexão" value={connection.shape ?? 'curve'} onChange={(event) => onChange(connection.id, { shape: event.target.value as MindMapConnection['shape'] })} className="mt-1 min-h-9 w-full rounded bg-slate-950 px-2"><option value="curve">Curva</option><option value="straight">Reta</option></select></label><label className="text-xs text-slate-400">Cor<input aria-label="Cor da conexão" type="color" value={connection.color} onChange={(event) => onChange(connection.id, { color: event.target.value })} className="mt-1 h-9 w-full" /></label><label className="text-xs text-slate-400">Espessura<input aria-label="Espessura da conexão" type="range" min="1" max="6" value={connection.width} onChange={(event) => onChange(connection.id, { width: Number(event.target.value) })} className="w-full" /></label>{(connection.shape ?? 'curve') === 'curve' && <label className="text-xs text-slate-400">Curvatura<input aria-label="Curvatura da conexão" type="range" min="-240" max="240" step="10" value={connection.curveOffset ?? -80} onChange={(event) => onChange(connection.id, { curveOffset: Number(event.target.value) })} className="w-full" /></label>}</div>
    <div className="mt-2 flex flex-wrap gap-2"><button className="text-xs text-slate-300 underline" onClick={() => onChange(connection.id, { dashed: !connection.dashed })}>{connection.dashed ? 'Linha contínua' : 'Linha tracejada'}</button><button className="text-xs text-slate-300 underline" onClick={() => onChange(connection.id, { startMarker: !connection.startMarker })}>{connection.startMarker ? 'Sem início' : 'Seta inicial'}</button><button className="text-xs text-slate-300 underline" onClick={() => onChange(connection.id, { endMarker: !(connection.endMarker ?? connection.directed), directed: !(connection.endMarker ?? connection.directed) })}>{(connection.endMarker ?? connection.directed) ? 'Sem final' : 'Seta final'}</button><button className="ml-auto text-xs text-red-300" onClick={() => { flushLabel(); onRemove(connection.id) }}>Excluir</button></div>
  </div>
}
