import { noteEditorSchema } from './noteEditorSchema'

test('mantém os blocos profissionais e estilos avançados no schema persistente', () => {
  expect(Object.keys(noteEditorSchema.blockSchema)).toEqual(expect.arrayContaining(['paragraph', 'heading', 'bulletListItem', 'numberedListItem', 'checkListItem', 'quote', 'codeBlock', 'divider', 'table', 'image', 'toggleListItem', 'callout']))
  expect(Object.keys(noteEditorSchema.styleSchema)).toEqual(expect.arrayContaining(['bold', 'italic', 'underline', 'strike', 'code', 'textColor', 'backgroundColor', 'superscript', 'subscript']))
})
