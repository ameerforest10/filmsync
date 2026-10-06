# FilmSync

Bare-bones two-person local-file film synchronisation.

- The film stays on each person's device.
- Two-way play, pause and seek.
- If either person disconnects, the room pauses.
- Reconnection re-aligns playback.
- Same MP4 on both devices is recommended.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000 in two browser windows, join the same room as A and L, and select the same local MP4 in both.

## Deploy

This is a normal Node web service. Start command: `npm start`. The host must support persistent WebSocket connections.
