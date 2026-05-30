import { Routes, Route } from 'react-router-dom'
import HomePage from './routes/HomePage'
import PlayPage from './routes/PlayPage'

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/play/:gameId" element={<PlayPage />} />
      </Routes>
    </div>
  )
}
