import type { ServerInfo } from '@tentenv/protocol'
import { useState } from 'react'

const DEFAULT_NAME = 'TenTenV'
const DEFAULT_LOGO = '/icon.svg'

export const brandingOf = (info: ServerInfo | null, server: string | null) => {
  const name = info?.branding?.siteName?.trim() || DEFAULT_NAME
  const path = info?.branding?.logoUrl
  let logo = DEFAULT_LOGO
  if (path && server) {
    try {
      const url = new URL(path, server)
      if (url.protocol === 'http:' || url.protocol === 'https:') logo = url.href
    } catch { /* 標準のロゴを使う */ }
  }
  return {
    name,
    logo,
    layout: logo !== DEFAULT_LOGO && info?.branding?.logoLayout === 'wide' ? 'wide' as const : 'icon' as const,
  }
}

export const applyBrowserBranding = (info: ServerInfo | null, server: string | null) => {
  const { name, logo } = brandingOf(info, server)
  document.title = name
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (icon) {
    icon.href = logo
    if (logo.endsWith('.svg')) icon.type = 'image/svg+xml'
    else icon.removeAttribute('type')
  }
}

export const fallbackLogoOnError = (image: HTMLImageElement) => {
  if (!image.src.endsWith(DEFAULT_LOGO)) image.src = DEFAULT_LOGO
}

export const Brand: React.FC<{ info: ServerInfo | null; server: string | null; className: string; logoSize?: number; style?: React.CSSProperties }> = ({ info, server, className, logoSize, style }) => {
  const { name, logo, layout } = brandingOf(info, server)
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const failed = failedLogo === logo
  const wide = layout === 'wide' && !failed
  return <div className={`${className}${wide ? ' brand-wide' : ''}`} style={style}>
    <img src={failed ? DEFAULT_LOGO : logo} alt="" style={!wide && logoSize ? { width: logoSize, height: logoSize } : undefined} onError={() => { if (logo !== DEFAULT_LOGO) setFailedLogo(logo) }} />
    <span className="brand-name">{name}</span>
  </div>
}
