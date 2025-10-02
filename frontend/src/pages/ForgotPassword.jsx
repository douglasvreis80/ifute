import { useState } from 'react'
import api from '../api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setMessage('')
    setError('')
    try {
      const response = await api.post('/auth/forgot-password', { email })
      setMessage(response?.data?.message || 'Se o e-mail estiver cadastrado, enviaremos instruções em instantes.')
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Não foi possível processar a solicitação.'
      setError(detail)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '420px', margin: '2rem auto' }}>
        <h1>Recuperar senha</h1>
        <p>Informe o e-mail cadastrado. Enviaremos um link para redefinir a senha.</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          {error && <p>{error}</p>}
          {message && <p>{message}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>
      </div>
    </div>
  )
}
