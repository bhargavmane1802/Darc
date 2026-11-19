# DARC — Developer Collaboration Hub

DARC is a collaborative workspace for software teams. Each room brings together real-time chat, a shared development journal, lightweight presence, and AI-assisted summaries and feedback.

**Live app:** [darc-pearl.vercel.app](https://darc-pearl.vercel.app/app)  
**Repository:** [bhargavmane1802/Darc](https://github.com/bhargavmane1802/Darc)

> This README describes the implementation currently in the repository. Application operations use Socket.IO events; the former Express REST route registrations are commented out. Registration currently creates an account directly: the email-verification handler and email service exist, but verification is not part of active registration.

## Contents

- [What DARC does](#what-darc-does)
- [Architecture](#architecture)
- [Features](#features)
- [Technology](#technology)
- [Repository layout](#repository-layout)
- [Run locally](#run-locally)
- [Environment variables](#environment-variables)
- [Socket.IO API](#socketio-api)
- [Background and real-time events](#background-and-real-time-events)
- [Tests and performance scripts](#tests-and-performance-scripts)
- [Deployment notes](#deployment-notes)

## What DARC does

DARC is organized around **rooms**. Members join rooms with an invite code, then switch between chat and a shared journal. Chat, presence, typing, and read progress update in real time. Journal entries preserve project notes and progress; AI feedback and daily digests add summaries and context.

Core capabilities include room and member management, real-time chat, journal entries and reactions, image uploads, AI feedback, daily digests, profile management, and a responsive React interface with persistent theme selection.

## Architecture

```text
┌─────────────────────────────────────┐
│ React + Vite browser application     │
│ pages, components, contexts, services│
└───────────────┬─────────────────────┘
                │ Socket.IO events + acknowledgements
                │ (WebSocket, with polling fallback)
┌───────────────▼─────────────────────┐
│ Node.js / Express HTTP server        │
│ Socket.IO auth, event handlers       │
│ controllers and integrations         │
└───────┬───────────┬───────────┬─────┘
        │           │           │
     MongoDB      Redis     Cloudinary
   durable data  cache,       images
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

The frontend connects to the backend using Socket.IO. Request/response operations emit an event and receive a Socket.IO acknowledgement; live updates are delivered as server-emitted events. The backend still runs on an HTTP server because Socket.IO is attached to it, but the Express REST route registrations in `backend/index.js` are disabled. Socket.IO's polling fallback is a transport mechanism, not a separately documented REST API.

The socket handshake can verify a JWT supplied in `auth.token`. Login, registration, and the legacy verification event are public; other application events pass through the socket authentication guard. Room-specific handlers perform room membership checks where applicable. MongoDB stores durable records, Redis supports presence/caching and BullMQ, and workers handle journal embeddings and scheduled digests.

Journal text is indexed asynchronously. AI feedback is requested over a socket event and streamed as socket events (not Server-Sent Events). Daily digests are produced by scheduled BullMQ jobs.

## Features

- **Accounts and profiles:** Register, log in, read/update profile details, and update an avatar. Login returns a JWT. Email verification helpers exist, but the active registration flow does not send a verification email.
- **Rooms:** Create rooms, join by invite code, list your rooms, remove a room as its owner, or leave a room.
- **Chat and presence:** Send, edit, delete, and load messages; upload optional images; track room members, typing state, and read progress. Joining a room broadcasts presence and returns up to 30 recent messages.
- **Journal and AI:** Create and delete room journal entries, add/remove emoji reactions, and request streamed AI feedback. Text embeddings are generated asynchronously; AI output is cached in Redis and saved to MongoDB.
- **Daily digests:** A scheduled job summarizes the previous day's journal activity using the `Asia/Kolkata` timezone.
- **Media:** Images are stored in Cloudinary. Socket image uploads accept base64/data URI, binary data, or a URL; the upload handler enforces a 5 MB limit for binary and data URI payloads.

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
│   ├── index.js                 # HTTP/Socket.IO bootstrap; loads workers and digest schedule
│   ├── package.json             # Backend scripts and dependencies
│   ├── benchmarks/              # Token-generation and Socket.IO load-test assets
│   └── src/
│       ├── config/              # Redis, Pinecone, and Cloudinary clients
│       ├── controllers/         # Account, profile, room, message, and journal handlers
│       ├── jobs/                # Scheduled digest enqueueing
│       ├── middlewares/         # Authentication, room access, and AI limits
│       ├── model/               # Mongoose schemas
│       ├── queue/               # BullMQ queues and Redis connections
│       ├── routers/             # Socket event registrars (legacy HTTP routes are disabled)
│       ├── services/            # AI and email integrations
│       ├── sockets/             # Socket.IO authentication and core event handlers
│       ├── utils/               # Digest date/state helpers
│       └── workers/             # Embedding and digest consumers
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── components/          # Chat, journal, room, profile, and landing components
│       ├── context/              # Authentication and toast state
│       ├── pages/                # Landing, auth, workspace, and profile pages
│       ├── services/              # Socket.IO client and event-based API helpers
│       └── styles/                # Application and component styles
├── package.json                 # Root manifest
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

The HTTP server and Socket.IO listen on port `8080` by default (or `PORT` if set). The HTTP server is required for the Socket.IO connection and its configured transports; application features are accessed through socket events.

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

Open the local URL printed by Vite (normally `http://localhost:5173`). Configure `FRONTEND_URL` on the backend to that exact origin for Socket.IO CORS. Create an account, sign in, and create or join a room.

## Environment variables

Create a private `backend/.env`; never commit credentials. Variable names below follow the current backend source, including its existing capitalization.

| Variable | Used for |
| --- | --- |
| `PORT` | Backend HTTP/Socket.IO port; defaults to `8080`. |
| `Mongo_Url` | MongoDB connection string. |
| `FRONTEND_URL` | Allowed browser origin for CORS. |
| `Jwt_Key` | Secret used to sign and verify JWTs. Use a long, random secret. |
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

The frontend reads `VITE_API_URL` from `frontend/.env`. The active registration path currently does not send a verification email, despite the email-related helper and verification event being present.

## Socket.IO API

There are no active Express REST endpoints for these application operations. Connect to the backend Socket.IO server and emit the request event with its payload and an optional acknowledgement callback. The frontend's `socketRequest(event, data)` helper wraps this pattern in a promise. Authenticated events require a valid socket JWT; the token is sent in the handshake `auth.token` field. The `user:*` login and registration events are public.

The event names below are the canonical event names used by the frontend and/or registered by the backend. Payloads are JavaScript objects unless noted. The backend also registers legacy aliases for some operations; those aliases are omitted here to keep the API reference concise.

### Authentication and account

| Event | Auth | Payload | Purpose / acknowledgement |
| --- | --- | --- | --- |
| `user:register` | No | `{ username, password, email }` | Register an account. |
| `user:login` | No | `{ username, password }` | Log in; acknowledgement includes the JWT token on success. |
| `user:verify` | No | Verification data expected by the legacy handler | Legacy verification handler; not used by active registration. |

After login, the frontend stores the JWT and updates the socket authentication for subsequent protected requests. The server may require reconnecting for a new handshake token, depending on the current socket connection state.

### Profile and image upload

| Event | Auth | Payload | Purpose / acknowledgement |
| --- | --- | --- | --- |
| `profile:details` | Yes | `{}` | Return the current profile. |
| `profile:update` | Yes | `{ name, about, status }` | Update profile details. |
| `profile:avatar` | Yes | `{ imageUrl, publicId }` | Set/update the profile avatar using an uploaded image reference. |
| `upload:image` | Yes | `{ image }` (or `{ file }`); image may be a base64/data URI, binary value, or URL | Upload to Cloudinary; acknowledgement returns `{ status, imageUrl, publicId }`. Data URI/binary uploads are limited to 5 MB. |

The frontend uploads a file with `upload:image` first, then passes the returned image reference to `profile:avatar`, message send, or journal creation.

### Rooms

| Event | Auth | Payload | Purpose / acknowledgement |
| --- | --- | --- | --- |
| `room:my_rooms` | Yes | `{}` | List the signed-in user's rooms. |
| `room:create` | Yes | `{ name, description }` | Create a room. |
| `room:join` | Yes | `{ inviteCode }` | Join a room by invite code. |
| `room:remove` | Yes | `{ name }` | Remove a room (owner only). |

Room membership and presence events such as `join_room`, `switch_room`, and `leave_room` are listed under [Background and real-time events](#background-and-real-time-events).

### Messages

| Event | Auth | Payload | Purpose / acknowledgement |
| --- | --- | --- | --- |
| `message:display` | Yes | `{ roomId }` | Load a room's message history. |
| `message:send` | Yes | `{ roomId, content, imageUrl, publicId? }` | Send a message, optionally with an uploaded image. |
| `message:update` | Yes | `{ roomId, messageId, content }` | Edit a message. |
| `message:delete` | Yes | `{ roomId, messageId }` | Delete a message. |
| `message:read` | Yes | `{ roomId, messageId }` | Advance the user's persisted read position. |

### Journal and AI feedback

| Event | Auth | Payload | Purpose / acknowledgement |
| --- | --- | --- | --- |
| `journal:display` | Yes | `{ roomId }` | List journal entries and room digests. |
| `journal:create` | Yes | `{ roomId, content, imageUrl?, publicId? }` | Create an entry, optionally with an uploaded image. |
| `journal:delete` | Yes | `{ roomId, journalId }` | Delete an entry and attempt associated asset/cache/vector cleanup. |
| `journal:reaction` | Yes | `{ roomId, journalId, emoji }` | Toggle an emoji reaction. |
| `journal:ai_response` | Yes | `{ roomId, journalId }` | Request AI feedback; token chunks and completion are delivered as separate events below. |

AI feedback is streamed over Socket.IO, not SSE. The request acknowledges errors/initial status; the stream is delivered using `ai_response` events. The journal AI handler applies a daily limit of 10 requests per user.

## Background and real-time events

These events are distinct from request/acknowledgement operations. For request events that accept an acknowledgement callback, the callback receives the operation result or an error object (typically with `status` and `message`). Errors may also be emitted as `error`.

| Direction | Event | Data / behavior |
| --- | --- | --- |
| Client → server | `join_room` | `{ room_id }`; joins a Socket.IO room, updates presence, and sends recent message history to the joining socket. |
| Client → server | `switch_room` | Previous room ID; removes the user from the old room's presence set and leaves it. |
| Client → server | `leave_room` | Room ID; removes the user from the room membership and presence. |
| Client → server | `typing_start` / `typing_end` | `{ room_id }`; broadcasts transient typing state. |
| Server → client | `message_display` | Recent message history sent to a joining socket. |
| Server → client | `message_new` | Newly saved room message. |
| Server → client | `update_message` / `delete_message` | Message edit/deletion notifications. |
| Server → client | `is_typing` / `stop_typing` | Typing user's username and ID. |
| Server → client | `room_members` | `{ room_id, members }` presence update. |
| Server → client | `readUpdate_message` | `{ room_id, user_id, lastReadMessageId }` read-progress update. |
| Server → client | `create_journal` / `update_journal` / `delete_journal` | Journal change notifications. |
| Server → client | `reaction_journal` | `{ entryId, reactions }` updated reaction groups. |
| Server → client | `ai_response` | AI output chunks, including a `[DONE]` token when complete. |
| Server → client | `ai_response_done` | AI response completion notification. |
| Server → client | `rate_limit_status` | `{ remaining, limit }` AI request allowance update. |
| Server → client | `upload_success` / `image_uploaded` | `{ imageUrl, publicId }` upload notifications. |
| Server → client | `error` | Error details for a socket operation. |

The server also handles Socket.IO connection lifecycle events such as `disconnecting` and `disconnect`. Daily room digests run in background workers; they are not initiated by a client-facing route/event.

## Tests and performance scripts

From `backend/`:

```bash
npm test                 # Node.js built-in test runner
npm run bench:tokens     # Generate benchmark token data
npm run bench:socket     # Run the Artillery Socket.IO load scenario
npm run bench:report     # Build an Artillery report from the saved run
```

The backend tests cover controllers, middleware, services, Socket.IO handlers, digest jobs, and workers. The Socket.IO benchmark uses Artillery; install it in your environment if it is not already available. Benchmark outputs are local run artifacts, not guarantees of production performance. Run tests and load tests against isolated development/test services, not production data.

## Deployment notes

- Build and host the frontend with Vite-compatible static hosting (the repository's Vercel configuration is under `frontend/`). Set `VITE_API_URL` to the deployed backend origin.
- Deploy the backend to a Node.js host that supports Socket.IO long-lived connections and WebSocket upgrades. Set `PORT` and required secrets in the host's environment configuration.
- Use managed MongoDB and Redis services for production. BullMQ workers depend on Redis; journal vector indexing and digest processing also depend on Gemini and Pinecone credentials.
- Set `FRONTEND_URL` to the exact production frontend origin and configure the host/proxy to permit Socket.IO WebSocket upgrades (and polling fallback).
- Use HTTPS, strong secrets, restricted CORS origins, and appropriately scoped service credentials. Do not expose server-only credentials through `VITE_` variables.

---

DARC is an evolving project. If behavior changes, update this document alongside the corresponding socket events, models, worker flows, and deployment configuration.
