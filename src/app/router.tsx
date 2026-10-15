import { lazy, Suspense } from 'react'
import { createBrowserRouter, Link, type RouteObject } from 'react-router'
import { App } from './App'

const HomePage = lazy(() => import('../features/home/HomePage'))
const HabitsPage = lazy(() => import('../features/habits/HabitsPage'))
const TimerPage = lazy(() => import('../features/timer/TimerPage'))
const PomodoroPage = lazy(() => import('../features/pomodoro/PomodoroPage'))
const TasksPage = lazy(() => import('../features/tasks/TasksPage'))
const NotesPage = lazy(() => import('../features/notes/NotesPage'))
const MindMapsLibraryPage = lazy(() => import('../features/mind-maps/MindMapsLibraryPage'))
const MindMapEditorPage = lazy(() => import('../features/mind-maps/MindMapEditorPage'))
const FocusSoundsPage = lazy(() => import('../features/focus-sounds/FocusSoundsPage'))

const loading = <div className="grid min-h-screen place-items-center bg-[#0a0f1c] text-slate-400">Carregando…</div>

export const appRoutes: RouteObject[] = [{
  element: <App />,
  children: [
    { path: '/', element: <Suspense fallback={loading}><HomePage /></Suspense> },
    { path: '/habits', element: <Suspense fallback={loading}><HabitsPage /></Suspense> },
    { path: '/timer', element: <Suspense fallback={loading}><TimerPage /></Suspense> },
    { path: '/pomodoro', element: <Suspense fallback={loading}><PomodoroPage /></Suspense> },
    { path: '/tasks', element: <Suspense fallback={loading}><TasksPage /></Suspense> },
    { path: '/notes', element: <Suspense fallback={loading}><NotesPage /></Suspense> },
    { path: '/notes/maps', element: <Suspense fallback={loading}><MindMapsLibraryPage /></Suspense> },
    { path: '/notes/maps/:mapId', element: <Suspense fallback={loading}><MindMapEditorPage /></Suspense> },
    { path: '/sounds', element: <Suspense fallback={loading}><FocusSoundsPage /></Suspense> },
    { path: '*', element: <main className="grid min-h-screen place-items-center p-6 text-center"><div><h1 className="mb-3 text-3xl font-bold text-white">Página não encontrada</h1><p className="mb-6 text-slate-400">Esta ferramenta ainda não está disponível.</p><Link to="/" className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white">Voltar ao Hub</Link></div></main> },
  ],
}]

export const router = createBrowserRouter(appRoutes)
