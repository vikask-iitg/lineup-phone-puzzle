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

Open [http://localhost:3000](http://localhost:3000) on the host computer for local development. For local multiplayer, have every device—including the host—open the host computer's local network address (for example, `http://192.168.1.20:3000`) while connected to the same Wi-Fi. Join by entering the room code; the QR and copied invite link point to the public game site, not your local server.

## How to play

1. Choose **Create room** on the first device.
2. For the deployed game, share the four-letter code, copied invite link, or QR code. Everyone should use the same public game address: [lineup-phone-puzzle.vercel.app](https://lineup-phone-puzzle.vercel.app/). For a local game, have everyone open the same local network address and enter the code.
3. Each player joins on their own phone. Names default to **Player 1**, **Player 2**, and so on. The host starts once at least two players have joined.
4. Put the phones side by side. Arrange them so the colored line patterns match at each edge, with the **START** phone first and the **FINISH** phone last. Any other phones go between them where their line ends match.
5. Swipe across the phones in that order, like passing a relay:
   - The **START** player begins the swipe and moves their finger horizontally from left to right, lifting near the right edge.
   - Each next player starts as soon as the previous player lifts, then swipes left to right across their own screen. Middle phones start near the left edge and finish near the right edge.
   - The **FINISH** player is last. The `←` means the swipe arrives from the phone on the left; the swipe on this phone still moves left to right.
   - Do not all swipe at once. Start the next swipe within about one second of the previous player lifting. There is no required swipe speed; keep it smooth and mostly horizontal.

Choose **Practice solo** to arrange a shuffled set of puzzle tiles with a mouse or touch screen. Solo practice does not use the timed multiplayer swipe.

## What's implemented

- Four-letter rooms, a live lobby, host controls, up to eight players, and direct room links at `/<CODE>`.
- Session IDs for reconnecting after a refresh, generated player names, and host succession on disconnect.
- Server-owned room state, a shared ready countdown and timer, server-side swipe-chain ordering, wrong-order time penalties, level progression, and team scoring.
- Mobile-oriented tile rendering, portrait guidance, room code sharing, solo drag practice, and a Dockerfile.

## Deploying

The app uses one Node.js process for both its static web files and WebSocket server. The root `server.ts` entry point lets Vercel detect and run the existing Node.js server. Vercel supports WebSocket connections; deploy the repository as a Node.js project and share the resulting HTTPS URL with players. Other Node.js or container hosts that support WebSockets can also run it. Set `PORT` if the host requires it, and enable secure WebSockets (`wss://`) through the host's HTTPS endpoint.

The server keeps room state in memory. Rooms disappear when the process restarts, and players in one room must reach the same server instance. For a scaled Vercel deployment, shared storage and cross-instance messaging are needed before rooms can reliably span multiple server instances. The included [Dockerfile](Dockerfile) is a starting point for container hosts.

## Project files

| File | Purpose |
| --- | --- |
| `server.js` | Static HTTP server, WebSocket rooms, game state, timers, and swipe evaluation |
| `server.ts` | Vercel Node.js server entry point |
| `index.html` | App shell and mobile viewport settings |
| `favicon.svg` | Browser tab icon with the game's connecting lime and coral lines |
| `client.js` | Landing, lobby, play screens, room connection, and solo practice |
| `qrcode-generator.js` | Local QR encoder for shareable room links |
| `style.css` | Responsive visual design and touch-friendly layout |
| `package.json` | Node package metadata and start command |
| `Dockerfile` | Container build instructions |

The room's **Show QR** button creates a scannable QR code for the full invite URL, including the current room code. Each click refreshes the QR using the public production domain, so invitees can open the room without signing in to Vercel. The copied invite link uses the same public address.

## Known gaps

This is an early prototype, not yet a complete implementation of the original build spec. The tap fallback, full disconnect pause-and-rebuild flow, decoy level, persistent/shared room storage, and several accessibility and onboarding details still need work. See the original build brief for the complete target behavior.
