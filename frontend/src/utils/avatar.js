const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

function buildAbsoluteUrl(path) {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`
}

export function avatarPlaceholder(size = 64) {
  return `https://via.placeholder.com/${size}?text=Perfil`
}

export function resolveAvatar(user, size = 64) {
  const absolute = buildAbsoluteUrl(user?.profile_image)
  return absolute || avatarPlaceholder(size)
}

export function resolveProfileImage(path, size = 64) {
  const absolute = buildAbsoluteUrl(path)
  return absolute || avatarPlaceholder(size)
}

