import { act, render, screen } from '@testing-library/react'
import { useOnlineStatus } from './useOnlineStatus'

function Status() { return <span>{useOnlineStatus() ? 'online' : 'offline'}</span> }

test('acompanha mudanças de conectividade publicadas pelo navegador', () => {
  let online = true
  const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'onLine')
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
  try {
    render(<Status />)
    expect(screen.getByText('online')).toBeInTheDocument()
    act(() => { online = false; window.dispatchEvent(new Event('offline')) })
    expect(screen.getByText('offline')).toBeInTheDocument()
    act(() => { online = true; window.dispatchEvent(new Event('online')) })
    expect(screen.getByText('online')).toBeInTheDocument()
  } finally {
    if (descriptor) Object.defineProperty(navigator, 'onLine', descriptor)
    else Reflect.deleteProperty(navigator, 'onLine')
  }
})
