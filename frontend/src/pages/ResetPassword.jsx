import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!token) {
      setError('Token inválido. Utilize o link recebido por e-mail.')
      return
    }
    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.')
      return
    }

    setSubmitting(true)
    setError('')
    setMessage('')

    try {
      const response = await api.post('/auth/reset-password', {
        token,
        new_password: password,
      })
      setMessage(response?.data?.message || 'Senha atualizada com sucesso!')
      setTimeout(() => navigate('/login'), 2000)
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Não foi possível redefinir a senha.'
      setError(detail)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '420px', margin: '2rem auto' }}>
        <h1>Redefinir senha</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">Nova senha</label>
            <input
              id="password"
              type="password"
              minLength={6}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirmar nova senha</label>
            <input
              id="confirmPassword"
              type="password"
              minLength={6}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          {error && <p>{error}</p>}
          {message && <p>{message}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Atualizando...' : 'Atualizar senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
