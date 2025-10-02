import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { resolveAvatar } from '../utils/avatar'

const statusOptions = [
  { value: 'mensalista', label: 'Mensalista' },
  { value: 'avulso', label: 'Avulso' },
]

function formatStatus(status) {
  return status === 'mensalista' ? 'Mensalista' : 'Avulso'
}

export default function AdminUsers() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState(null)
  const [success, setSuccess] = useState('')
  const [pendingStatus, setPendingStatus] = useState({})

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    if (user.role !== 'admin') {
      navigate('/')
    }
  }, [user, navigate])

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await api.get('/users')
        setUsers(response.data)
      } catch (err) {
        setError('Não foi possível carregar a lista de usuários.')
      } finally {
        setLoading(false)
      }
    }

    if (user?.role === 'admin') {
      fetchUsers()
    }
  }, [user])

  const sortedUsers = useMemo(() => users.slice().sort((a, b) => a.name.localeCompare(b.name)), [users])

  const handleStatusChange = (userId, value) => {
    setPendingStatus((prev) => ({ ...prev, [userId]: value }))
  }

  const handleSave = async (userId) => {
    const newStatus = pendingStatus[userId]
    if (!newStatus || savingId) {
      return
    }
    setSavingId(userId)
    setError('')
    setSuccess('')
    try {
      const response = await api.patch(`/admin/users/${userId}/status`, {
        status: newStatus,
      })
      setUsers((prev) => prev.map((item) => (item.id === userId ? response.data : item)))
      setPendingStatus((prev) => ({ ...prev, [userId]: undefined }))
      setSuccess('Status atualizado com sucesso!')
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Não foi possível atualizar o status.'
      setError(detail)
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <p>Carregando usuários...</p>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Gerenciar usuários</h1>
        <p>Defina quem é mensalista ou avulso. Apenas administradores podem alterar este status.</p>
        {error && <p>{error}</p>}
        {success && <p>{success}</p>}
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {sortedUsers.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded shadow p-4 mb-4 flex items-center space-x-4"
            >
              <img
                src={resolveAvatar(item, 64)}
                alt={item.name}
                className="w-12 h-12 rounded-full object-cover border border-slate-200"
              />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{item.name}</p>
                <p className="text-sm text-slate-600 truncate">{item.email}</p>
                <p className="text-xs text-slate-500">Status atual: {formatStatus(item.status)}</p>
              </div>
              <div className="flex flex-col items-end space-y-2">
                <select
                  value={pendingStatus[item.id] ?? item.status}
                  onChange={(event) => handleStatusChange(item.id, event.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-sm text-slate-700"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  className="rounded bg-gray-900 px-3 py-1 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
                  onClick={() => handleSave(item.id)}
                  disabled={savingId === item.id}
                >
                  {savingId === item.id ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
