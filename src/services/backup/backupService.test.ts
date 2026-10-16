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

test('aceita preferências completas e rejeita valores fora dos limites', () => {
  const settings = { theme: 'light', soundEffects: false, alarmVolume: 25, environmentVolume: 40, environmentMuted: true, notificationsEnabled: false, pomodoroAutoStart: false, focusMinutes: 50, shortBreakMinutes: 10, longBreakMinutes: 20 }
  const data = { schemaVersion: 5, exportedAt: new Date().toISOString(), appVersion: 'test', records: { habits: [] }, preferences: { settings } }
  expect(parseBackup(JSON.stringify(data)).preferences?.settings).toEqual({ ...settings, selectedAlarmSoundId: 'original', focusesPerCycle: 4 })
  expect(() => parseBackup(JSON.stringify({ ...data, preferences: { settings: { ...settings, alarmVolume: 101 } } }))).toThrow('preferências')
  expect(() => parseBackup(JSON.stringify({ ...data, preferences: { settings: { ...settings, focusesPerCycle: 13 } } }))).toThrow('preferências')
})

test('valida o áudio personalizado transportável sem aceitar payloads arbitrários', () => {
  const alarm = { id: 'custom', name: 'alerta.wav', mimeType: 'audio/wav', size: 3, updatedAt: 1, dataUrl: 'data:audio/wav;base64,AQID' }
  const data = { schemaVersion: 8, exportedAt: new Date().toISOString(), appVersion: 'test', records: { habits: [], alarmSounds: [alarm] } }
  expect(parseBackup(JSON.stringify(data)).records.alarmSounds).toEqual([alarm])
  expect(() => parseBackup(JSON.stringify({ ...data, records: { habits: [], alarmSounds: [{ ...alarm, mimeType: 'text/html', dataUrl: 'data:text/html;base64,WA==' }] } }))).toThrow('áudio personalizado')
})

test('valida a integridade das árvores de mapas mentais no backup', () => {
  const map = { id: 'map', schemaVersion: 1, name: 'Plano', rootId: 'root', layout: 'radial', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: 1, updatedAt: 1 }
  const root = { id: 'root', mapId: 'map', parentId: null, order: 0, text: '<img onerror=alert(1)>', collapsed: false, createdAt: 1, updatedAt: 1 }
  const data = { schemaVersion: 6, exportedAt: new Date().toISOString(), appVersion: 'test', records: { habits: [], mindMaps: [map], mindMapTopics: [root] } }
  expect(parseBackup(JSON.stringify(data)).records.mindMapTopics).toEqual([root])
  expect(() => parseBackup(JSON.stringify({ ...data, records: { habits: [], mindMaps: [map], mindMapTopics: [{ ...root, parentId: 'missing' }] } }))).toThrow()
  expect(parseBackup(JSON.stringify({ ...data, records: { habits: [], mindMaps: [{ ...map, layout: 'manual' }], mindMapTopics: [{ ...root, position: { x: 10, y: 20 }, manualPosition: true }] } })).records.mindMaps?.[0]).toMatchObject({ layout: 'manual' })
  expect(() => parseBackup(JSON.stringify({ ...data, records: { habits: [], mindMaps: [map], mindMapTopics: [{ ...root, position: { x: Number.NaN, y: 0 } }] } }))).toThrow('tópicos')
})

test('valida conexões e imagens MM-3 sem aceitar referências órfãs', () => {
  const map = { id: 'map', schemaVersion: 1, name: 'Visual', rootId: 'root', layout: 'orgchart', theme: 'minimal', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: 1, updatedAt: 1 }
  const root = { id: 'root', mapId: 'map', parentId: null, order: 0, text: 'Raiz', collapsed: false, createdAt: 1, updatedAt: 1 }; const child = { ...root, id: 'child', parentId: 'root', imageAssetId: 'asset' }
  const connection = { id: 'connection', mapId: 'map', sourceId: 'root', targetId: 'child', label: 'relaciona', color: '#ffffff', width: 2, dashed: false, directed: true, createdAt: 1, updatedAt: 1 }
  const asset = { id: 'asset', mapId: 'map', name: 'foto.png', mimeType: 'image/png', size: 1, createdAt: 1, dataUrl: 'data:image/png;base64,YQ==' }
  const data = { schemaVersion: 7, exportedAt: new Date().toISOString(), appVersion: 'test', records: { habits: [], mindMaps: [map], mindMapTopics: [root, child], mindMapConnections: [connection], mindMapAssets: [asset] } }
  expect(parseBackup(JSON.stringify(data)).records.mindMapConnections).toEqual([connection])
  expect(() => parseBackup(JSON.stringify({ ...data, records: { ...data.records, mindMapConnections: [{ ...connection, targetId: 'missing' }] } }))).toThrow('conexões')
})
