# DARC — Developer Collaboration Hub

DARC is a collaborative workspace for software teams. Each room brings together real-time chat, a shared development journal, lightweight presence, and AI-assisted summaries and feedback.

**Live app:** [darc-pearl.vercel.app](https://darc-pearl.vercel.app/app)  
**Repository:** [bhargavmane1802/Darc](https://github.com/bhargavmane1802/Darc)

> This README describes the implementation currently in the repository. In particular, registration currently creates an account directly: the email-verification handler and email service exist, but the verification flow is not wired into the active registration path.

## Contents

- [What DARC does](#what-darc-does)
- [Architecture](#architecture)
- [Feature details](#feature-details)
- [Efficiency and reliability](#efficiency-and-reliability)
- [Technology](#technology)
- [Repository layout](#repository-layout)
- [Run locally](#run-locally)
- [Environment variables](#environment-variables)
- [HTTP API](#http-api)
- [Socket.IO events](#socketio-events)
- [Tests and performance scripts](#tests-and-performance-scripts)
- [Deployment notes](#deployment-notes)

## What DARC does

DARC is organized around **rooms**. A member can join a room with an invite code, then switch between its chat and journal. Chat is intended for fast conversation; journal entries preserve project notes and progress over time. Presence and updates are shared with connected room members, while MongoDB remains the durable source for application records.

Core capabilities:

- Create rooms, invite people with a room code, join and leave rooms, and remove rooms as their owner.
- Send, edit, delete, and load room messages; attach images to messages.
- Track active room members, typing activity, and read progress in real time.
- Create journal entries with optional images, react with emoji, and remove entries.
- Request streamed AI feedback on a journal entry, informed by semantically similar entries from the same author and room.
- Generate daily room digests from journal activity.
- Manage a profile, including profile text and avatar.
- Use the responsive React application with persistent light/dark theme selection.

## Architecture

### System view

```text
┌─────────────────────────────────────┐
│ React + Vite browser application     │
│ pages, components, contexts, services│
└───────────────┬─────────────────────┘
                │ HTTP/JSON + SSE
                │ Socket.IO
┌───────────────▼─────────────────────┐
│ Express 5 / Node.js HTTP server      │
│ auth, room-access middleware, routes │
│ controllers, Socket.IO event handlers│
└───────┬───────────┬───────────┬─────┘
        │           │           │
   MongoDB       Redis      Cloudinary
 durable data   cache,      image storage
                presence,
                BullMQ
                  │
          ┌───────┴────────┐
          │ BullMQ workers │
          │ journal vectors│
          │ room digests   │
          └───┬────────┬───┘
              │        │
          Gemini AI  Pinecone
          feedback   vector search
          + summaries
```

The frontend is a Vite-built React single-page application. It calls the backend through a small fetch-based API service and maintains an authenticated Socket.IO connection for room events. The backend creates one HTTP server shared by Express and Socket.IO. Express routes handle request/response operations; Socket.IO handles live collaboration; BullMQ queues keep embedding and digest tasks out of the immediate journal-write path.

### Backend request boundaries

- **Authentication middleware** verifies bearer JWTs for `/auth` routes. The Socket.IO handshake also verifies a token before accepting the connection.
- **Room membership middleware** protects room-scoped REST operations. Room membership is checked separately from account authentication.
- **Routers** map URL patterns and middleware to controller handlers.
- **Controllers** coordinate persistence and service calls, and emit room updates when connected clients need to reflect a change.
- **Services and integrations** encapsulate AI generation and email delivery; configuration modules initialize Redis, Pinecone, and Cloudinary clients.
- **Workers** consume BullMQ queues for journal embedding and daily digest generation. They are loaded by the backend entry point and use dedicated Redis connections required by BullMQ.

### Main data paths

#### Chat and presence

1. A client authenticates its socket with its JWT and joins a room.
2. The server joins the Socket.IO room, updates a Redis presence set, and broadcasts the member list.
3. The server fetches the latest 30 messages from MongoDB, populates sender display fields, and emits the history to the joining socket.
4. New chat messages are validated and saved to MongoDB before being broadcast to the room. Typing events are transient socket broadcasts; read progress is persisted as a read-receipt record.

#### Journal and semantic indexing

1. A member creates a journal entry through the authenticated room route. Text and optional Cloudinary image references are persisted in MongoDB.
2. The entry is immediately broadcast to the room. If it contains text, an embedding job is enqueued rather than making the browser wait for embedding generation.
3. The journal worker generates an embedding, stores it on the Mongo record, and upserts the vector plus room/author/content metadata into Pinecone.
4. On an AI-feedback request, the server first checks Redis, then the Mongo entry's saved AI response. On a cache miss it queries Pinecone for up to five candidates filtered to the same room and author, removes the current entry, and uses up to two historical entries as context.
5. Gemini output is streamed to the client as Server-Sent Events. The completed response is stored on the journal entry, cached in Redis for 24 hours, and its vector metadata is updated.

#### Daily room digest

The scheduled job runs at midnight in `Asia/Kolkata`. It queues room IDs in batches of ten. Digest workers retrieve the previous day's journal entries using a MongoDB aggregation, group entries by room, ask Gemini for a summary, and bulk-upsert digest records. Redis records rooms processed for that date; a unique `(room, dateKey)` MongoDB index provides a second guard against duplicate daily digests. Failed work is allowed to retry through BullMQ with exponential backoff.

### Persistence model

| Record | Purpose and notable fields |
| --- | --- |
| `User` | Account identity, bcrypt password hash, profile text, avatar/image references, status. |
| `Room` | Name, owner, description, member IDs, privacy flag, invite code, timestamps. |
| `Message` | Room, sender, text/image, timestamps; indexed by room and descending creation time for room history. |
| `Journal` | Room, author, text/image, reactions, embedding, AI response, timestamps. |
| `ReadReceipt` | Per-user room read position. |
| `Digest` | Room, bot author, summary content, date key; unique room/date index enforces one record per day. |

MongoDB stores durable application state. Redis is used for ephemeral presence, AI-response caching, digest idempotency state, and BullMQ job transport. Pinecone stores vectors for semantic retrieval; Cloudinary stores uploaded image assets.

## Feature details

### Accounts and profiles

- Registration normalizes usernames and email addresses, checks required input and basic email syntax, checks for an existing username/email, and hashes passwords with bcrypt.
- Login verifies the bcrypt hash and returns a JWT with a one-hour expiry.
- Profile endpoints read and update profile details and avatar. Profile responses omit the password field.
- Socket connections use the same signed-token approach at handshake time.
- **Verification status:** the repository contains a Redis-backed verification handler and an email service, but the active registration controller currently saves the account directly. Do not treat email verification as an active requirement without enabling that flow.

### Rooms and collaboration

- Create a room and share its generated invite code; join an existing room through that code.
- Owners can delete their rooms; members can leave.
- The client presents each room's chat and journal as tabs, with a member list and invite-code action.
- Presence uses Redis sets with a 180-second expiry; connect, switch, leave, and disconnect handlers update room membership broadcasts.

### Chat

- Socket.IO delivers new messages, typing state, and read-progress updates in real time.
- REST routes provide message history and support message creation, editing, and deletion; image attachments are stored in Cloudinary.
- Joining a socket room returns the most recent 30 messages. The message schema has a compound room/time index to support this lookup.
- Server-side socket validation rejects empty text-and-image messages and text longer than 1,000 characters.

### Journal and AI

- Journal entries support text and optional images. Reactions are grouped by emoji and member; reacting again toggles that member's reaction.
- Journal content is searchable by meaning after its asynchronous embedding job completes.
- AI feedback uses a Gemini streaming response and a short historical context selected from Pinecone matches for the same room and author.
- Results are cached for 24 hours in Redis and also saved on the MongoDB journal entry, so later requests can return the saved result without invoking the model again.
- Deleting a journal entry also attempts to remove its Cloudinary image, Pinecone vector, and Redis AI cache entry, then broadcasts the deletion. External cleanup failures are logged separately so the primary database deletion can still complete.
- Journal listing merges normal journal entries with daily digest records for the room.

### Daily digests

- A nightly job summarizes the prior day's journal entries, with date boundaries computed in the `Asia/Kolkata` timezone.
- Summaries are persisted as digest records and shown alongside journal entries.
- Jobs are split into batches of ten rooms and digest workers are configured with concurrency three.
- A date-scoped Redis processed-room set, a unique MongoDB room/date index, and retryable queue jobs help avoid duplicate work and recover from transient failures.

### Media and interface

- Multer streams image uploads to Cloudinary; the backend accepts JPG, JPEG, PNG, and WebP and limits files to 5 MB.
- The React UI includes landing, auth, workspace, profile, chat, journal, room and member interfaces, notification context, and persistent theme selection.

## Efficiency and reliability

DARC uses several practical techniques to keep interactive paths responsive and bound unnecessary work:

- **Move expensive work off the write path:** journal creation persists and broadcasts promptly, then queues embedding generation. AI summaries are requested on demand; daily digests run in background workers.
- **Limit history payloads:** socket room joins load the newest 30 messages rather than the entire conversation. Read-only Mongoose queries use `lean()` where appropriate, and returned records select fields needed by the client.
- **Index frequent lookups:** messages have a `{ room: 1, createdAt: -1 }` index; digests have a unique `{ room: 1, dateKey: 1 }` index.
- **Cache expensive model output:** Redis serves AI responses for 24 hours; MongoDB also persists the response, allowing cache repopulation and serving without another model call.
- **Bound vector retrieval:** Pinecone queries are filtered by room and author and request a small top-K candidate set before selecting at most two historical examples.
- **Batch scheduled processing:** daily jobs enqueue ten rooms per batch, aggregate journal data server-side, and use bulk writes rather than one digest write per record.
- **Control worker concurrency:** the embedding worker processes one job at a time to avoid overloading the embedding API; digest workers run at concurrency three.
- **Retry transient jobs:** queue additions configure three attempts with exponential backoff starting at two seconds.
- **Use atomic Redis operations for presence:** related set and expiry operations are grouped in Redis transactions; the socket handler avoids duplicate room joins.

These are implementation choices, not published throughput claims. Use the included token/socket benchmark scripts with a representative deployment to measure actual latency, throughput, and service limits.

## Technology

| Area | Technologies |
| --- | --- |
| Frontend | React 19, React Router 7, Vite 8, Socket.IO client, Framer Motion |
| Backend | Node.js (>=22.3), Express 5, Socket.IO, ES modules |
| Data | MongoDB, Mongoose, Redis / ioredis |
| Background jobs | BullMQ, Node Cron |
| AI and retrieval | Google Gemini APIs, Pinecone |
| Media and email | Cloudinary, Google Gmail API integration |
| Security and utilities | JWT, bcrypt, CORS, nanoid, Luxon, Multer |

## Repository layout

```text
Darc/
├── backend/
│   ├── index.js                 # Express/HTTP/Socket.IO bootstrap; loads workers and digest schedule
│   ├── package.json             # Backend scripts and dependencies
│   ├── benchmarks/              # Token-generation and Socket.IO load-test assets
│   └── src/
│       ├── config/              # Redis, Pinecone, and Cloudinary clients
│       ├── controllers/         # Account, profile, room, message, and journal handlers
│       ├── jobs/                # Scheduled digest enqueueing
│       ├── middlewares/         # Authentication, room access, and AI limits
│       ├── model/               # Mongoose schemas
│       ├── queue/               # BullMQ queue and Redis connections
│       ├── routers/             # HTTP route definitions
│       ├── services/            # AI and email integrations
│       ├── sockets/             # Socket.IO auth and event handlers
│       ├── utils/               # Digest date/state helpers
│       └── workers/             # Embedding and digest consumers
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── assets/              # UI images and static assets
│       ├── components/          # Chat, journal, room, profile, and landing components
│       ├── context/             # Authentication and toast state
│       ├── pages/               # Landing, auth, workspace, and profile pages
│       ├── services/            # REST API and Socket.IO clients
│       └── styles/              # Application and component styles
├── package.json                # Root manifest
└── README.md
```

## Run locally

### Requirements

- Node.js **22.3 or later** and npm.
- MongoDB and Redis, locally or hosted.
- Credentials for the external integrations you plan to use: Gemini, Pinecone, and Cloudinary. Gmail OAuth credentials are needed only if you enable the email workflow.

### 1. Get the code

```bash
git clone https://github.com/bhargavmane1802/Darc.git
cd Darc
```

### 2. Configure and run the backend

```bash
cd backend
npm install
```

Create `backend/.env` using the [environment-variable reference](#environment-variables), then start the server:

```bash
npm run dev
```

The API and Socket.IO server listen on port `8080` by default (or `PORT` if set).

### 3. Configure and run the frontend

In another terminal:

```bash
cd frontend
npm install
```

Set `VITE_API_URL` in `frontend/.env` to the backend origin, for example:

```env
VITE_API_URL=http://localhost:8080
```

Then start Vite:

```bash
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`). Configure `FRONTEND_URL` on the backend to that exact origin for CORS. Create an account, sign in, and create or join a room.

## Environment variables

Create a private `backend/.env`; never commit credentials. Variable names below follow the current backend source, including its existing capitalization.

| Variable | Used for |
| --- | --- |
| `PORT` | Backend HTTP/Socket.IO port; defaults to `8080`. |
| `Mongo_Url` | MongoDB connection string. |
| `FRONTEND_URL` | Allowed browser origin and verification redirect origin. |
| `Jwt_Key` | Secret used to sign and verify API and Socket.IO JWTs. Use a long, random secret. |
| `REDIS_URL` | Redis connection for application state and BullMQ; code has a localhost fallback for development. |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary account cloud name. |
| `CLOUDINARY_API_KEY` | Cloudinary API key. |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret. |
| `PINECONE_API_KEY` | Pinecone API key; current configuration selects the `airesponse` index in code. |
| `Llm_Api_Key1` | Gemini key configured for digest worker 1. |
| `Llm_Api_Key2` | Gemini key used by journal AI/embedding service and digest worker 2. |
| `GOOGLE_CLIENT_ID` | Gmail OAuth client ID for the email helper. |
| `GOOGLE_CLIENT_SECRET` | Gmail OAuth client secret for the email helper. |
| `REFRESH_TOKEN` | Gmail OAuth refresh token for the email helper. |
| `BACKEND_URL` | Backend base URL used when constructing email-verification links. |

The frontend reads `VITE_API_URL` from `frontend/.env`. The backend's active registration path currently does not send a verification email, despite the email-related helper and route being present.

## HTTP API

All `/auth/*` routes require `Authorization: Bearer <JWT>`. Room-scoped message and journal routes additionally apply room-membership checks. The exact request bodies are implemented in the route/controller files.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/user/register` | Register with username, password, and email. |
| `POST` | `/user/login` | Authenticate and receive a JWT. |
| `GET` | `/user/verify/:id` | Legacy Redis-backed email verification handler; not part of active registration. |
| `GET` | `/auth/profile/user` | Read current profile. |
| `PATCH` | `/auth/profile/user` | Update profile text/status. |
| `PATCH` | `/auth/profile/user/avatar` | Upload/update profile avatar (`image` form field). |
| `GET` | `/auth/room/my-rooms` | List the signed-in user's rooms. |
| `POST` | `/auth/room/create` | Create a room. |
| `GET` | `/auth/room/join/:inviteCode` | Join a room by invite code. |
| `DELETE` | `/auth/room/remove/:name` | Delete a room (owner only). |
| `GET` | `/auth/message/:roomId/display` | Load room messages. |
| `POST` | `/auth/message/:roomId/create` | Create a message, optionally with an image. |
| `PUT` | `/auth/message/:roomId/update/:messageId` | Edit a message. |
| `DELETE` | `/auth/message/:roomId/delete/:messageId` | Delete a message. |
| `GET` | `/auth/journal/:roomId/display` | List journal entries and room digests. |
| `POST` | `/auth/journal/:roomId/create` | Create a journal entry, optionally with an image. |
| `DELETE` | `/auth/journal/:roomId/delete/:journalId` | Delete a journal entry and attempt related asset/cache/vector cleanup. |
| `GET` | `/auth/journal/:roomId/aiResponse/:journalId` | Stream AI feedback as Server-Sent Events. |
| `PATCH` | `/auth/journal/:roomId/reaction/:journalId` | Toggle an emoji reaction. |
| `POST` | `/auth/upload` | Upload an image (`image` multipart field; max 5 MB). |

The AI endpoint emits SSE `data:` events containing JSON with `token` chunks, followed by a `[DONE]` token. Errors are sent as JSON data events.

## Socket.IO events

Connections authenticate with the JWT in the Socket.IO handshake `auth.token` field. Clients should join only rooms they are authorized to access through the application.

| Direction | Event | Data / behavior |
| --- | --- | --- |
| Client → server | `join_room` | `{ room_id }`; joins the socket room, updates presence, and returns recent message history. |
| Client → server | `switch_room` | Previous room ID; removes the user from its presence set and leaves it. |
| Client → server | `leave_room` | Room ID; removes the user from the room membership and presence. |
| Client → server | `message_send` | `{ room_id, content, imageUrl }`; validates, persists, and broadcasts a message. |
| Client → server | `typing_start` / `typing_end` | `{ room_id }`; transient typing state. |
| Client → server | `read_message` | `(room_id, message_id)`; advances persisted read progress. |
| Server → client | `message_display` | Recent message history sent to the joining socket. |
| Server → client | `message_new` | Newly saved room message. |
| Server → client | `update_message` / `delete_message` | Message edit/deletion notifications. |
| Server → client | `is_typing` / `stop_typing` | Typing user's username and ID. |
| Server → client | `room_members` | `{ room_id, members }` presence update. |
| Server → client | `readUpdate_message` | `{ room_id, user_id, lastReadMessageId }` read-progress update. |
| Server → client | `create_journal` / `update_journal` / `delete_journal` | Journal change notifications. |
| Server → client | `reaction_journal` | `{ entryId, reactions }` updated reaction groups. |
| Server → client | `error` | `{ message }` for a socket operation error. |

## Tests and performance scripts

From `backend/`:

```bash
npm test                 # Node.js built-in test runner
npm run bench:tokens     # Generate benchmark token data
npm run bench:socket     # Run the Artillery Socket.IO load scenario
npm run bench:report     # Build an Artillery report from the saved run
```

The Socket.IO benchmark uses Artillery; install it in your environment if it is not already available. Benchmark outputs and results are local run artifacts, not guarantees of production performance. Run tests and load tests against isolated development/test services, not production data.

## Deployment notes

- Build and host the frontend with Vite-compatible static hosting (the repository's Vercel configuration is under `frontend/`). Set `VITE_API_URL` to the deployed backend URL.
- Deploy the backend to a Node.js host that supports long-lived HTTP connections for Socket.IO and SSE. Set `PORT` and all required secrets in the host's environment configuration.
- Use managed MongoDB and Redis services for production. BullMQ workers depend on Redis; journal vector indexing and digest processing also depend on Gemini and Pinecone credentials.
- Set `FRONTEND_URL` to the exact production frontend origin and configure the host/proxy to permit WebSocket upgrades and SSE streaming.
- Use HTTPS, strong secrets, restricted CORS origins, and appropriately scoped service credentials. Do not expose server-only credentials through `VITE_` variables.

---

DARC is an evolving project. If behavior changes, update this document alongside the corresponding routes, models, worker flows, and deployment configuration.
