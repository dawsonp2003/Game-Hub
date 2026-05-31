# Game Arcade

A mobile-friendly PWA game collection you can add to your iPhone home screen. Single-player games run entirely in the browser (free, offline-capable). Multiplayer uses **WebRTC peer-to-peer** with a tiny signaling server—gameplay traffic does not go through the server after connect.

## Live stack (designed to stay cheap)

| Piece | Host | Cost |
|-------|------|------|
| Frontend (React PWA) | Render **Static Site** | Free, never sleeps |
| Signaling (6-digit rooms) | Render **Web Service** (free tier) | Free; sleeps after 15 min idle (~1 min cold start) |
| Accounts / cloud stats | Supabase (optional, later) | Free tier; pauses after 7 days DB inactivity |

## Project structure

```
web/          React + Vite + TypeScript PWA
server/       WebSocket signaling for WebRTC room codes
render.yaml   One-click Render blueprint
```

## Local development

**Terminal 1 — signaling server**

```bash
cd server
npm install
npm run dev
```

**Terminal 2 — web app**

```bash
cd web
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`). Multiplayer dev connects to `ws://localhost:3001` automatically.

## Deploy to Render

1. Push this repo to GitHub.
2. In [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → connect the repo (uses `render.yaml`).
3. The blueprint auto-sets `VITE_SIGNALING_URL` on the static site from the signaling service hostname.  
   If you created services manually, set on **game-arcade-web** before building:
   - `VITE_SIGNALING_URL` = `game-arcade-signaling.onrender.com` (or full `wss://…` URL)
4. **Redeploy the static site** after any env change (Vite bakes this in at build time).

**iOS home screen:** Safari → Share → **Add to Home Screen**.

### Free-tier notes

- **Signaling cold start:** First remote match after ~15 minutes of no traffic may take up to ~60 seconds to connect. Gameplay after that is P2P and fast.
- **Optional ~$7/mo:** Upgrade signaling to a paid instance if you want zero cold starts (not required for solo games).
- **Supabase (later):** Use a weekly cron (e.g. GitHub Actions) to ping the DB so free projects don’t pause after 7 days of inactivity.

## Adding a new game

1. Create `web/src/games/your-game/` with `meta.ts` and `YourGame.tsx`.
2. Export a `GameDef` from `meta.ts` (see `tic-tac-toe/meta.ts`).
3. Register it in `web/src/games/registry.ts`.
4. Implement `GameProps`: `mode`, `session` (for remote), `onExit`.
5. Use `stats.recordPlay`, `stats.recordResult`, `stats.recordScore` from `web/src/lib/stats`.

## Game roadmap

Work through these over time. Check off as we ship them.  
**Note:** NYT / LinkedIn names are trademarks—we build **original** games inspired by similar mechanics.

### Word & letter

- [x] Word Guess (unlimited Wordle-style)
- [x] Hangman
- [x] Word Ladder (solo + 1v1)
- [x] Anagram / word find
- [ ] Crossword generator *(stretch — hard)*

### Logic & grid puzzles (original mechanics)

- [ ] Queens (one per row/column/region)
- [ ] Path Connect (Zip-style)
- [ ] Balance Grid (Tango-style)
- [ ] Region Fill (Patches-style)
- [ ] Sudoku
- [ ] Nonograms
- [ ] Minesweeper
- [ ] 2048

### Board & 2-player

- [x] Tic Tac Toe
- [ ] Ultimate Tic Tac Toe
- [ ] Battleship
- [ ] Connect Four
- [ ] Dots and Boxes
- [ ] Checkers
- [ ] Reversi / Othello
- [ ] Gomoku
- [ ] Chess *(later)*

### Arcade & action

- [x] Snake
- [ ] Tetris
- [ ] Space Invaders
- [ ] Breakout
- [ ] Pong (2-player)
- [ ] Asteroids
- [ ] Flappy-style runner

### Card & casual

- [ ] Solitaire (Klondike)
- [ ] Memory Match
- [ ] Blackjack

## Play modes (multiplayer-capable games)

| Mode | Description |
|------|-------------|
| Solo | Single player on device |
| vs Computer | Local AI opponent |
| Pass & Play | Two players, one device |
| Remote | 6-digit room code, WebRTC P2P |

## Stats & accounts

- **Now:** Stats stored in `localStorage` on the device (`web/src/lib/stats`).
- **Later:** Supabase auth + Postgres; swap the stats backend without changing games.

## License

Private / personal project — add a license if you open-source it.
