import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const navigate = useNavigate()
  const { user, register } = useAuth()
  const [searchParams] = useSearchParams()
  const invitationToken = searchParams.get('token') || ''

  const [isInvited, setIsInvited] = useState(Boolean(invitationToken))
  const [invitationLoading, setInvitationLoading] = useState(false)
  const [invitationError, setInvitationError] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '', preferred_position: '', group_id: '' })
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [groups, setGroups] = useState([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [groupsError, setGroupsError] = useState('')
  const [invitationGroup, setInvitationGroup] = useState(null)
  const [invitationRole, setInvitationRole] = useState('')

  useEffect(() => {
    if (user) {
      navigate('/')
    }
  }, [user, navigate])

  useEffect(() => {
    if (!invitationToken) {
      setIsInvited(false)
      setInvitationError('')
      setInvitationGroup(null)
      return
    }

    const fetchInvitation = async () => {
      setInvitationLoading(true)
      setError('')
      setSuccess('')
      try {
        const response = await api.get(`/auth/invitations/${invitationToken}`)
        const groupData = response.data.group_id
          ? {
              id: response.data.group_id,
              name: response.data.group_name,
              description: response.data.group_description,
            }
          : null
        setForm((prev) => ({
          ...prev,
          name: response.data.name,
          email: response.data.email,
          password: '',
          preferred_position: prev.preferred_position,
          group_id: groupData ? String(groupData.id) : '',
        }))
        setInvitationGroup(groupData)
        setInvitationRole(response.data.role)
        setIsInvited(true)
        setInvitationError('')
      } catch (err) {
        const message = err?.response?.data?.detail || 'Convite inválido ou expirado.'
        setInvitationError(message)
        setIsInvited(false)
        setInvitationGroup(null)
        setInvitationRole('')
      } finally {
        setInvitationLoading(false)
      }
    }

    fetchInvitation()
  }, [invitationToken])

  useEffect(() => {
    if (isInvited) {
      setGroups([])
      setGroupsError('')
      setInvitationRole('')
      return
    }

    const loadGroups = async () => {
      setGroupsLoading(true)
      setGroupsError('')
      try {
        const response = await api.get('/groups')
        setGroups(response.data)
        if (response.data.length > 0 && !form.group_id) {
          setForm((prev) => ({ ...prev, group_id: String(response.data[0].id) }))
        }
        if (response.data.length === 0) {
          setGroupsError('Ainda não há grupos cadastrados. Crie um grupo antes de concluir o cadastro.')
        }
      } catch (err) {
        const message = err?.response?.data?.detail || 'Não foi possível carregar os grupos.'
        setGroupsError(message)
      } finally {
        setGroupsLoading(false)
      }
    }

    loadGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInvited])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (isInvited) {
      if (form.password !== confirmPassword) {
        setError('As senhas não conferem.')
        return
      }
      setSubmitting(true)
      try {
        await api.post('/auth/register-invited', {
          token: invitationToken,
          password: form.password,
          preferred_position: form.preferred_position || undefined,
        })
        setSuccess('Cadastro concluído! Você já pode fazer login.')
        setTimeout(() => navigate('/login'), 2000)
      } catch (err) {
        const message = err?.response?.data?.detail || 'Não foi possível completar o cadastro.'
        setError(message)
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (!form.group_id) {
      setError('Selecione um grupo para se cadastrar.')
      return
    }

    setSubmitting(true)
    try {
      const response = await register({
        name: form.name,
        email: form.email,
        password: form.password,
        group_id: Number(form.group_id),
      })
      setSuccess(response?.message || 'Cadastro realizado! Verifique seu e-mail para confirmar a conta.')
      const defaultGroup = groups[0]?.id ? String(groups[0].id) : ''
      setForm({ name: '', email: '', password: '', preferred_position: '', group_id: defaultGroup })
      setConfirmPassword('')
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível concluir o cadastro.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const title = isInvited ? 'Complete seu cadastro' : 'Criar conta'

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '520px', margin: '2rem auto' }}>
        <h1>{title}</h1>
        {invitationLoading ? (
          <p>Validando convite...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            {isInvited && invitationRole && (
              <div className="form-group">
                <label>Papel do convite</label>
                <input value={invitationRole === 'admin' ? 'Administrador' : 'Usuário'} readOnly style={{ width: '100%' }} />
              </div>
            )}
            <div className="form-group">
              <label htmlFor="group_id">Grupo</label>
              {isInvited ? (
                invitationGroup ? (
                  <div>
                    <input type="text" value={invitationGroup.name} readOnly style={{ width: '100%' }} />
                    {invitationGroup.description && (
                      <small style={{ display: 'block', marginTop: '0.25rem' }}>{invitationGroup.description}</small>
                    )}
                  </div>
                ) : (
                  <p>Convite sem grupo associado.</p>
                )
              ) : groupsLoading ? (
                <p>Carregando grupos...</p>
              ) : (
                <select
                  id="group_id"
                  name="group_id"
                  value={form.group_id}
                  onChange={handleChange}
                  required
                  disabled={groups.length === 0}
                >
                  {groups.length === 0 && <option value="">Nenhum grupo disponível</option>}
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {!isInvited && groupsError && <p>{groupsError}</p>}
            <div className="form-group">
              <label htmlFor="name">Nome</label>
              <input
                id="name"
                name="name"
                required
                value={form.name}
                onChange={handleChange}
                readOnly={isInvited}
              />
            </div>
            <div className="form-group">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={form.email}
                onChange={handleChange}
                readOnly={isInvited}
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                name="password"
                type="password"
                minLength={6}
                required
                value={form.password}
                onChange={handleChange}
              />
            </div>
            {isInvited && (
              <>
                <div className="form-group">
                  <label htmlFor="confirmPassword">Confirmar senha</label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    minLength={6}
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="preferred_position">Posição preferida (opcional)</label>
                  <input
                    id="preferred_position"
                    name="preferred_position"
                    value={form.preferred_position}
                    onChange={handleChange}
                    placeholder="Ex.: Goleiro, Atacante, Zagueiro"
                  />
                </div>
              </>
            )}
            {invitationError && <p>{invitationError}</p>}
            {error && <p>{error}</p>}
            {success && <p>{success}</p>}
            <button className="primary-button" type="submit" disabled={submitting || invitationLoading}>
              {submitting ? 'Enviando...' : isInvited ? 'Concluir cadastro' : 'Registrar'}
            </button>
          </form>
        )}
        {!isInvited && !invitationToken && (
          <p style={{ marginTop: '1rem' }}>
            Já tem conta? <Link to="/login">Entre aqui</Link>
          </p>
        )}
      </div>
    </div>
  )
}
