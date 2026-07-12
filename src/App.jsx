import React, { useState, useEffect } from 'react'
import TranslatorDashboard from './components/TranslatorDashboard';
import './App.css'

function App() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if app is installed (PWA)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    // Online/Offline status
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <h1>🇬🇭 Fred Delangua</h1>
          <div className="status-badges">
            {isInstalled && (
              <span className="badge installed">📱 Installed</span>
            )}
            <span className={`badge ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? '🟢 Online' : '🔴 Offline'}
            </span>
          </div>
        </div>
      </header>
      
      <main className="app-main">
        <TranslatorDashboard />
      </main>

      <footer className="app-footer">
        <p>Powered by Transformers.js • Offline-first PWA</p>
      </footer>
    </div>
  )
}

export default App