import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api'

export default function ConfirmAccount() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''
  const [message, setMessage] = useState('Confirmando sua conta...')
  const [error, setError] = useState('')
  const hasRequested = useRef(false)

  useEffect(() => {
    const confirmAccount = async () => {
      if (hasRequested.current) {
        return
      }
      hasRequested.current = true
      if (!token) {
        setError('Token inválido. Verifique o link recebido por e-mail.')
        setMessage('')
        return
      }
      try {
        const response = await api.get('/auth/confirm', { params: { token } })
        setMessage(response?.data?.message || 'Conta confirmada com sucesso!')
        setTimeout(() => navigate('/login'), 2000)
      } catch (err) {
        const detail = err?.response?.data?.detail || 'Não foi possível confirmar a conta.'
        setError(detail)
        setMessage('')
      }
    }

    confirmAccount()
  }, [navigate, token])

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '420px', margin: '2rem auto', textAlign: 'center' }}>
        <h1>Confirmação de conta</h1>
        {message && <p>{message}</p>}
        {error && <p>{error}</p>}
      </div>
    </div>
  )
}
