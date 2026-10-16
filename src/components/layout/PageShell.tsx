import { ArrowLeft } from 'lucide-react'
import type { PropsWithChildren, ReactNode } from 'react'
import { Link } from 'react-router'
import { HubLogo } from './HubLogo'

export function PageShell({ children, wide = true }: PropsWithChildren<{ wide?: boolean }>) {
  return <main className="min-h-screen p-4 md:p-8"><div className={`mx-auto w-full animate-fade-in ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}>{children}</div></main>
}

export function BackToHub({ aside }: { aside?: ReactNode }) {
  return <nav aria-label="Navegação da ferramenta" className="mb-6 flex items-center justify-between gap-4">
    <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2 font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"><ArrowLeft size={18} />Voltar ao Hub</Link>
    {aside ?? <HubLogo size={40} decorative />}
  </nav>
}
