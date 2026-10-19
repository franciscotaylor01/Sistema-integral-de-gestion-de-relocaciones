import type { ReactNode } from 'react'
import { countryNames } from '@/config/catalogs'
import { cn } from '@/lib/cn'
import type { CountryCode, CurrencyCode } from '@/types/domain'

/*
 * Small circular flags — inline SVG, no external assets (Vertix approach,
 * extended to the countries and currencies Relocare operates with).
 */

type FlagKey = CountryCode | 'EU'

const stripesH = (colors: string[]) =>
  colors.map((c, i) => <rect key={i} y={(32 / colors.length) * i} width="32" height={32 / colors.length + 0.2} fill={c} />)

const stripesV = (colors: string[]) =>
  colors.map((c, i) => <rect key={i} x={(32 / colors.length) * i} width={32 / colors.length + 0.2} height="32" fill={c} />)

const usStripes = Array.from({ length: 7 }, (_, i) => <rect key={i} y={i * 4.92} width="32" height="2.46" fill="#d22f3c" />)

const flags: Record<FlagKey, ReactNode> = {
  US: (
    <>
      <rect width="32" height="32" fill="#fff" />
      {usStripes}
      <rect width="15" height="17" fill="#2d3f8f" />
      {[3, 7, 11].flatMap((x) =>
        [3.5, 8.5, 13.5].map((y) => <circle key={`${x}-${y}`} cx={x + (y === 8.5 ? 2 : 0)} cy={y} r="0.9" fill="#fff" />),
      )}
    </>
  ),
  GB: (
    <>
      <rect width="32" height="32" fill="#2b3c8f" />
      <path d="M0 0L32 32M32 0L0 32" stroke="#fff" strokeWidth="6" />
      <path d="M0 0L32 32M32 0L0 32" stroke="#d22f3c" strokeWidth="2" />
      <path d="M16 0V32M0 16H32" stroke="#fff" strokeWidth="9" />
      <path d="M16 0V32M0 16H32" stroke="#d22f3c" strokeWidth="5" />
    </>
  ),
  JP: (
    <>
      <rect width="32" height="32" fill="#fff" />
      <circle cx="16" cy="16" r="7" fill="#d22f3c" />
    </>
  ),
  CH: (
    <>
      <rect width="32" height="32" fill="#d8262c" />
      <path d="M13.5 8h5v5.5H24v5h-5.5V24h-5v-5.5H8v-5h5.5z" fill="#fff" />
    </>
  ),
  CA: (
    <>
      <rect width="32" height="32" fill="#fff" />
      <rect width="8" height="32" fill="#d8262c" />
      <rect x="24" width="8" height="32" fill="#d8262c" />
      <path d="M16 9l1.6 3.4 2.6-.9-1 4.4 2.2-.6-.8 2.4 1.6 1.1-4.6.9.4 2.8h-4l.4-2.8-4.6-.9 1.6-1.1-.8-2.4 2.2.6-1-4.4 2.6.9z" fill="#d8262c" />
    </>
  ),
  DE: <>{stripesH(['#1f1f1f', '#dd2a2a', '#f5c400'])}</>,
  AR: (
    <>
      {stripesH(['#74acdf', '#ffffff', '#74acdf'])}
      <circle cx="16" cy="16" r="3" fill="#f6b40e" />
    </>
  ),
  BR: (
    <>
      <rect width="32" height="32" fill="#229e45" />
      <path d="M16 5L29 16L16 27L3 16z" fill="#f8e509" />
      <circle cx="16" cy="16" r="6" fill="#2b49a3" />
    </>
  ),
  CL: (
    <>
      <rect width="32" height="16" fill="#fff" />
      <rect y="16" width="32" height="16" fill="#d52b1e" />
      <rect width="14" height="16" fill="#0039a6" />
      <circle cx="7" cy="8" r="2.2" fill="#fff" />
    </>
  ),
  CO: (
    <>
      <rect width="32" height="16" fill="#fcd116" />
      <rect y="16" width="32" height="8" fill="#003893" />
      <rect y="24" width="32" height="8" fill="#ce1126" />
    </>
  ),
  MX: (
    <>
      {stripesV(['#006847', '#ffffff', '#ce1126'])}
      <circle cx="16" cy="16" r="2.6" fill="#8c6b3e" />
    </>
  ),
  UY: (
    <>
      {stripesH(['#fff', '#0038a8', '#fff', '#0038a8', '#fff', '#0038a8', '#fff', '#0038a8', '#fff'])}
      <rect width="14" height="14" fill="#fff" />
      <circle cx="7" cy="7" r="3.4" fill="#fcd116" />
    </>
  ),
  ES: <>{stripesH(['#c60b1e', '#ffc400', '#ffc400', '#c60b1e'])}</>,
  FR: <>{stripesV(['#0055a4', '#ffffff', '#ef4135'])}</>,
  NL: <>{stripesH(['#ae1c28', '#ffffff', '#21468b'])}</>,
  EU: (
    <>
      <rect width="32" height="32" fill="#2b3c8f" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return <circle key={i} cx={16 + Math.cos(a) * 8} cy={16 + Math.sin(a) * 8} r="1.2" fill="#f5c400" />
      })}
    </>
  ),
}

const currencyFlag: Record<CurrencyCode, FlagKey> = {
  USD: 'US',
  EUR: 'EU',
  ARS: 'AR',
  BRL: 'BR',
  MXN: 'MX',
  GBP: 'GB',
  CLP: 'CL',
}

function FlagSvg({ code, label, className }: { code: FlagKey; label?: string; className?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn('inline-block size-4 shrink-0 overflow-hidden rounded-full ring-1 ring-black/5', className)}
    >
      <svg viewBox="0 0 32 32" className="size-full">
        {flags[code]}
      </svg>
    </span>
  )
}

export function Flag({ country, className, labelled }: { country: CountryCode; className?: string; labelled?: boolean }) {
  return <FlagSvg code={country} className={className} label={labelled ? countryNames[country] : undefined} />
}

export function CurrencyFlag({ currency, className }: { currency: CurrencyCode; className?: string }) {
  return <FlagSvg code={currencyFlag[currency]} className={className} />
}
