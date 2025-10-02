import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'

const emptyRow = () => ({ name: '', email: '' })

export default function AdminInvitations() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rows, setRows] = useState([emptyRow()])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [skipped, setSkipped] = useState([])
  const [groupInfo, setGroupInfo] = useState(null)

  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    if (!isAdmin) {
      navigate('/')
      return
    }
    const initialize = async () => {
      await Promise.all([fetchGroupInfo(), fetchInvitations()])
    }
    initialize()
  }, [user, isAdmin, navigate])

  const fetchGroupInfo = async () => {
    if (!isAdmin || !user?.group_id) {
      setGroupInfo(null)
      return
    }
    try {
      const response = await api.get('/groups')
      const target = response.data.find((group) => group.id === user.group_id)
      if (target) {
        setGroupInfo(target)
      }
    } catch (err) {
      console.error('Não foi possível carregar informações do grupo.', err)
    }
  }

  const fetchInvitations = async () => {
    if (!isAdmin) return
    if (!user?.group_id) {
      setError('Associe o administrador a um grupo antes de enviar convites.')
      setInvitations([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const response = await api.get('/admin/invitations')
      setInvitations(response.data)
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível carregar os convites.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleRowChange = (index, field, value) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  const handleAddRow = () => {
    setRows((prev) => [...prev, emptyRow()])
  }

  const handleRemoveRow = (index) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSkipped([])

    if (!user?.group_id) {
      setError('Associe o administrador a um grupo antes de enviar convites.')
      return
    }

    const invitationsPayload = rows
      .map((row) => ({ name: row.name.trim(), email: row.email.trim() }))
      .filter((row) => row.name && row.email)

    if (invitationsPayload.length === 0) {
      setError('Adicione pelo menos um convidado com nome e e-mail válidos.')
      return
    }

    setSending(true)
    try {
      const response = await api.post('/admin/invitations', { invitations: invitationsPayload })
      const { created, skipped: skippedItems } = response.data || { created: [], skipped: [] }
      const sentCount = created?.length ?? 0
      setSuccess(sentCount > 0 ? `${sentCount} convite(s) enviados com sucesso.` : 'Nenhum convite novo enviado.')
      setSkipped(skippedItems ?? [])
      setRows([emptyRow()])
      fetchInvitations()
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível enviar os convites.'
      setError(message)
    } finally {
      setSending(false)
    }
  }

  const sortedInvitations = useMemo(
    () => invitations.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [invitations],
  )

  return (
    <div className="container">
      <div className="card">
        <h1>Convites em massa</h1>
        <p className="text-sm text-slate-600">
          Envios serão vinculados automaticamente ao seu grupo
          {groupInfo ? ` (${groupInfo.name})` : user?.group_id ? ` (ID ${user.group_id})` : ''}.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_auto]">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-slate-600">Nome</label>
                <input
                  type="text"
                  value={row.name}
                  onChange={(event) => handleRowChange(index, 'name', event.target.value)}
                  placeholder="Nome do convidado"
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-slate-600">E-mail</label>
                <input
                  type="email"
                  value={row.email}
                  onChange={(event) => handleRowChange(index, 'email', event.target.value)}
                  placeholder="email@exemplo.com"
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/40"
                />
              </div>
              <div className="flex items-end justify-end">
                <button
                  type="button"
                  className="rounded border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
                  onClick={() => handleRemoveRow(index)}
                  disabled={rows.length === 1}
                >
                  Remover
                </button>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-gray-100 transition-colors"
              onClick={handleAddRow}
            >
              Adicionar convidado
            </button>
            <button
              className="rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors disabled:opacity-70"
              type="submit"
              disabled={sending}
            >
              {sending ? 'Enviando...' : 'Enviar convites'}
            </button>
          </div>
        </form>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {success && <p className="mt-4 text-sm text-emerald-600">{success}</p>}
        {skipped.length > 0 && (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <strong className="block font-semibold">Convites não enviados</strong>
            <ul className="mt-2 space-y-1">
              {skipped.map((item) => (
                <li key={item.email}>
                  {item.name} ({item.email}) — {item.reason === 'email_exists' ? 'E-mail já cadastrado' : item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">
          <h2>Histórico de convites</h2>
          <button className="secondary-button" onClick={fetchInvitations} disabled={loading}>
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
        {sortedInvitations.length === 0 ? (
          <p>Nenhum convite enviado até o momento.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {sortedInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className="bg-white rounded shadow p-4 mb-4 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{invitation.name}</p>
                    <p className="text-sm text-gray-600">{invitation.email}</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {invitation.group?.name || `Grupo ${invitation.group_id}`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Status: {invitation.status}</span>
                  <span>Expira: {new Date(invitation.expires_at).toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Enviado: {new Date(invitation.created_at).toLocaleString('pt-BR')}</span>
                  <span>
                    Concluído:{' '}
                    {invitation.accepted_at
                      ? new Date(invitation.accepted_at).toLocaleString('pt-BR')
                      : '—'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
