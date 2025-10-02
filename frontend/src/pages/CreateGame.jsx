import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'

const initialState = {
  name: '',
  location: '',
  scheduled_at: '',
  max_players: 10,
  convocation_deadline: '',
  auto_convocar_mensalistas: false,
  convocation_user_ids: [],
}

export default function CreateGame() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(initialState)
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!isAdmin) return
    const fetchUsers = async () => {
      setLoadingUsers(true)
      try {
        const response = await api.get('/users')
        setUsers(response.data)
      } catch (err) {
        setError('Não foi possível carregar a lista de jogadores.')
      } finally {
        setLoadingUsers(false)
      }
    }

    fetchUsers()
  }, [isAdmin])

  const handleChange = (event) => {
    const { name, value, checked } = event.target
    if (name === 'convocation_user_ids') {
      const values = Array.from(event.target.selectedOptions).map((option) => Number(option.value))
      setForm((prev) => ({ ...prev, convocation_user_ids: values }))
      return
    }
    if (name === 'auto_convocar_mensalistas') {
      setForm((prev) => ({ ...prev, auto_convocar_mensalistas: checked }))
      return
    }
    setForm((prev) => ({
      ...prev,
      [name]: name === 'max_players' ? Number(value) : value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!isAdmin) return

    if (!user?.group_id) {
      setError('Seu usuário não está vinculado a um grupo. Entre em contato com o administrador.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const payload = {
        name: form.name,
        location: form.location,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        max_players: form.max_players,
        convocation_user_ids: form.convocation_user_ids,
        auto_convocar_mensalistas: form.auto_convocar_mensalistas,
        group_id: user.group_id,
      }
      if (form.convocation_deadline) {
        payload.convocation_deadline = new Date(form.convocation_deadline).toISOString()
      }
      const response = await api.post('/games', payload)
      navigate(`/games/${response.data.id}`)
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível criar a partida. Verifique os dados e tente novamente.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const sortedUsers = useMemo(() => users.slice().sort((a, b) => a.name.localeCompare(b.name)), [users])

  if (!isAdmin) {
    return (
      <div className="container">
        <div className="card">
          <h1>Somente administradores</h1>
          <p>Peça para um admin criar a partida ou ajustar convocações.</p>
          <Link className="secondary-button" to="/">
            Voltar
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Nova partida</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Nome</label>
            <input id="name" name="name" required value={form.name} onChange={handleChange} placeholder="Pelada de sexta" />
          </div>

          <div className="form-group">
            <label htmlFor="location">Local</label>
            <input id="location" name="location" required value={form.location} onChange={handleChange} placeholder="Quadra do bairro" />
          </div>

          <div className="form-group">
            <label htmlFor="scheduled_at">Data e horário</label>
            <input id="scheduled_at" name="scheduled_at" type="datetime-local" required value={form.scheduled_at} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label htmlFor="max_players">Máximo de jogadores</label>
            <input id="max_players" name="max_players" type="number" min="2" max="40" value={form.max_players} onChange={handleChange} />
          </div>

          <div className="form-group">
            <label htmlFor="convocation_deadline">Prazo para convocados (opcional)</label>
            <input
              id="convocation_deadline"
              name="convocation_deadline"
              type="datetime-local"
              value={form.convocation_deadline}
              onChange={handleChange}
            />
            <small>Deixe em branco para usar o prazo padrão configurado no backend.</small>
          </div>

          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                name="auto_convocar_mensalistas"
                checked={form.auto_convocar_mensalistas}
                onChange={handleChange}
              />
              Convocar automaticamente todos os mensalistas
            </label>
            <small>Ao marcar, todos os usuários com status mensalista entram como convocados pendentes.</small>
          </div>

          <div className="form-group">
            <label htmlFor="convocation_user_ids">Convocados</label>
            <select
              id="convocation_user_ids"
              name="convocation_user_ids"
              multiple
              value={form.convocation_user_ids.map(String)}
              onChange={handleChange}
              size={Math.min(8, Math.max(sortedUsers.length, 4))}
              disabled={loadingUsers}
            >
              {sortedUsers.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name} ({player.role})
                </option>
              ))}
            </select>
          </div>

          {error && <p>{error}</p>}

          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Criando...' : 'Criar partida'}
          </button>
        </form>
      </div>
    </div>
  )
}
