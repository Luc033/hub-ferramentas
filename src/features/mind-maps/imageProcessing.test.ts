import { vi } from 'vitest'
import { formatImageBytes, prepareMindMapImage } from './imageProcessing'

afterEach(() => vi.unstubAllGlobals())

test('rejeita formatos não suportados antes de decodificar', async () => {
  await expect(prepareMindMapImage(new File(['texto'], 'arquivo.txt', { type: 'text/plain' }))).rejects.toThrow('PNG, JPEG ou WebP')
})

test('preserva imagens pequenas que não precisam de redimensionamento', async () => {
  const close = vi.fn(); vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 400, height: 300, close }))
  const file = new File([new Uint8Array(2048)], 'imagem.png', { type: 'image/png' }); const result = await prepareMindMapImage(file)
  expect(result).toMatchObject({ file, originalSize: 2048, finalSize: 2048, resized: false }); expect(close).toHaveBeenCalled(); expect(formatImageBytes(2048)).toBe('2 KB')
})
