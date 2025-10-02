// Simplified service worker registration based on CRA template

const swUrl = `${import.meta.env.BASE_URL ?? ''}service-worker.js`

export function register() {
  if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) {
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(swUrl)
      .catch((error) => {
        console.error('Service worker registration failed:', error)
      })
  })
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister()
      })
      .catch((error) => {
        console.error('Service worker unregister failed:', error)
      })
  }
}
