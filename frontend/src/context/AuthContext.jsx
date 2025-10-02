import { createContext, useContext, useEffect, useState } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('ff_token'))
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null)
      setUser(null)
    }
    window.addEventListener('footy:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('footy:unauthorized', handleUnauthorized)
  }, [])

  useEffect(() => {
    const initialize = async () => {
      if (!token) {
        setUser(null)
        return
      }
      setAuthLoading(true)
      try {
        const response = await api.get('/auth/me')
        setUser(response.data)
      } catch (err) {
        localStorage.removeItem('ff_token')
        setUser(null)
        setToken(null)
      } finally {
        setAuthLoading(false)
      }
    }

    initialize()
  }, [token])

  const login = async (email, password) => {
    const params = new URLSearchParams()
    params.append('username', email)
    params.append('password', password)

    try {
      const response = await api.post('/auth/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      localStorage.setItem('ff_token', response.data.access_token)
      setToken(response.data.access_token)

      const me = await api.get('/auth/me')
      setUser(me.data)
      return me.data
    } catch (error) {
      const message = error?.response?.data?.detail || 'Credenciais inválidas. Tente novamente.'
      const err = new Error(message)
      err.original = error
      throw err
    }
  }

  const register = async ({ name, email, password, group_id }) => {
    const response = await api.post('/auth/register', { name, email, password, group_id })
    return response.data
  }

  const logout = () => {
    localStorage.removeItem('ff_token')
    setToken(null)
    setUser(null)
  }

  const refreshUser = async () => {
    if (!token) return null
    const response = await api.get('/auth/me')
    setUser(response.data)
    return response.data
  }

  const uploadProfilePhoto = async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/users/me/upload-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    setUser(response.data)
    return response.data
  }

  return (
    <AuthContext.Provider
      value={{ user, authLoading, login, register, logout, refreshUser, uploadProfilePhoto }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
