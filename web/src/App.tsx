import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RoomProvider } from './context/RoomContext'
import RoomOverlay from './components/RoomOverlay'
import HomePage from './routes/HomePage'
import GameInfoRoute from './routes/GameInfoRoute'
import PlayPage from './routes/PlayPage'

export default function App() {
  return (
    <AuthProvider>
      <RoomProvider>
        <div className="app-shell">
          <RoomOverlay />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/game/:gameId" element={<GameInfoRoute />} />
            <Route path="/play/:gameId" element={<PlayPage />} />
          </Routes>
        </div>
      </RoomProvider>
    </AuthProvider>
  )
}
