# Game Arcade

A mobile-friendly PWA game collection you can add to your iPhone home screen. Single-player games run entirely in the browser (free, offline-capable). Live multiplayer uses a **WebSocket room server** to relay moves between friends (no peer-to-peer). Async online play uses Supabase saved matches.

## Live stack (designed to stay cheap)

| Piece | Host | Cost |
|-------|------|------|
| Frontend (React PWA) | Render **Static Site** | Free, never sleeps |
| Signaling (6-digit rooms) | Render **Web Service** (free tier) | Free; sleeps after 15 min idle (~1 min cold start) |
| Accounts / cloud stats | Supabase (optional, later) | Free tier; pauses after 7 days DB inactivity |

## Project structure

```
web/          React + Vite + TypeScript PWA
server/       WebSocket room server (6-digit party codes + move relay)
render.yaml   One-click Render blueprint
```

## Local development

**Terminal 1 — signaling server**

```bash
cd server
npm install
npm run dev
```

Optional: set `GEMINI_API_KEY` in the server environment to enable AI-generated tier list items (see [Tier List / Gemini](#tier-list--gemini) below). Set `SERPER_API_KEY` for Google Images card art. Without Gemini, prompt generation falls back to Wikipedia search.

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
- [x] Tier List (prompt / preset / manual ranking)
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
| Remote | 6-digit room code, server-relayed live play |

## Stats & accounts

Accounts are **optional** — every game is fully playable as a guest. Guests'
stats live in `localStorage`; signed-in players also get their plays synced to
Supabase so stats follow them across devices.

- Auth: email + password (`web/src/context/AuthContext.tsx`).
- Recording: games call `recordGameEnd(...)` from `web/src/lib/stats`. It always
  updates the local aggregate and, when signed in, calls the `record_game_session`
  Postgres function (one atomic write that logs the session and rolls up totals).

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Connect this Git repo** (Dashboard → Database → *Migrations* / GitHub
   integration). Supabase reads `supabase/migrations/` and applies them
   automatically — pushing to the production branch runs them on the project, and
   pull requests get isolated preview branches. The initial schema lives in
   `supabase/migrations/20260604000000_init_accounts_and_stats.sql`.
3. Copy the project URL + anon key (Project Settings → API) into the web app:
   - Local dev: add to `web/.env` (see `web/.env.example`).
   - Render: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on the static
     site, then redeploy (Vite bakes them in at build time).
4. (Optional) In Auth settings, turn email confirmation on/off to taste.

If the env vars are blank, the build runs guest-only and hides the account UI.

## Tier List / Gemini

The **Tier List** game can auto-generate items from a natural-language prompt (e.g. "Pokemon", "Mario characters"). Item **names** come from an LLM; **images** are found via Google Images search (with Wikipedia as fallback).

### Setup (optional but recommended)

1. Go to [Google AI Studio](https://aistudio.google.com/apikey) and create an API key (free tier available; no credit card required for low volume).
2. Set the key on your **room server** (not the web app):
   - **Local dev:** add `GEMINI_API_KEY=...` to `server/.env` (see `server/.env.example`). The server loads this file automatically on startup — restart `npm run dev` after changing it. You should see `Tier list LLM: enabled (gemini-2.5-flash-lite)` in the server console.
   - **Render:** add `GEMINI_API_KEY` as an environment variable on the **game-arcade-signaling** web service, then redeploy.
3. The server uses **Gemini 2.5 Flash-Lite** by default (~$0.04–0.10 per million input tokens). If that model is overloaded (Google returns 503), the server automatically retries and falls back to `gemini-2.0-flash-lite` then `gemini-2.0-flash`. Override with `GEMINI_MODELS` in `server/.env`.

4. **Images (strongly recommended):** add `SERPER_API_KEY` from [serper.dev](https://serper.dev) (2,500 free Google Image searches). The LLM returns contextual search phrases like `Senior Researcher Dubois Project Hail Mary movie character` so you get film cast photos instead of unrelated Wikipedia portraits. Alternative: `BRAVE_SEARCH_API_KEY` from [Brave Search API](https://brave.com/search/api/). On startup you should see `Tier list images: enabled (serper)`. Without an image key, the app falls back to Wikipedia thumbnails only.

If all Gemini models fail, the server returns an error and the client automatically falls back to Wikipedia search for the prompt.

### Data model

| Table | Purpose |
|-------|---------|
| `profiles` | One row per user: username, total games played, created date. |
| `game_stats` | Per `(user, game)` aggregate: plays, wins/losses/draws, best score, rating. Drives win rate. |
| `game_sessions` | One row per play: mode, opponent (computer/user/guest/solo), result, turns, avg turn time, start/end. |

A single `game_sessions` table keyed by `game_id` is used instead of one table
per game, so adding a new game from the roadmap needs **no** schema change. The
simple win/loss `rating` (human-vs-human only) can be upgraded to a full Elo
later without touching game code.

## License

Private / personal project — add a license if you open-source it.
