import { createMindMapFile, parseMindMapFile, remapMindMapFile, renderMindMapSvg } from './mindMapTransfer'
import type { MindMapDocument } from './types'

const document: MindMapDocument = {
  map: { id: 'map', schemaVersion: 1, name: 'Plano <script>', rootId: 'root', layout: 'radial', theme: 'minimal', viewport: { panX: 0, panY: 0, zoom: 1 }, createdAt: 1, updatedAt: 1 },
  topics: [
    { id: 'root', mapId: 'map', parentId: null, order: 0, text: 'Raiz <script>alert(1)</script>', collapsed: false, createdAt: 1, updatedAt: 1 },
    { id: 'child', mapId: 'map', parentId: 'root', order: 0, text: 'Filho', note: 'privado', collapsed: false, style: { borderWidth: 4, borderRadius: 8, textAlign: 'left', fontScale: 1.2, italic: true }, createdAt: 2, updatedAt: 2 },
  ],
  connections: [{ id: 'connection', mapId: 'map', sourceId: 'root', targetId: 'child', label: '<img>', color: '#a78bfa', width: 2, dashed: false, directed: true, shape: 'straight', startMarker: true, endMarker: true, curveOffset: 40, createdAt: 2, updatedAt: 2 }],
}

test('exporta e valida o formato nativo versionado', async () => {
  const file = await createMindMapFile(document, [])
  const parsed = parseMindMapFile(JSON.stringify(file))
  expect(parsed).toMatchObject({ format: 'hub-mind-map', version: 1, integrity: { topics: 2, connections: 1, assets: 0 } })
  expect(parsed.topics[1].style).toMatchObject({ borderWidth: 4, textAlign: 'left' }); expect(parsed.connections[0]).toMatchObject({ shape: 'straight', startMarker: true })
})

test('continua aceitando arquivos anteriores sem os campos visuais novos', async () => {
  const file = await createMindMapFile(document, []); file.topics = file.topics.map(({ style: _style, ...topic }) => topic); file.connections = file.connections.map(({ shape: _shape, startMarker: _start, endMarker: _end, curveOffset: _curve, ...connection }) => connection)
  expect(() => parseMindMapFile(JSON.stringify(file))).not.toThrow()
})

test('inclui imagens locais no arquivo e restaura blobs com ids novos', async () => {
  const withImage: MindMapDocument = { ...document, topics: document.topics.map((topic) => topic.id === 'child' ? { ...topic, imageAssetId: 'asset' } : topic) }
  const file = await createMindMapFile(withImage, [{ id: 'asset', mapId: 'map', name: 'pixel.png', mimeType: 'image/png', size: 3, blob: new Blob(['png'], { type: 'image/png' }), createdAt: 1 }])
  expect(file.assets[0].dataUrl).toMatch(/^data:image\/png;base64,/)
  const imported = await remapMindMapFile(parseMindMapFile(JSON.stringify(file))); expect(imported.assets[0].id).not.toBe('asset'); expect(imported.assets[0].blob.type).toBe('image/png'); expect(imported.document.topics.find(({ id }) => id !== imported.document.map.rootId)?.imageAssetId).toBe(imported.assets[0].id)
})

test('recusa ciclos, referências órfãs e contadores adulterados', async () => {
  const file = await createMindMapFile(document, [])
  expect(() => parseMindMapFile(JSON.stringify({ ...file, integrity: { ...file.integrity, topics: 99 } }))).toThrow('integridade')
  expect(() => parseMindMapFile(JSON.stringify({ ...file, topics: file.topics.map((topic) => topic.id === 'root' ? { ...topic, parentId: 'child' } : topic) }))).toThrow()
  expect(() => parseMindMapFile(JSON.stringify({ ...file, connections: [{ ...file.connections[0], targetId: 'missing' }] }))).toThrow('referências')
})

test('importa como mapa novo regenerando todos os ids', async () => {
  const imported = await remapMindMapFile(await createMindMapFile(document, []))
  expect(imported.document.map.id).not.toBe(document.map.id); expect(imported.document.map.rootId).not.toBe(document.map.rootId)
  expect(imported.document.connections?.[0]).toMatchObject({ sourceId: imported.document.map.rootId }); expect(imported.document.map.name).toContain('(importado)')
})

test('gera SVG autocontido e mantém texto não confiável inerte', async () => {
  const svg = await renderMindMapSvg(document, [], 'transparent')
  expect(svg).toContain('&lt;script&gt;'); expect(svg).toContain('&lt;img&gt;'); expect(svg).not.toContain('<script>'); expect(svg).not.toContain('onerror=')
  expect(svg).toContain('fill="none"')
  expect(svg).toContain('marker-start="url(#arrow)"'); expect(svg).toContain('rx="8"'); expect(svg).toContain('font-style="italic"')
})
