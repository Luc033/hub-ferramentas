import { forwardRef, type ButtonHTMLAttributes, type PropsWithChildren } from 'react'

type Variant = 'brand' | 'timer' | 'secondary' | 'danger'

const variants: Record<Variant, string> = {
  brand: 'border-indigo-500 bg-indigo-600 text-white shadow-indigo-600/20 hover:bg-indigo-500',
  timer: 'border-cyan-500 bg-cyan-600 text-white shadow-cyan-600/20 hover:bg-cyan-500',
  secondary: 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white',
  danger: 'border-red-500 bg-red-600 text-white shadow-red-600/20 hover:bg-red-500',
}

export const Button = forwardRef<HTMLButtonElement, PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }>>(function Button({ children, className = '', variant = 'brand', ...props }, ref) {
  return <button ref={ref} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 font-semibold shadow-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`} {...props}>{children}</button>
})
