import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import BottomNav from './components/BottomNav'
import CreateGame from './pages/CreateGame'
import GameDetail from './pages/GameDetail'
import GameList from './pages/GameList'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import ConfirmAccount from './pages/ConfirmAccount'
import Profile from './pages/Profile'
import AdminUsers from './pages/AdminUsers'
import AdminInvitations from './pages/AdminInvitations'
import Groups from './pages/Groups'
import SuperadminInvitations from './pages/SuperadminInvitations'

export default function App() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const role = user?.role
  const isSuperadmin = role === 'superadmin'
  const isAdmin = role === 'admin'

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-16 md:pb-0">
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-64 md:h-screen bg-gray-900 text-white p-4">
        <Link to="/" className="block text-2xl font-bold mb-6">
          iFute
        </Link>
        <nav className="flex-1 space-y-2">
          {!isSuperadmin && (
            <Link className="block rounded px-3 py-2 hover:bg-gray-700 transition-colors" to="/">
              Jogos
            </Link>
          )}
          {(!user || isSuperadmin) && (
            <Link className="block rounded px-3 py-2 hover:bg-gray-700 transition-colors" to="/groups">
              Grupos
            </Link>
          )}
          {isSuperadmin && (
            <Link
              className="block rounded px-3 py-2 hover:bg-gray-700 transition-colors"
              to="/superadmin/invitations"
            >
              Convites de admins
            </Link>
          )}
          {isAdmin && (
            <>
              <Link className="block rounded px-3 py-2 hover:bg-gray-700 transition-colors" to="/create">
                Criar Jogo
              </Link>
              <Link className="block rounded px-3 py-2 hover:bg-gray-700 transition-colors" to="/admin/users">
                Usuários
              </Link>
              <Link
                className="block rounded px-3 py-2 hover:bg-gray-700 transition-colors"
                to="/admin/invitations"
              >
                Convites
              </Link>
            </>
          )}
          {user && (
            <Link className="block rounded px-3 py-2 hover:bg-gray-700 transition-colors" to="/profile">
              Perfil
            </Link>
          )}
          {!user && (
            <>
              <Link className="block rounded px-3 py-2 hover:bg-gray-700 transition-colors" to="/login">
                Entrar
              </Link>
              <Link className="block rounded px-3 py-2 hover:bg-gray-700 transition-colors" to="/register">
                Registrar
              </Link>
            </>
          )}
        </nav>
        {user && (
          <div className="mt-8 border-t border-gray-700 pt-4 space-y-2">
            <span className="block text-sm text-gray-300">Olá, {user.name}</span>
            <button
              className="w-full rounded px-3 py-2 bg-gray-700 hover:bg-gray-600 text-sm font-semibold transition-colors"
              onClick={handleLogout}
            >
              Sair
            </button>
          </div>
        )}
      </aside>
      <div className="md:ml-64">
        <main className="min-h-screen bg-gray-100 px-4 pt-4 pb-16">
          <Routes>
            <Route path="/" element={<GameList />} />
            <Route path="/games" element={<GameList />} />
            <Route path="/create" element={<CreateGame />} />
            <Route path="/games/:id" element={<GameDetail />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/confirm-account" element={<ConfirmAccount />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/groups" element={<Groups />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/invitations" element={<AdminInvitations />} />
            <Route path="/invite-user" element={<AdminInvitations />} />
            <Route path="/superadmin/invitations" element={<SuperadminInvitations />} />
            <Route path="/invite-admin" element={<SuperadminInvitations />} />
          </Routes>
        </main>
      </div>
      <BottomNav role={role} />
    </div>
  )
}
