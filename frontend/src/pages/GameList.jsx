import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../context/AuthContext'

export default function GameList() {
  const { user, authLoading } = useAuth()
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (authLoading) return

    if (!user) {
      setGames([])
      setLoading(false)
      return
    }

    const fetchGames = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await api.get('/games')
        setGames(response.data)
      } catch (err) {
        const message = err?.response?.data?.detail || 'Não foi possível carregar os jogos.'
        setError(message)
      } finally {
        setLoading(false)
      }
    }

    fetchGames()
  }, [authLoading, user])

  if (authLoading || loading) {
    return (
      <div className="container">
        <p>Carregando jogos...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="container">
        <div className="card">
          <p>Entre com sua conta para visualizar as partidas do seu grupo.</p>
          <Link className="secondary-button" to="/login">
            Fazer login
          </Link>
        </div>
      </div>
    )
  }

  if (!user.group_id) {
    return (
      <div className="container">
        <div className="card">
          <p>Seu usuário não está vinculado a um grupo. Procure o administrador para concluir a configuração.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container">
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="section-title">
        <h1>Partidas agendadas</h1>
        {user && user.role === 'admin' ? (
          <Link className="primary-button" to="/create">
            Criar partida
          </Link>
        ) : null}
      </div>
      {games.length === 0 ? (
        <div className="card">
          <p>Nenhuma partida disponível no seu grupo no momento. Fale com um administrador para agendar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {games.map((game) => (
            <div key={game.id} className="bg-white rounded shadow p-4 mb-4">
              <p className="text-lg font-semibold">
                {new Date(game.scheduled_at).toLocaleString('pt-BR', {
                  dateStyle: 'full',
                  timeStyle: 'short',
                })}
              </p>
              <p className="text-sm text-gray-600 mb-3">
                Reservadas: {game.reserved_slots} · Disponíveis: {game.available_slots}
              </p>
              <h2 className="text-xl font-bold mb-2">{game.name}</h2>
              {game.owner && (
                <p className="text-sm text-gray-700">
                  <strong>Organizador:</strong> {game.owner.name}
                </p>
              )}
              <p className="text-sm text-gray-700">
                <strong>Local:</strong> {game.location}
              </p>
              <p className="text-sm text-gray-700">
                <strong>Vagas totais:</strong> {game.max_players}
              </p>
              <Link
                className="mt-4 inline-flex items-center justify-center rounded bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-700 transition-colors"
                to={`/games/${game.id}`}
              >
                Ver detalhes
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
