import { useState } from 'react'
import { AnimatedOutlet } from './AnimatedOutlet'
import { Header } from './Header'
import { MobileNav } from './MobileNav'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[1680px] overflow-x-clip px-4 pb-[40px] pt-4 sm:px-6 sm:pt-[22px] xl:px-[33px]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-contrast focus:px-4 focus:py-2 focus:text-on-contrast"
      >
        Saltar al contenido
      </a>
      <Header onOpenMenu={() => setMenuOpen(true)} />
      <div className="mt-[24px] flex gap-[28px]">
        <Sidebar />
        <main id="main" className="min-w-0 flex-1">
          <AnimatedOutlet />
        </main>
      </div>
      <MobileNav open={menuOpen} onClose={() => setMenuOpen(false)} />
    </div>
  )
}
