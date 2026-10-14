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
