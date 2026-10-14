import { parseBackup } from './backupService'

test('aceita backup legado e mantém texto do usuário como texto', () => {
  const name = '<img src=x onerror=alert(1)>'
  const backup = parseBackup(JSON.stringify([{ id: '1', name, days: Array(7).fill(false), createdAt: 1 }]))
  expect(backup.records.habits[0].name).toBe(name)
  expect(backup.appVersion).toBe('legacy')
})

test('rejeita registros com days fora do formato legado', () => {
  expect(() => parseBackup(JSON.stringify([{ id: '1', name: 'x', days: [true], createdAt: 1 }]))).toThrow('inválidos')
})

test('rejeita tarefas com status desconhecido', () => {
  const data = { schemaVersion: 3, exportedAt: new Date().toISOString(), appVersion: 'test', records: { habits: [], tasks: [{ id: 'x', title: 'x', description: '', status: 'hack', position: 0, createdAt: 1, updatedAt: 1 }] } }
  expect(() => parseBackup(JSON.stringify(data))).toThrow('tarefas')
})

test('valida metadados opcionais de foco das tarefas', () => {
  const task = { id: 'x', title: 'x', description: '', status: 'todo', position: 0, createdAt: 1, updatedAt: 1, pomodoroCount: 2, focusMinutes: 50 }
  const data = { schemaVersion: 5, exportedAt: new Date().toISOString(), appVersion: 'test', records: { habits: [], tasks: [task] } }
  expect(parseBackup(JSON.stringify(data)).records.tasks).toEqual([task])
  expect(() => parseBackup(JSON.stringify({ ...data, records: { habits: [], tasks: [{ ...task, pomodoroCount: -1 }] } }))).toThrow('tarefas')
})

test('valida arrays e coordenadas dos dados criativos', () => {
  const metadata = { schemaVersion: 4, exportedAt: new Date().toISOString(), appVersion: 'test' }
  expect(() => parseBackup(JSON.stringify({ ...metadata, records: { habits: [], notes: { id: 'x' } } }))).toThrow('notas')
  expect(() => parseBackup(JSON.stringify({ ...metadata, records: { habits: [], boards: [{ id: 'main', name: 'Quadro', panX: 0, panY: 0, zoom: 99, updatedAt: 1 }] } }))).toThrow('quadros')
})

test('rejeita playlist persistida com categoria desconhecida', () => {
  const data = { schemaVersion: 5, exportedAt: new Date().toISOString(), appVersion: 'test', records: { habits: [], focusPlaylists: [{ id: 'x', url: 'https://soundcloud.com/a/sets/b', title: 'B', author: 'A', category: 'Injetada', createdAt: 1 }] } }
  expect(() => parseBackup(JSON.stringify(data))).toThrow('playlists')
  const external = { ...data, records: { habits: [], focusPlaylists: [{ id: 'x', url: 'https://example.com/a/sets/b', title: 'B', author: 'A', category: 'Lo-fi', createdAt: 1 }] } }
  expect(() => parseBackup(JSON.stringify(external))).toThrow('playlists')
})
