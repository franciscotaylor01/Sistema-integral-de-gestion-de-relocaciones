import { Menu, Search } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { utilityButton } from '@/components/ui/buttonStyles'
import { LogoMark } from '@/components/ui/Logo'
import { brand } from '@/config/brand'
import { HelpMenu } from './HelpMenu'
import { NotificationsMenu } from './NotificationsMenu'
import { SearchDialog } from './SearchDialog'
import { TopNav } from './TopNav'
import { UserMenu } from './UserMenu'

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [searchOpen, setSearchOpen] = useState(false)
  const searchButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    searchButtonRef.current?.focus()
  }, [])

  return (
    <header className="flex h-[52px] items-center justify-between gap-3 sm:h-[58px] sm:gap-6">
      <div className="flex h-full items-center gap-3">
        <button
          type="button"
          aria-label="Abrir menú"
          onClick={onOpenMenu}
          className="grid size-[52px] shrink-0 place-items-center rounded-full bg-surface text-ink shadow-pill transition-[background-color,transform] duration-200 ease-soft hover:bg-surface-muted active:scale-[0.94] sm:size-[58px] xl:hidden"
        >
          <Menu className="size-[20px]" strokeWidth={1.8} />
        </button>
        <Link
          to="/"
          aria-label={`${brand.productName} — ${brand.productFullName}, inicio`}
          title={brand.productFullName}
          className="flex h-full items-center gap-[12px] rounded-full bg-surface pl-[6px] pr-[6px] shadow-pill sm:pl-[8px] sm:pr-[24px]"
        >
          <LogoMark className="size-[40px] sm:size-[41px]" />
          <span className="hidden sm:block">
            <span className="block text-[17px] font-semibold leading-[1.15] tracking-[-0.01em]">{brand.productName}</span>
            <span className="block text-[11.5px] leading-[1.35] text-muted">{brand.clientName}</span>
          </span>
        </Link>
      </div>

      <TopNav className="hidden xl:block" />

      <div className="flex h-full items-center gap-[10px] sm:gap-[15px]">
        <div className="flex h-full items-center gap-[2px] rounded-full bg-surface px-[4px] shadow-pill sm:gap-[4px] sm:px-[7px]">
          <button
            ref={searchButtonRef}
            type="button"
            aria-label="Buscar (⌘K)"
            title="Buscar (⌘K)"
            onClick={() => setSearchOpen(true)}
            className={utilityButton}
          >
            <Search className="size-[20px] transition-transform duration-300 ease-soft group-hover:scale-[1.08]" strokeWidth={1.8} />
          </button>
          <NotificationsMenu />
          <HelpMenu className="hidden sm:block" />
        </div>
        <UserMenu />
      </div>

      <SearchDialog open={searchOpen} onClose={closeSearch} />
    </header>
  )
}
