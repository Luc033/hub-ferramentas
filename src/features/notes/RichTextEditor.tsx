import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu, type PartialBlock } from '@blocknote/core'
import { pt } from '@blocknote/core/locales'
import { SideMenuExtension } from '@blocknote/core/extensions'
import { BlockNoteView } from '@blocknote/mantine'
import { BasicTextStyleButton, BlockColorsItem, DragHandleMenu, FormattingToolbar, FormattingToolbarController, RemoveBlockItem, SideMenu, SideMenuController, TableColumnHeaderItem, TableRowHeaderItem, TextAlignButton, getFormattingToolbarItems, getDefaultReactSlashMenuItems, SuggestionMenuController, useBlockNoteEditor, useComponentsContext, useCreateBlockNote, useEditorSelectionChange, useExtensionState } from '@blocknote/react'
import { Info } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useSettings } from '../../app/providers/SettingsProvider'
import { notesRepository } from '../../services/db/notesRepository'
import { blocksToText, type Note, type NoteBlock } from './types'
import { noteEditorSchema, type NoteEditor } from './noteEditorSchema'
import '@blocknote/mantine/style.css'

const ASSET_PREFIX = 'hub-note-asset:'

export interface RichTextEditorHandle {
  focus: () => void
  html: () => string
  markdown: () => string
  blocks: () => NoteBlock[]
}

interface Props { note: Note; onChange: (blocks: NoteBlock[], text: string) => void; onReady?: () => void; onAssetError?: (message: string) => void }

const MISSING_IMAGE = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="180" viewBox="0 0 640 180"><rect width="640" height="180" rx="16" fill="#1e293b"/><text x="320" y="94" fill="#cbd5e1" font-family="system-ui" font-size="18" text-anchor="middle">Imagem local indisponível</text></svg>')}`

function withoutBlockIds(block: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, children, ...copy } = block
  return { ...copy, ...(Array.isArray(children) ? { children: children.map((child) => withoutBlockIds(child as Record<string, unknown>)) } : {}) }
}

function NotesBlockMenu() {
  const editor = useBlockNoteEditor<any, any, any>(); const Components = useComponentsContext()!
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block })
  if (!block) return null
  const Item = Components.Generic.Menu.Item
  return <DragHandleMenu><Item className="bn-menu-item" onClick={() => editor.insertBlocks([withoutBlockIds(block as unknown as Record<string, unknown>) as never], block, 'after')}>Duplicar bloco</Item><Item className="bn-menu-item" onClick={() => { void navigator.clipboard?.writeText(blocksToText([block as unknown as NoteBlock])).catch(() => undefined) }}>Copiar texto</Item><Item className="bn-menu-item" onClick={() => editor.moveBlocksUp(block)}>Mover acima</Item><Item className="bn-menu-item" onClick={() => editor.moveBlocksDown(block)}>Mover abaixo</Item><Item className="bn-menu-item" onClick={() => editor.insertBlocks([{ type: 'paragraph' }], block, 'before')}>Inserir antes</Item><Item className="bn-menu-item" onClick={() => editor.insertBlocks([{ type: 'paragraph' }], block, 'after')}>Inserir depois</Item>{block.type !== 'paragraph' && block.type !== 'table' && block.type !== 'image' && <Item className="bn-menu-item" onClick={() => editor.updateBlock(block, { type: 'paragraph' })}>Transformar em texto</Item>}<BlockColorsItem>Cor do bloco</BlockColorsItem><TableRowHeaderItem>Linha de cabeçalho</TableRowHeaderItem><TableColumnHeaderItem>Coluna de cabeçalho</TableColumnHeaderItem><RemoveBlockItem>Excluir bloco</RemoveBlockItem></DragHandleMenu>
}

