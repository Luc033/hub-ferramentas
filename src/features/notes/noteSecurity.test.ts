import { blocksAreSafe } from './noteSecurity'

test('aceita URLs permitidas e referências locais estáveis', () => {
  expect(blocksAreSafe([{ type: 'paragraph', content: [{ type: 'link', href: 'https://example.com', content: 'Seguro' }] }, { type: 'image', props: { url: 'hub-note-asset:asset-1' } }])).toBe(true)
})

test('rejeita protocolos executáveis, blocos desconhecidos e profundidade abusiva', () => {
  expect(blocksAreSafe([{ type: 'paragraph', content: [{ type: 'link', href: 'javascript:alert(1)' }] }])).toBe(false)
  expect(blocksAreSafe([{ type: 'script', content: 'alert(1)' }])).toBe(false)
  let nested: Record<string, unknown> = { type: 'paragraph', content: '' }
  for (let index = 0; index < 32; index++) nested = { type: 'paragraph', content: '', children: [nested] }
  expect(blocksAreSafe([nested])).toBe(false)
})
