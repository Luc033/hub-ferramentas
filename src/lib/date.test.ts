import { currentWeekKeys, weekKeysForOffset, weekRangeLabel } from './date'

test('gera semanas locais de domingo a sábado com deslocamento', () => {
  const now = new Date(2026, 9, 14, 12)
  expect(currentWeekKeys(now)).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17'])
  expect(weekKeysForOffset(-1, now)).toEqual(['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'])
  expect(weekRangeLabel(currentWeekKeys(now))).toContain('11 de out')
})
