import { render, screen } from '@testing-library/react'
import { HubLogo } from './HubLogo'

test('usa o asset oficial centralizado sem alterar sua proporção', () => {
  render(<HubLogo size={64} />)
  const logo = screen.getByRole('img', { name: 'Hub' })
  expect(logo).toHaveAttribute('src', '/hub-logo.svg?v=1')
  expect(logo).toHaveAttribute('width', '64')
  expect(logo).toHaveAttribute('height', '64')
})

test('permite uso decorativo sem duplicar a descrição acessível', () => {
  const { container } = render(<HubLogo size={40} decorative />)
  expect(container.querySelector('img')).toHaveAttribute('aria-hidden', 'true')
})
