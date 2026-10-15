import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'

const groups = [
  ['Criar e editar', [['Tab', 'Criar subtópico'], ['Enter', 'Criar tópico irmão'], ['Shift + Enter', 'Criar irmão acima'], ['F2', 'Editar tópico'], ['Delete', 'Excluir ramificação']]],
  ['Organizar', [['Alt + ↑/↓', 'Reordenar entre irmãos'], ['Espaço', 'Expandir ou recolher'], ['Setas', 'Navegar entre tópicos']]],
  ['Histórico e seleção', [['Shift + arrastar', 'Selecionar uma área'], ['Ctrl/Cmd + Z', 'Desfazer'], ['Ctrl/Cmd + Shift + Z', 'Refazer'], ['Ctrl/Cmd + A', 'Selecionar tópicos visíveis'], ['Ctrl/Cmd + C/X/V', 'Copiar, recortar ou colar']]],
  ['Visualização', [['+ / −', 'Alterar zoom'], ['?', 'Abrir esta ajuda'], ['Escape', 'Fechar painel ou limpar seleção']]],
] as const

export function MindMapShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null); const opener = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!open) return
    opener.current = globalThis.document.activeElement as HTMLElement; const first = dialog.current?.querySelector<HTMLElement>('button'); first?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !dialog.current) return
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')]; if (!focusable.length) return
      const firstItem = focusable[0]; const lastItem = focusable.at(-1)!; if (event.shiftKey && globalThis.document.activeElement === firstItem) { event.preventDefault(); lastItem.focus() } else if (!event.shiftKey && globalThis.document.activeElement === lastItem) { event.preventDefault(); firstItem.focus() }
    }
    window.addEventListener('keydown', keydown); return () => { window.removeEventListener('keydown', keydown); opener.current?.focus() }
  }, [open, onClose])
  if (!open) return null
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}>
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="shortcut-title" className="app-card max-h-[85dvh] w-full max-w-2xl overflow-y-auto p-6">
      <div className="mb-5 flex items-center"><h2 id="shortcut-title" className="text-xl font-bold text-strong">Atalhos do editor</h2><button autoFocus aria-label="Fechar ajuda de atalhos" className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-700" onClick={onClose}><X /></button></div>
      <div className="grid gap-5 sm:grid-cols-2">{groups.map(([title, shortcuts]) => <section key={title}><h3 className="mb-2 text-sm font-semibold text-violet-300">{title}</h3><dl className="space-y-2">{shortcuts.map(([key, description]) => <div key={key} className="flex items-center justify-between gap-4 text-sm"><dt><kbd className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200">{key}</kbd></dt><dd className="text-right text-slate-400">{description}</dd></div>)}</dl></section>)}</div>
    </section>
  </div>
}
