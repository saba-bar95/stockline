import { NavLink, Outlet } from 'react-router-dom'
import { NAV } from '../lib/api'
import { cn } from '../lib/cn'

export function Layout() {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="border-b border-white/10 bg-sidebar text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:border-white/5">
        <div className="flex h-full flex-col px-4 py-5">
          <div className="mb-6 px-2">
            <p className="font-display text-2xl font-semibold tracking-tight">
              MZA <span className="text-teal">·</span> kitchen
            </p>
            <p className="mt-1 text-sm text-white/55">აღრიცხვა · წარმოება · მოგება</p>
          </div>

          <nav className="flex gap-1 overflow-x-auto pb-2 lg:flex-1 lg:flex-col lg:gap-0.5 lg:overflow-y-auto lg:pb-0">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'whitespace-nowrap rounded-lg px-3 py-2.5 text-[0.95rem] font-medium transition',
                    isActive
                      ? 'bg-sidebar-active text-white shadow-sm'
                      : 'text-white/70 hover:bg-sidebar-hover hover:text-white',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto w-full max-w-[1400px]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
