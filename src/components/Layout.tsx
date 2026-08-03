import { NavLink, Outlet } from 'react-router-dom'
import { NAV } from '../lib/api'

export function Layout() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <p className="brand">
          MZA <span>·</span> kitchen
        </p>
        <p className="tagline">აღრიცხვა · წარმოება · მოგება</p>
        <nav>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
