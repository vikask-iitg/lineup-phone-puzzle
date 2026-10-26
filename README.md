# Lines in Sync

**A cooperative line-matching puzzle played across a row of phones.**

Put phones side by side, match the colored paths at their edges, and swipe across the row together. The group solves each level as one team.

## Play locally

### Requirements

- Node.js 22 or newer
- A browser on each device
- For multiplayer over the internet, a host that supports long-lived WebSocket connections

### Start the server

```sh
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000) on the host computer. To play on phones connected to the same Wi-Fi, open the host computer's local network address (for example, `http://192.168.1.20:3000`) on each phone. The host and phones must be able to reach one another on the network.

### Start a game

1. Choose **Create room** on the first device.
2. Share the four-letter room code or invite link with the group.
3. Everyone opens the link or enters the code and joins from their own device.
4. Once at least two players are present, the host starts the game.
5. Arrange the phones in a row. Match the line stubs at the edges, then swipe left-to-right across every tile.

Choose **Practice solo** to arrange a shuffled set of puzzle tiles with a mouse or touch screen.

## What's implemented

- Four-letter rooms, a live lobby, host controls, up to eight players, and direct room links at `/<CODE>`.
- Session IDs for reconnecting after a refresh, generated player names, and host succession on disconnect.
- Server-owned room state, a shared ready countdown and timer, server-side swipe-chain ordering, wrong-order time penalties, level progression, and team scoring.
- Mobile-oriented tile rendering, portrait guidance, room code sharing, solo drag practice, and a Dockerfile.

## Deploying

The app uses one Node.js process for both its static web files and WebSocket server. Deploy this directory to a Node.js or container host that supports WebSockets, set `PORT` if the host requires it, and enable secure WebSockets (`wss://`) through the host's HTTPS endpoint. Share the resulting HTTPS URL with players.

The server keeps room state in memory. Rooms disappear when the process restarts, and a multi-instance deployment needs shared storage and routing before players in one room can reliably land on the same server. The included [Dockerfile](Dockerfile) is a starting point for container hosts.

## Project files

| File | Purpose |
| --- | --- |
| `server.js` | Static HTTP server, WebSocket rooms, game state, timers, and swipe evaluation |
| `index.html` | App shell and mobile viewport settings |
| `app.js` | Landing, lobby, play screens, room connection, and solo practice |
| `style.css` | Responsive visual design and touch-friendly layout |
| `package.json` | Node package metadata and start command |
| `Dockerfile` | Container build instructions |

## Known gaps

This is an early prototype, not yet a complete implementation of the original build spec. It has not been validated with a real group of phones or deployed to a public URL. The tap fallback, generated QR codes, full disconnect pause-and-rebuild flow, decoy level, persistent/shared room storage, and several accessibility and onboarding details still need work. See the original build brief for the complete target behavior.
