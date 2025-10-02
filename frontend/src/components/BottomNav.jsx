import { Link } from 'react-router-dom'

const iconSets = {
  superadmin: [
    { emoji: '📂', label: 'Grupos', to: '/groups' },
    { emoji: '📨', label: 'Convites', to: '/invite-admin' },
    { emoji: '🧑', label: 'Perfil', to: '/profile' },
  ],
  admin: [
    { emoji: '📨', label: 'Convites', to: '/invite-user' },
    { emoji: '⚽', label: 'Partidas', to: '/games' },
    { emoji: '🧑', label: 'Perfil', to: '/profile' },
  ],
  user: [
    { emoji: '⚽', label: 'Partidas', to: '/games' },
    { emoji: '🧑', label: 'Perfil', to: '/profile' },
  ],
}

export default function BottomNav({ role = 'user' }) {
  const items = iconSets[role] ?? iconSets.user

  return (
    <nav className="fixed bottom-0 left-0 right-0 block md:hidden bg-gray-900 text-white py-2 shadow-lg">
      <ul className="mx-auto flex max-w-sm items-center justify-around">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              to={item.to}
              className="flex flex-col items-center gap-1 text-2xl"
            >
              <span role="img" aria-hidden="true">
                {item.emoji}
              </span>
              <span className="text-xs block">{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
