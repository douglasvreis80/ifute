import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'

const emptyRow = (groupId = '') => ({ name: '', email: '', group_id: groupId })

export default function SuperadminInvitations() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [rows, setRows] = useState([emptyRow('')])
  const [invitations, setInvitations] = useState([])
  const [loadingInvites, setLoadingInvites] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [skipped, setSkipped] = useState([])
  const [groupFilter, setGroupFilter] = useState('')

  const isSuperadmin = user?.role === 'superadmin'

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    if (!isSuperadmin) {
      navigate('/')
    }
  }, [user, isSuperadmin, navigate])

  useEffect(() => {
    if (!isSuperadmin) return
    const initialize = async () => {
      await Promise.all([fetchGroups(), fetchInvitations(groupFilter)])
    }
    initialize()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperadmin])

  useEffect(() => {
    if (!isSuperadmin) return
    fetchInvitations(groupFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupFilter])

  const fetchGroups = async () => {
    try {
      const response = await api.get('/groups')
      setGroups(response.data)
      if (response.data.length > 0) {
        setRows([emptyRow(String(response.data[0].id))])
      }
    } catch (err) {
      setError('Não foi possível carregar a lista de grupos.')
    }
  }

  const fetchInvitations = async (targetGroupId = '') => {
    setLoadingInvites(true)
    setError('')
    try {
      const params = {}
      if (targetGroupId) {
        params.group_id = Number(targetGroupId)
      }
      const response = await api.get('/superadmin/invitations', { params })
      setInvitations(response.data)
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível carregar os convites.'
      setError(message)
    } finally {
      setLoadingInvites(false)
    }
  }

  const handleRowChange = (index, field, value) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)))
  }

  const handleAddRow = () => {
    const defaultGroup = rows[rows.length - 1]?.group_id || (groups[0]?.id ? String(groups[0].id) : '')
    setRows((prev) => [...prev, emptyRow(defaultGroup)])
  }

  const handleRemoveRow = (index) => {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSkipped([])

    if (groups.length === 0) {
      setError('Cadastre um grupo antes de enviar convites para administradores.')
      return
    }

    const invitationsPayload = rows
      .map((row) => ({
        name: row.name.trim(),
        email: row.email.trim(),
        group_id: row.group_id ? Number(row.group_id) : null,
      }))
      .filter((row) => row.name && row.email && row.group_id)

    if (invitationsPayload.length === 0) {
      setError('Informe ao menos um convidado com nome, e-mail e grupo.')
      return
    }

    setSending(true)
    try {
      const response = await api.post('/superadmin/invitations', {
        invitations: invitationsPayload,
      })
      const { created, skipped: skippedItems } = response.data || { created: [], skipped: [] }
      const sentCount = created?.length ?? 0
      setSuccess(sentCount > 0 ? `${sentCount} convite(s) de admin enviados.` : 'Nenhum convite novo enviado.')
      setSkipped(skippedItems ?? [])
      setRows([emptyRow(groups[0]?.id ? String(groups[0].id) : '')])
      fetchInvitations(groupFilter)
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
        <h1>Convites para administradores</h1>
        <p className="text-sm text-slate-600">
          Envie convites vinculando cada administrador diretamente ao grupo correspondente.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-slate-600">Nome</label>
                <input
                  type="text"
                  value={row.name}
                  onChange={(event) => handleRowChange(index, 'name', event.target.value)}
                  placeholder="Nome do admin"
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-slate-600">E-mail</label>
                <input
                  type="email"
                  value={row.email}
                  onChange={(event) => handleRowChange(index, 'email', event.target.value)}
                  placeholder="admin@exemplo.com"
                  className="rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/40"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-semibold text-slate-600">Grupo</label>
                <select
                  value={row.group_id}
                  onChange={(event) => handleRowChange(index, 'group_id', event.target.value)}
                  className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-gray-900/40"
                >
                  <option value="">Selecione</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
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
              Adicionar administrador
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
                <li key={`${item.email}-${item.group_id || 'none'}`}>
                  {item.name} ({item.email}) — {item.reason === 'email_exists' ? 'E-mail já cadastrado' : item.reason}
                  {item.group_id ? ` (grupo ${item.group_id})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="card">
        <div className="section-title">
          <h2>Histórico de convites</h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
              className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-gray-900/40"
            >
              <option value="">Todos os grupos</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <button
              className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-gray-100 transition-colors"
              onClick={() => fetchInvitations(groupFilter)}
              disabled={loadingInvites}
            >
              {loadingInvites ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
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
