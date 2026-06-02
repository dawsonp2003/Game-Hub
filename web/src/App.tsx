import { Routes, Route } from 'react-router-dom'
import { RoomProvider } from './context/RoomContext'
import RoomOverlay from './components/RoomOverlay'
import HomePage from './routes/HomePage'
import PlayPage from './routes/PlayPage'

export default function App() {
  return (
    <RoomProvider>
      <div className="app-shell">
        <RoomOverlay />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/play/:gameId" element={<PlayPage />} />
        </Routes>
      </div>
    </RoomProvider>
  )
}
