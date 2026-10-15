import { normalizeMindMapLink } from './linkValidation'

test('normaliza links http e usa o domínio como rótulo padrão', () => {
  expect(normalizeMindMapLink(' https://example.com/guia ', '')).toEqual({ label: 'example.com', url: 'https://example.com/guia' })
  expect(normalizeMindMapLink('http://example.com', 'Documentação')).toEqual({ label: 'Documentação', url: 'http://example.com/' })
})

test('recusa esquemas ativos, credenciais e endereços incompletos', () => {
  expect(() => normalizeMindMapLink('javascript:alert(1)', '')).toThrow('http ou https')
  expect(() => normalizeMindMapLink('https://user:secret@example.com', '')).toThrow('usuário ou senha')
  expect(() => normalizeMindMapLink('example.com', '')).toThrow('URL completa')
})

test('valida o limite do rótulo sem truncar silenciosamente', () => {
  expect(() => normalizeMindMapLink('https://example.com', 'a'.repeat(81))).toThrow('80 caracteres')
})
