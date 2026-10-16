interface HubLogoProps {
  size?: number
  className?: string
  decorative?: boolean
}

export function HubLogo({ size = 56, className = '', decorative = false }: HubLogoProps) {
  return <img
    src="/hub-logo.svg?v=1"
    width={size}
    height={size}
    className={`block shrink-0 ${className}`}
    alt={decorative ? '' : 'Hub'}
    aria-hidden={decorative || undefined}
  />
}
