import { AlertTriangle, X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { Button } from './Button'

export function ConfirmModal({ open, title, children, confirmLabel, onConfirm, onClose }: { open: boolean; title: string; children: ReactNode; confirmLabel: string; onConfirm: () => void; onClose: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    cancelRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])
  if (!open) return null
  return <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="app-card w-full max-w-sm p-6">
      <div className="mb-4 flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400"><AlertTriangle /></span>
        <h2 id="confirm-title" className="text-xl font-bold text-strong">{title}</h2>
        <button aria-label="Fechar" className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-700 hover:text-white" onClick={onClose}><X size={20} /></button>
      </div>
      <div className="mb-8 text-sm leading-relaxed text-slate-300">{children}</div>
      <div className="flex justify-end gap-3"><Button ref={cancelRef} variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button></div>
    </section>
  </div>
}
