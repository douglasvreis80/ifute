import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'
import { resolveAvatar } from '../utils/avatar'

function formatUserStatus(status) {
  if (status === 'mensalista') {
    return 'Mensalista'
  }
  if (status === 'avulso') {
    return 'Avulso'
  }
  return 'Usuário'
}

function renderPlayerEntry(user, { prefix, isSelf } = {}) {
  return (
    <div className="player-entry">
      {prefix ? <span className="player-position">{prefix}</span> : null}
      <img className="player-avatar" src={resolveAvatar(user, 40)} alt={user.name} />
      <div className="player-meta">
        <div className="player-name-row">
          <span className="player-name">{user.name}</span>
          {isSelf ? <span className="player-self">(você)</span> : null}
        </div>
        <span className="player-role">{formatUserStatus(user.status)}</span>
      </div>
    </div>
  )
}

export default function GameDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, authLoading } = useAuth()
  const [game, setGame] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [previousPresenceStatus, setPreviousPresenceStatus] = useState(null)
  const [users, setUsers] = useState([])
  const [selectedConvocations, setSelectedConvocations] = useState([])
  const [updatingConvocations, setUpdatingConvocations] = useState(false)

  const isAdmin = user?.role === 'admin'

  const fetchGame = async () => {
    try {
      const response = await api.get(`/games/${id}`)
      setGame(response.data)
      setSelectedConvocations(response.data.convocations.map((c) => c.user.id))
      setError('')
    } catch (err) {
      setError('Não foi possível carregar os detalhes da partida.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      navigate('/login')
      return
    }

    if (!user.group_id) {
      setError('Seu usuário não está vinculado a um grupo.')
      setLoading(false)
      return
    }

    setLoading(true)
    fetchGame()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, id])

  useEffect(() => {
    if (!isAdmin) return
    const fetchUsers = async () => {
      try {
        const response = await api.get('/users')
        setUsers(response.data)
      } catch (err) {
        console.error('Erro ao carregar usuários', err)
      }
    }
    fetchUsers()
  }, [isAdmin])

  const myConvocation = useMemo(() => {
    if (!user || !game) return null
    return game.convocations.find((conv) => conv.user.id === user.id) || null
  }, [game, user])

  const myPresence = useMemo(() => {
    if (!user || !game) return null
    return game.presences.find((presence) => presence.user.id === user.id) || null
  }, [game, user])

  const avulsosConfirmados = useMemo(
    () => (game ? game.presences.filter((presence) => presence.role === 'avulso' && presence.status === 'confirmed') : []),
    [game],
  )

  const avulsosEmEspera = useMemo(
    () => (game ? game.presences.filter((presence) => presence.role === 'avulso' && presence.status === 'waiting') : []),
    [game],
  )

  useEffect(() => {
    if (!user) {
      setPreviousPresenceStatus(null)
      return
    }
    const currentStatus = myPresence?.status ?? null
    if (previousPresenceStatus === 'confirmed' && currentStatus === 'waiting') {
      setActionMessage('Você voltou para a lista de espera, pois um convocado confirmou presença.')
    }
    setPreviousPresenceStatus(currentStatus)
  }, [user, myPresence?.status, previousPresenceStatus])

  const handleConfirm = async () => {
    if (!user) {
      navigate('/login')
      return
    }
    setActionError('')
    setActionMessage('')
    try {
      const response = await api.post(`/games/${id}/confirm`)
      const displaced = response.data?.displaced_waiting ?? []
      if (displaced && displaced.includes(user?.id)) {
        setActionMessage('Você voltou para a lista de espera, pois um convocado retomou a vaga.')
      } else if (displaced.length > 0) {
        setActionMessage('Convocado confirmado e avulso movido para a lista de espera.')
      } else {
        setActionMessage('Presença confirmada!')
      }
      fetchGame()
    } catch (err) {
      const message = err?.response?.data?.detail || 'Erro ao confirmar presença.'
      setActionError(message)
    }
  }

  const handleDecline = async () => {
    if (!user) {
      navigate('/login')
      return
    }
    setActionError('')
    setActionMessage('')
    try {
      await api.post(`/games/${id}/decline`)
      setActionMessage('Você informou que não poderá jogar.')
      fetchGame()
    } catch (err) {
      const message = err?.response?.data?.detail || 'Erro ao registrar ausência.'
      setActionError(message)
    }
  }

  const handleJoin = async () => {
    if (!user) {
      navigate('/login')
      return
    }
    setActionError('')
    setActionMessage('')
    try {
      const response = await api.post(`/games/${id}/join`)
      const status = response.data.status
      setActionMessage(
        status === 'waiting'
          ? 'Você entrou na lista de espera. Avisaremos caso surja uma vaga!'
          : 'Presença confirmada com sucesso!'
      )
      fetchGame()
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível entrar na partida.'
      setActionError(message)
    }
  }

  const handleLeave = async (targetId) => {
    setActionError('')
    setActionMessage('')
    try {
      await api.delete(`/games/${id}/presences/${targetId}`)
      setActionMessage('Presença removida.')
      fetchGame()
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível remover a presença.'
      setActionError(message)
    }
  }

  const handleUpdateConvocations = async (event) => {
    event.preventDefault()
    setUpdatingConvocations(true)
    setActionError('')
    setActionMessage('')
    try {
      await api.post(`/games/${id}/convocations`, { user_ids: selectedConvocations })
      setActionMessage('Convocações atualizadas.')
      fetchGame()
    } catch (err) {
      const message = err?.response?.data?.detail || 'Não foi possível atualizar a lista de convocados.'
      setActionError(message)
    } finally {
      setUpdatingConvocations(false)
    }
  }

  if (loading) {
    return (
      <div className="container">
        <p>Carregando partida...</p>
      </div>
    )
  }

  if (error || !game) {
    return (
      <div className="container">
        <p>{error || 'Partida não encontrada.'}</p>
      </div>
    )
  }

  const canJoin = !myConvocation && !myPresence
  const joinButtonLabel = game.available_slots > 0 ? 'Participar como avulso' : 'Entrar na lista de espera'

  const convocationsByStatus = {
    confirmed: game.convocations.filter((c) => c.status === 'confirmed'),
    pending: game.convocations.filter((c) => c.status === 'pending'),
    declined: game.convocations.filter((c) => c.status === 'declined'),
  }

  return (
    <div className="container">
      <div className="card">
        <h1>{game.name}</h1>
        {game.owner && (
          <p>
            <strong>Organizador:</strong> {game.owner.name}
          </p>
        )}
        <p>
          <strong>Local:</strong> {game.location}
        </p>
        <p>
          <strong>Data:</strong>{' '}
          {new Date(game.scheduled_at).toLocaleString('pt-BR', {
            dateStyle: 'full',
            timeStyle: 'short',
          })}
        </p>
        <p>
          <strong>Vagas totais:</strong> {game.max_players}
        </p>
        <p>
          <strong>Reservadas para convocados:</strong> {game.reserved_slots} · <strong>Disponíveis agora:</strong> {game.available_slots}
        </p>
        {game.convocation_deadline && (
          <p>
            <strong>Prazo dos convocados:</strong>{' '}
            {new Date(game.convocation_deadline).toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </p>
        )}
      </div>

      {(actionError || actionMessage) && (
        <div className="card">
          {actionError && <p>{actionError}</p>}
          {actionMessage && <p>{actionMessage}</p>}
        </div>
      )}

      {myConvocation && (
        <div className="card">
          <h2>Você foi convocado!</h2>
          <p>Status atual: <strong>{myConvocation.status}</strong></p>
          <div className="actions">
            {myConvocation.status !== 'confirmed' && (
              <button className="primary-button" onClick={handleConfirm}>
                Confirmar presença
              </button>
            )}
            {myConvocation.status !== 'declined' && (
              <button className="secondary-button" onClick={handleDecline}>
                Não vou
              </button>
            )}
          </div>
        </div>
      )}

      {!myConvocation && myPresence && (
        <div className="card">
          <h2>Sua inscrição</h2>
          <p>
            Você está marcado como <strong>{myPresence.role === 'avulso' ? (myPresence.status === 'waiting' ? 'em espera' : 'confirmado') : 'confirmado'}</strong>.
          </p>
          <button className="secondary-button" onClick={() => handleLeave(myPresence.user.id)}>
            Cancelar participação
          </button>
        </div>
      )}

      {canJoin && (
        <div className="card">
          <h2>Quero jogar</h2>
          <p>Convocados têm prioridade. Se uma vaga for retomada, o último avulso confirmado volta para a lista de espera.</p>
          {!user ? (
            <p>Entre na plataforma para confirmar presença ou entrar na lista de espera.</p>
          ) : (
            <button className="primary-button" onClick={handleJoin}>
              {joinButtonLabel}
            </button>
          )}
        </div>
      )}

      <div className="card">
        <h2>Convocados</h2>
        {convocationsByStatus.confirmed.length > 0 && (
          <>
            <h3>Confirmados</h3>
            <ul className="player-list">
              {convocationsByStatus.confirmed.map((conv) => (
                <li key={conv.id}>
                  {renderPlayerEntry(conv.user)}
                  <span className="status-pill status-confirmed">Confirmado</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <h3>Pendentes</h3>
        {convocationsByStatus.pending.length === 0 ? (
          <p>Nenhum convocado pendente.</p>
        ) : (
          <ul className="player-list">
            {convocationsByStatus.pending.map((conv) => (
              <li key={conv.id}>{renderPlayerEntry(conv.user)}</li>
            ))}
          </ul>
        )}
        {convocationsByStatus.declined.length > 0 && (
          <>
            <h3>Não vão</h3>
            <ul className="player-list">
              {convocationsByStatus.declined.map((conv) => (
                <li key={conv.id}>{renderPlayerEntry(conv.user)}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="card">
        <h2>Avulsos confirmados</h2>
        {avulsosConfirmados.length === 0 ? (
          <p>Nenhum avulso confirmado ainda.</p>
        ) : (
          <ul className="player-list">
            {avulsosConfirmados.map((presence) => (
              <li key={presence.id}>
                {renderPlayerEntry(presence.user, { isSelf: presence.user.id === user?.id })}
                {(isAdmin || presence.user.id === user?.id) && (
                  <button className="secondary-button" onClick={() => handleLeave(presence.user.id)}>
                    Remover
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Lista de espera</h2>
        <p>Ordem de chamada segue a inscrição original; se um convocado retomar a vaga, o último avulso promovido retorna para cá.</p>
        {avulsosEmEspera.length === 0 ? (
          <p>Ninguém aguardando no momento.</p>
        ) : (
          <ul className="player-list">
            {avulsosEmEspera.map((presence, index) => {
              const displayPosition = presence.queue_position ?? index + 1
              return (
                <li key={presence.id}>
                  {renderPlayerEntry(presence.user, {
                    prefix: `${displayPosition}º`,
                    isSelf: presence.user.id === user?.id,
                  })}
                  {(isAdmin || presence.user.id === user?.id) && (
                    <button className="secondary-button" onClick={() => handleLeave(presence.user.id)}>
                      Remover
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {isAdmin && (
        <div className="card">
          <h2>Gerenciar convocações</h2>
          <form onSubmit={handleUpdateConvocations}>
            <div className="form-group">
              <label htmlFor="convocations">Selecione os jogadores convocados</label>
              <select
                id="convocations"
                multiple
                value={selectedConvocations.map(String)}
                onChange={(event) =>
                  setSelectedConvocations(Array.from(event.target.selectedOptions).map((option) => Number(option.value)))
                }
                size={Math.min(8, Math.max(users.length, 4))}
              >
                {users
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name} ({player.role})
                    </option>
                  ))}
              </select>
            </div>
            <button className="primary-button" type="submit" disabled={updatingConvocations}>
              {updatingConvocations ? 'Salvando...' : 'Atualizar convocações'}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
