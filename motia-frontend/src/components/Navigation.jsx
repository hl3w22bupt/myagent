import { NavLink } from 'react-router-dom'
import './Navigation.css'

function Navigation() {
  const navItems = [
    { path: '/', label: '首页' },
    { path: '/tasks', label: '任务' },
    { path: '/skills', label: '技能' },
    { path: '/agents', label: '子代理' },
    { path: '/settings', label: '设置' }
  ]

  return (
    <nav className="navigation">
      <div className="nav-brand">
        <h1>Motia Agent Dashboard</h1>
      </div>
      <ul className="nav-menu">
        {navItems.map((item, index) => (
          <li key={item.path} className={`nav-item ${item.path === '/settings' ? 'nav-item-settings' : ''}`}>
            <NavLink
              to={item.path}
              className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}
            >
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default Navigation