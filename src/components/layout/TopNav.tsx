import { motion } from 'motion/react'
import { NavLink } from 'react-router'
import { primaryNav } from '@/config/navigation'
import { cn } from '@/lib/cn'

export function TopNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Secciones principales" className={cn('rounded-full bg-surface p-[6px] shadow-pill', className)}>
      <ul className="flex items-center">
        {primaryNav.map((item) => (
          <li key={item.id}>
            <NavLink
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                cn(
                  'relative flex h-[45px] items-center rounded-full px-[16px] text-[15px] 2xl:px-[22px] 2xl:text-[16px] transition-[color,transform] duration-200 ease-soft active:scale-[0.97]',
                  isActive ? 'text-on-contrast' : 'text-ink-secondary hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="top-nav-active"
                      className="absolute inset-0 rounded-full bg-contrast"
                      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                    />
                  )}
                  <span className="relative">{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
