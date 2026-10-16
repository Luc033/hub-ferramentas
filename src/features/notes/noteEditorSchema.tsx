import { BlockNoteSchema, createStyleSpec, defaultBlockSpecs, defaultInlineContentSpecs, defaultStyleSpecs } from '@blocknote/core'
import { createReactBlockSpec } from '@blocknote/react'

export const calloutBlock = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: { variant: { default: 'info', values: ['info', 'tip', 'warning', 'success'] as const } },
    content: 'inline',
  },
  {
    render: ({ block, contentRef }) => {
      const icons = { info: 'ⓘ', tip: '💡', warning: '⚠', success: '✓' }
      return <aside className={`note-callout note-callout-${block.props.variant}`}><span aria-hidden>{icons[block.props.variant]}</span><div ref={contentRef} className="min-w-0 flex-1" /></aside>
    },
  },
)

const superscript = createStyleSpec({ type: 'superscript', propSchema: 'boolean' }, { render: () => { const dom = document.createElement('sup'); return { dom, contentDOM: dom } }, toExternalHTML: () => { const dom = document.createElement('sup'); return { dom, contentDOM: dom } }, parse: (element) => element.tagName === 'SUP' ? true : undefined })
const subscript = createStyleSpec({ type: 'subscript', propSchema: 'boolean' }, { render: () => { const dom = document.createElement('sub'); return { dom, contentDOM: dom } }, toExternalHTML: () => { const dom = document.createElement('sub'); return { dom, contentDOM: dom } }, parse: (element) => element.tagName === 'SUB' ? true : undefined })

export const noteEditorSchema = BlockNoteSchema.create({ blockSpecs: defaultBlockSpecs, inlineContentSpecs: defaultInlineContentSpecs, styleSpecs: defaultStyleSpecs }).extend({ blockSpecs: { callout: calloutBlock() }, styleSpecs: { superscript, subscript } })
export type NoteEditor = typeof noteEditorSchema.BlockNoteEditor
