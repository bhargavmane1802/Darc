# Socket.IO benchmark

## Install

```bash
npm install socket.io-client dotenv
```

Use Node.js 18+ with ES modules enabled. If your project does not already have `"type": "module"` in `package.json`, add it or rename the script to `.mjs`.

## Configure

Copy `.env.example` to `.env` and set `BENCH_PASSWORD` to the password for the five authorized test accounts. Do not commit `.env`.

## Run

Start the application and wait until MongoDB/Redis are ready, then run:

```bash
node benchmark.js
```

The script runs shared-room and separate-rooms scenarios. Each scenario runs 5, 20, 50, 100, and 250 concurrent Socket.IO connections for 60 seconds per stage. The same five test accounts are reused across simulated connections; this measures concurrent sessions, not 250 distinct user identities.

JSON and CSV reports are written to `benchmark-results/` by default. Room records are created for each run and are not automatically deleted.

## Important implementation assumptions

- The server accepts `user:login` with `{ username, password }` and returns `{ status: 200, token, user }` through the Socket.IO acknowledgement.
- Room creation uses `room:create` with `{ name, description, isPrivate }`; room join uses `room:join` with `{ inviteCode }`.
- Message creation uses `message:create` with `{ roomId, content, type }` and acknowledges with status 201.
- The benchmark uses `join_room` with `{ room_id }` for each additional socket after the account has been made a database member of its room.
- The script assumes `room_members` or `message_display` is emitted after `join_room` as a confirmation signal.

The benchmark deliberately reuses only the supplied test accounts. For a true 250-distinct-user test, provision 250 test accounts and update `BENCH_USERS` accordingly.
