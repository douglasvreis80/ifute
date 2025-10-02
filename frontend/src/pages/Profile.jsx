import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { avatarPlaceholder, resolveAvatar } from '../utils/avatar'

const PROFILE_PLACEHOLDER = avatarPlaceholder(160)

function formatStatus(status) {
  if (status === 'mensalista') {
    return 'Mensalista'
  }
  if (status === 'avulso') {
    return 'Avulso'
  }
  return '—'
}

export default function Profile() {
  const navigate = useNavigate()
  const { user, uploadProfilePhoto, refreshUser } = useAuth()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(PROFILE_PLACEHOLDER)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    if (!user) {
      navigate('/login')
    }
  }, [user, navigate])

  useEffect(() => {
    setPreview(resolveAvatar(user, 160))
  }, [user])

  const statusLabel = useMemo(() => formatStatus(user?.status), [user?.status])

  const handleFileChange = (event) => {
    const selected = event.target.files?.[0]
    setFile(selected || null)
    setError('')
    setMessage('')
    if (selected) {
      const objectUrl = URL.createObjectURL(selected)
      setPreview(objectUrl)
    } else {
      setPreview(resolveAvatar(user, 160))
    }
  }

  const handleUpload = async (event) => {
    event.preventDefault()
    if (!file) {
      setError('Selecione uma imagem para enviar.')
      return
    }
    setUploading(true)
    setError('')
    setMessage('')
    try {
      await uploadProfilePhoto(file)
      await refreshUser()
      setMessage('Foto atualizada com sucesso!')
      setFile(null)
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Não foi possível enviar a foto.'
      setError(detail)
    } finally {
      setUploading(false)
    }
  }

  useEffect(
    () => () => {
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview)
      }
    },
    [preview],
  )

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '480px', margin: '2rem auto', textAlign: 'center' }}>
        <h1>Meu perfil</h1>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <img
            src={preview || PROFILE_PLACEHOLDER}
            alt={user?.name || 'Avatar'}
            style={{ width: '160px', height: '160px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #e2e8f0' }}
          />
          <div>
            <strong>{user?.name}</strong>
            <p style={{ margin: '0.25rem 0', color: '#475569' }}>{user?.email}</p>
            <span className="badge">Status: {statusLabel}</span>
            {user?.preferred_position && (
              <p style={{ margin: '0.3rem 0 0', color: '#475569' }}>Posição preferida: {user.preferred_position}</p>
            )}
          </div>
        </div>
        <form onSubmit={handleUpload} style={{ marginTop: '1.5rem' }}>
          <div className="form-group">
            <label htmlFor="profilePhoto">Atualizar foto de perfil</label>
            <input id="profilePhoto" type="file" accept="image/*" onChange={handleFileChange} />
          </div>
          {error && <p>{error}</p>}
          {message && <p>{message}</p>}
          <button className="primary-button" type="submit" disabled={uploading}>
            {uploading ? 'Enviando...' : 'Salvar foto'}
          </button>
        </form>
      </div>
    </div>
  )
}