function NotesFormattingToolbar() {
  const editor = useBlockNoteEditor<any, any, any>(); const Components = useComponentsContext()!; const [, render] = useState(0)
  useEditorSelectionChange(() => render((value) => value + 1), editor)
  const active = editor.getActiveStyles() as Record<string, unknown>
  const toggle = (style: 'superscript' | 'subscript') => { const opposite = style === 'superscript' ? 'subscript' : 'superscript'; if (active[opposite]) editor.removeStyles({ [opposite]: true }); editor.toggleStyles({ [style]: true }); render((value) => value + 1) }
  return <FormattingToolbar>{getFormattingToolbarItems()}<BasicTextStyleButton basicTextStyle="code" /><TextAlignButton textAlignment="justify" /><Components.FormattingToolbar.Button label="Sobrescrito" mainTooltip="Sobrescrito" isSelected={Boolean(active.superscript)} onClick={() => toggle('superscript')}>x²</Components.FormattingToolbar.Button><Components.FormattingToolbar.Button label="Subscrito" mainTooltip="Subscrito" isSelected={Boolean(active.subscript)} onClick={() => toggle('subscript')}>x₂</Components.FormattingToolbar.Button><Components.FormattingToolbar.Button label="Limpar formatação" mainTooltip="Limpar formatação" onClick={() => { editor.removeStyles(editor.getActiveStyles()); render((value) => value + 1) }}>Limpar</Components.FormattingToolbar.Button></FormattingToolbar>
}

export const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor({ note, onChange, onReady, onAssetError }, ref) {
  const { settings } = useSettings()
  const urls = useRef(new Map<string, string>())
  const editor = useCreateBlockNote({
    schema: noteEditorSchema,
    dictionary: pt,
    initialContent: note.blocks as PartialBlock<typeof noteEditorSchema.blockSchema, typeof noteEditorSchema.inlineContentSchema, typeof noteEditorSchema.styleSchema>[],
    uploadFile: async (file) => `${ASSET_PREFIX}${(await notesRepository.saveAsset(file)).id}`,
    resolveFileUrl: async (url) => {
      if (!url.startsWith(ASSET_PREFIX)) return url
      const id = url.slice(ASSET_PREFIX.length); const cached = urls.current.get(id); if (cached) return cached
      const asset = await notesRepository.getAsset(id); if (!asset) { onAssetError?.('Uma imagem desta anotação não está mais disponível neste navegador. Restaure um backup que contenha o arquivo.'); return MISSING_IMAGE }
      const objectUrl = URL.createObjectURL(asset.blob); urls.current.set(id, objectUrl); return objectUrl
    },
  }, [note.id])

  useImperativeHandle(ref, () => ({ focus: () => editor.focus(), html: () => editor.blocksToFullHTML(editor.document), markdown: () => editor.blocksToMarkdownLossy(editor.document), blocks: () => editor.document as unknown as NoteBlock[] }), [editor])
  useEffect(() => { onReady?.(); return () => { urls.current.forEach((url) => URL.revokeObjectURL(url)); urls.current.clear() } }, [onReady])

  const getItems = async (query: string) => {
    const defaults = getDefaultReactSlashMenuItems(editor).map((item) => ({ ...item, aliases: [...(item.aliases ?? []), item.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()] }))
    const callouts = ([['info', 'Informação'], ['tip', 'Dica'], ['warning', 'Atenção'], ['success', 'Sucesso']] as const).map(([variant, title]) => ({
      title, subtext: `Bloco de destaque: ${title.toLocaleLowerCase('pt-BR')}`, aliases: [title.toLocaleLowerCase('pt-BR'), 'aviso', 'callout', 'destaque'], group: 'Destaques', icon: <Info size={18} />,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'callout', props: { variant } }),
    }))
    return filterSuggestionItems([...defaults, ...callouts], query)
  }

  return <div className="notes-rich-editor" data-note-id={note.id}>
    <BlockNoteView editor={editor as NoteEditor} theme={settings.theme} slashMenu={false} sideMenu={false} formattingToolbar={false} onChange={(current) => { const blocks = current.document as unknown as NoteBlock[]; onChange(blocks, blocksToText(blocks)) }}>
      <SuggestionMenuController triggerCharacter="/" getItems={getItems} />
      <SideMenuController sideMenu={() => <SideMenu dragHandleMenu={NotesBlockMenu} />} />
      <FormattingToolbarController formattingToolbar={NotesFormattingToolbar} />
    </BlockNoteView>
  </div>
})
