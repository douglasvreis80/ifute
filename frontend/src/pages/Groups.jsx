import { useEffect, useState } from 'react'
import api from '../api'
import { useAuth } from '../context/AuthContext'

export default function Groups() {
  const { user } = useAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({ name: '', description: '' })
  const [creating, setCreating] = useState(false)
  const isSuperadmin = user?.role === 'superadmin'

  const fetchGroups = async () => {
    setLoading(true)
    setListError('')
    try {
      const response = await api.get('/groups')
      setGroups(response.data)
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível carregar os grupos.'
      setListError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGroups()
  }, [])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!isSuperadmin) {
      setFormError('Somente superadmins podem criar grupos.')
      return
    }
    if (!form.name.trim()) {
      setFormError('Informe um nome para o grupo.')
      return
    }
    setFormError('')
    setSuccess('')
    setCreating(true)
    try {
      const response = await api.post('/groups', {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
      })
      setSuccess(`Grupo "${response.data.name}" criado com sucesso!`)
      setForm({ name: '', description: '' })
      fetchGroups()
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível criar o grupo.'
      setFormError(message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1>Grupos</h1>
        <p>Visualize os grupos existentes e crie novos conforme necessário.</p>
        {loading ? (
          <p>Carregando grupos...</p>
        ) : listError ? (
          <p>{listError}</p>
        ) : groups.length === 0 ? (
          <p>Nenhum grupo cadastrado até o momento.</p>
        ) : (
          <ul className="player-list">
            {groups.map((group) => (
              <li key={group.id} style={{ alignItems: 'flex-start', flexDirection: 'column' }}>
                <strong>{group.name}</strong>
                <span style={{ color: '#475569' }}>{group.description || 'Sem descrição'}</span>
                <small style={{ color: '#94a3b8' }}>
                  Criado em {new Date(group.created_at).toLocaleString('pt-BR')}
                </small>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card" style={{ maxWidth: '520px' }}>
        <h2>Novo grupo</h2>
        {isSuperadmin ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group">
              <label htmlFor="groupName">Nome</label>
              <input
                id="groupName"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Nome do grupo"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="groupDescription">Descrição (opcional)</label>
              <textarea
                id="groupDescription"
                name="description"
                value={form.description}
                onChange={handleChange}
                rows={3}
                placeholder="Breve descrição do grupo"
              />
            </div>
            {formError && <p>{formError}</p>}
            {success && <p>{success}</p>}
            <button className="primary-button" type="submit" disabled={creating}>
              {creating ? 'Salvando...' : 'Criar grupo'}
            </button>
          </form>
        ) : (
          <p>Somente superadmins autenticados podem criar novos grupos.</p>
        )}
      </div>
    </div>
  )
}
