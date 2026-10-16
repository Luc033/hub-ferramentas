import { Clock3, Headphones, Leaf, ListTodo, Network, Timer } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import habitsLogo from '../assets/logo-habitos.webp'

export type ToolStatus = 'available' | 'coming-soon'
export type WidgetKind = 'habits' | 'timer' | 'pomodoro' | 'tasks' | 'notes' | 'sounds'

export interface ToolDefinition {
  id: 'habits' | 'timer' | 'pomodoro' | 'tasks' | 'notes' | 'sounds'
  title: string
  description: string
  path: string
  icon: LucideIcon
  accent: 'emerald' | 'cyan' | 'rose' | 'amber' | 'violet' | 'blue'
  status: ToolStatus
  widget?: WidgetKind
  logo?: string
}

export const toolRegistry: readonly ToolDefinition[] = [
  { id: 'habits', title: 'Hábitos', description: 'Acompanhe suas metas diárias, visualize o progresso semanal e crie sequências duradouras.', path: '/habits', icon: Leaf, logo: habitsLogo, accent: 'emerald', status: 'available', widget: 'habits' },
  { id: 'pomodoro', title: 'Foco Pomodoro', description: 'Gerencie períodos de trabalho e pausas usando a técnica Pomodoro.', path: '/pomodoro', icon: Timer, accent: 'rose', status: 'available', widget: 'pomodoro' },
  { id: 'timer', title: 'Temporizador', description: 'Contagem regressiva com presets, entrada personalizada e alarme sonoro.', path: '/timer', icon: Clock3, accent: 'cyan', status: 'available', widget: 'timer' },
  { id: 'tasks', title: 'Kanban', description: 'Organize tarefas em um quadro visual simples e acessível.', path: '/tasks', icon: ListTodo, accent: 'amber', status: 'available', widget: 'tasks' },
  { id: 'notes', title: 'Anotações / Mapa Mental', description: 'Capture ideias em notas, mapas hierárquicos e quadros visuais.', path: '/notes', icon: Network, accent: 'violet', status: 'available', widget: 'notes' },
  { id: 'sounds', title: 'Sons de Foco', description: 'Crie um ambiente sonoro para concentração e descanso.', path: '/sounds', icon: Headphones, accent: 'blue', status: 'available', widget: 'sounds' },
]
