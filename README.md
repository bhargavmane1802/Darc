# 🚀 DARC — Developer Collaboration Hub

A **real-time developer collaboration platform** that combines instant messaging, collaborative journaling, and AI-powered insights. DARC enables distributed teams to communicate seamlessly, document shared knowledge, and receive intelligent feedback powered by Google's Generative AI.

**Live Demo:** [darc-nine.vercel.app](https://darc-nine.vercel.app)

---

## 📋 Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Core Components](#core-components)
- [Advanced Features](#advanced-features)
- [Environment Setup](#environment-setup)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

DARC is a **monorepo** featuring a **React 19 + Vite frontend** and a **Node.js + Express 5 backend**. It leverages:

- **Real-time Communication**: Socket.IO for instant messaging and presence tracking
- **Vector Search**: Pinecone for semantic search and intelligent context
- **AI Integration**: Google Generative AI for streaming feedback on journal entries
- **Caching & Performance**: Redis for rate limiting, caching, and session management
- **Scheduled Tasks**: Node Cron for daily digest generation and automated summaries

This is a **collaborative workspace** where teams can:
1. Create or join rooms for project-based communication
2. Chat in real-time with typing indicators and read receipts
3. Document ideas and decisions in a shared journal
4. Get AI-powered analysis and feedback on journal entries
5. Receive daily AI-generated summaries of room activity

---

## ✨ Key Features

### 🔐 Authentication & User Management
- **Secure Registration & Login** with bcrypt password hashing
- **JWT-based Authentication** for API endpoints and WebSocket connections
- **Session Management** with localStorage persistence
- **User Profiles** with avatar support and status indicators

### 💬 Real-Time Messaging
- **Instant Messaging** with WebSocket-powered delivery
- **Message History** (last 30 messages) loaded on room join
- **Typing Indicators** — See when others are typing in real-time
- **Read Receipts** — Track message read status across the room
- **Image Support** — Send messages with embedded media via Cloudinary
- **Message Editing** — Update sent messages (REST API)
- **Message Deletion** — Remove messages with cascading cleanup

### 📔 Collaborative Journaling
- **Journal Entries** — Rich text notes with optional image attachments
- **CRUD Operations** — Create, edit, delete entries in real-time
- **Real-Time Sync** — All room members see updates instantly via WebSocket
- **Emoji Reactions** — Quick reactions on any journal entry (👍, 🔥, 🎉, 💡, ❤️)
- **Reaction Broadcasting** — Live reaction updates across the room

### 🤖 AI-Powered Insights
- **Streaming AI Feedback** — Contextual analysis on journal entries via SSE
- **Semantic Context** — Pinecone vector similarity finds related past entries
- **Smart Caching** — Redis caches AI responses for instant retrieval
- **Rate Limiting** — Daily credits system prevents abuse
- **Vector Embeddings** — Automatic semantic indexing of all entries
- **Historical Context** — AI references 2 most similar past entries for informed feedback

### 📊 Daily Digest Job
- **Automated Summaries** — Runs nightly at midnight (IST) to generate room digests
- **Sliding Window Processing** — Processes up to 3 rooms concurrently
- **Idempotency** — Redis tracks processed rooms to prevent duplicate digests
- **AI Bot Persona** — Special "AI Mentor" user posts digests
- **Smart Batching** — Aggregates entries by room for efficiency

### 🏠 Room Management
- **Create Rooms** — Owner creates collaborative spaces
- **Join via Invite Code** — Unique invite codes for easy sharing
- **Room Metadata** — Name, description, privacy flags
- **Member Tracking** — Real-time presence awareness (who's online)
- **Room Deletion** — Owner-only permission to remove rooms
- **Presence Expiry** — Redis auto-expires inactive members after 3 minutes

### 📤 File Uploads
- **Cloudinary Integration** — Reliable cloud storage for images
- **Multipart Form Data** — Efficient file streaming
- **Automatic URL Generation** — Images embedded in messages and journals
- **Public ID Tracking** — Asset management across the platform

### 🎨 Modern UI/UX
- **React 19** — Latest features and optimizations
- **React Router v7** — Nested routing with lazy loading
- **Vite** — Lightning-fast dev server and builds
- **Toast Notifications** — Success, error, and info feedback
- **Context API** — Auth and notification state management
- **Responsive Design** — Mobile-first, CSS-driven layout
- **Glassmorphism** — Modern visual effects

---

## 🛠️ Tech Stack

### **Frontend**
| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 19.2.6 | UI framework |
| **React Router DOM** | 7.15.0 | Client-side routing |
| **Vite** | 8.0.1 | Build tool & dev server |
| **Socket.io-client** | 4.8.3 | Real-time communication |
| **ES Modules** | - | Modern JavaScript |

### **Backend**
| Technology | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | 18+ | Runtime |
| **Express** | 5.2.1 | HTTP framework |
| **MongoDB** | - | Document database |
| **Mongoose** | 9.3.3 | ODM for MongoDB |
| **Socket.io** | 4.8.3 | WebSocket server |
| **JWT** | 9.0.3 | Token-based auth |
| **Bcrypt** | 6.0.0 | Password hashing |
| **Google Generative AI** | 0.24.1 | AI feedback streaming |
| **Pinecone** | 7.2.0 | Vector database |
| **Redis/IORedis** | 5.10.1 | Caching & presence |
| **Multer** | 2.1.1 | File upload middleware |
| **Cloudinary** | 1.41.3 | Cloud storage |
| **Node Cron** | 4.2.1 | Scheduled jobs |
| **Helmet** | 8.1.0 | Security headers |
| **CORS** | 2.8.6 | Cross-origin requests |
| **Dotenv** | 17.4.2 | Environment config |
| **p-limit** | 7.3.0 | Concurrency control |
| **nanoid** | 5.1.7 | Unique ID generation |

---

## 🏗️ Architecture

### **System Design**

```
┌─────────────────────────────────────────────────────────────┐
│                     DARC System Architecture                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────┐          ┌────────────────────────────┐
│  React Frontend     │          │     Node.js Backend        │
│  (Port 5173)        │◄────────►│     (Port 8080)            │
│                     │          │                            │
│ • Landing Page      │   REST   │ • User Routes              │
│ • Auth UI           │    &     │ • Room Management          │
│ • ChatPanel         │  Socket  │ • Message Service          │
│ • JournalPanel      │   .IO    │ • Journal CRUD             │
│ • AppShell          │          │ • File Upload              │
│ • Toast System      │          │ • AI Feedback (SSE)        │
└─────────────────────┘          │ • Digest Job               │
           │                     └────────────────────────────┘
           │                               │
           │                               ├──► MongoDB (Data)
           │                               ├──► Redis (Cache/Presence)
           │                               ├──► Pinecone (Vectors)
           │                               ├──► Cloudinary (Media)
           │                               └──► Google GenAI (LLM)
           │
           └──────► .env (Frontend Config)

```

### **Data Flow**

```
Message Send Flow:
User Input → Frontend Action → Socket.emit → Backend Handler → 
  Validate → Save to MongoDB → Broadcast to Room → Update Frontend

AI Feedback Flow:
Journal Entry Created → Generate Embeddings → Store in Pinecone → 
  User Requests AI → Fetch Similar Entries → Stream AI Response → 
  Cache in Redis → Save aiResponse in MongoDB

Digest Generation:
Cron Job (Midnight) → Find Entries (Last 24h) → Group by Room → 
  Process with p-limit (max 3 concurrent) → Generate AI Summary → 
  Create Digest Entry → Emit to Room → Mark in Redis Cache
```

---

## 📁 Project Structure

```
Darc/
├── backend/                          # Node.js + Express
│   ├── index.js                      # Server entry point
│   ├── package.json                  # Backend dependencies
│   └── src/
│       ├── config/                   # Configuration files
│       │   ├── redis.js              # Redis client setup
│       │   └── pinecone.js           # Pinecone index init
│       │
│       ├── controllers/              # Request handlers
│       │   ├── user.controller.js    # Login/Register logic
│       │   ├── room.controller.js    # Room CRUD + Invite
│       │   ├── message.controller.js # Message CRUD
│       │   └── journal.controller.js # Journal CRUD + AI
│       │
│       ├── model/                    # Mongoose schemas
│       │   ├── user.model.js         # User schema
│       │   ├── room.model.js         # Room schema
│       │   ├── message.model.js      # Message schema
│       │   ├── journal.model.js      # Journal schema
│       │   └── readReceipt.model.js  # Read status tracking
│       │
│       ├── routers/                  # API route definitions
│       │   ├── user.Router.js        # /user routes
│       │   ├── room.Router.js        # /auth/room routes
│       │   ├── message.Router.js     # /auth/message routes
│       │   ├── journal.Router.js     # /auth/journal routes
│       │   └── upload.routes.js      # /auth/upload routes
│       │
│       ├── middlewares/              # Express middleware
│       │   ├── auth.middleware.js    # JWT verification
│       │   ├── roomMember.middleware.js # Room access check
│       │   └── aiRateLimit.middleware.js # Daily credit limit
│       │
│       ├── services/                 # Business logic
│       │   └── ai.service.js         # AI streaming + embeddings
│       │
│       ├── sockets/                  # WebSocket handlers
│       │   └── socket.js             # Socket.io event handlers
│       │
│       └── jobs/                     # Background tasks
│           └── digest.job.js         # Daily summary generation
│
├── frontend/                         # React + Vite
│   ├── index.html                    # HTML entry point
│   ├── package.json                  # Frontend dependencies
│   ├── vite.config.js                # Vite configuration
│   └── src/
│       ├── main.jsx                  # React app root
│       ├── App.jsx                   # Route definitions
│       │
│       ├── pages/                    # Full-page components
│       │   ├── Landing.jsx           # Public landing page
│       │   ├── Auth.jsx              # Login/Register form
│       │   └── AppShell.jsx          # Main app layout
│       │
│       ├── components/               # Reusable UI components
│       │   ├── ChatPanel.jsx         # Message interface
│       │   ├── JournalPanel.jsx      # Journal interface
│       │   ├── RoomModal.jsx         # Room creation/join
│       │   └── Toast.jsx             # Notification display
│       │
│       ├── context/                  # React Context
│       │   ├── AuthContext.jsx       # Auth state (token, user)
│       │   └── ToastContext.jsx      # Toast state & actions
│       │
│       ├── services/                 # API & Socket utilities
│       │   ├── api.js                # REST API wrapper
│       │   └── socket.js             # Socket.io client
│       │
│       ├── styles/                   # CSS modules
│       │   ├── auth.css              # Auth page styles
│       │   ├── app.css               # Main app styles
│       │   └── components.css        # Component styles
│       │
│       └── assets/                   # Static resources
│           └── favicon.svg           # App icon
│
└── package.json                      # Root manifest (workspace)
```

---

## 🚀 Getting Started

### **Prerequisites**

Before you begin, ensure you have:

- **Node.js** v18+ ([Download](https://nodejs.org/))
- **npm** or **yarn** package manager
- **MongoDB** instance:
  - Local: `mongodb://localhost:27017/darc`
  - Cloud: MongoDB Atlas cluster
- **Redis** (for caching and presence):
  - Local: `redis://localhost:6379`
  - Cloud: Redis Cloud or Upstash
- **Pinecone** account for vector database
- **Google Cloud** Generative AI API key
- **Cloudinary** account for image hosting
- **Git** for version control

### **Step 1: Clone the Repository**

```bash
git clone https://github.com/bhargavmane1802/Darc.git
cd Darc
```

### **Step 2: Backend Setup**

```bash
cd backend
npm install
```

#### Create `.env` file in `backend/` directory:

```env
# Server
PORT=8080

# Database
Mongo_Url=mongodb://localhost:27017/darc
# Or MongoDB Atlas: mongodb+srv://username:password@cluster.mongodb.net/darc

# Authentication
JWT_SECRET=your_super_secret_jwt_key_min_32_chars_recommended
Jwt_Key=your_super_secret_jwt_key_min_32_chars_recommended

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:5173

# Redis Configuration
REDIS_URL=redis://localhost:6379
# Or for Upstash: redis://:password@hostname:port

# Cloudinary (Image Upload)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Google Generative AI
GOOGLE_API_KEY=your_google_generative_ai_api_key

# Pinecone (Vector Database)
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=darc-index
PINECONE_ENVIRONMENT=production  # or your Pinecone environment
```

#### Run Backend:

```bash
# Development (with auto-reload via nodemon)
npm run dev

# Production
npm start
```

Backend will be available at `http://localhost:8080`

### **Step 3: Frontend Setup**

```bash
cd ../frontend
npm install
```

#### Create `.env` file in `frontend/` directory:

```env
VITE_API_URL=http://localhost:8080
```

#### Run Frontend:

```bash
npm run dev
```

Frontend will be available at `http://localhost:5173` (or as shown in terminal)

### **Step 4: Visit the Application**

1. Open browser: `http://localhost:5173`
2. Create an account or log in
3. Create or join a room using an invite code
4. Start chatting and journaling!

---

## 📡 API Reference

All authenticated routes require the `Authorization: Bearer <token>` header.

### **Authentication Routes**

#### Register User
```http
POST /user/register
Content-Type: application/json

{
  "username": "john_doe",
  "password": "secure_password_123"
}
```

**Response:**
```json
{
  "message": "user register redirect to login page"
}
```

#### Login User
```http
POST /user/login
Content-Type: application/json

{
  "username": "john_doe",
  "password": "secure_password_123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

---

### **Room Routes** (Requires Auth)

#### Get My Rooms
```http
GET /auth/room/my-rooms
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "_id": "room_id",
    "name": "Project Alpha",
    "description": "Q4 Planning",
    "inviteCode": "abc123xyz",
    "owner": "owner_user_id",
    "createdAt": "2026-01-15T10:30:00Z"
  }
]
```

#### Create Room
```http
POST /auth/room/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Project Alpha",
  "description": "Q4 Planning discussion"
}
```

**Response:**
```json
{
  "message": "room created",
  "room_id": "507f1f77bcf86cd799439011",
  "inviteCode": "abc123xyz"
}
```

#### Join Room
```http
GET /auth/room/join/:inviteCode
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "username joined the room",
  "room_id": "507f1f77bcf86cd799439011",
  "name": "Project Alpha",
  "description": "Q4 Planning"
}
```

#### Delete Room (Owner Only)
```http
DELETE /auth/room/remove/:roomName
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "room deleted successfully"
}
```

---

### **Message Routes** (Requires Auth + Room Membership)

#### Get Messages
```http
GET /auth/message/:roomId/display
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "_id": "msg_id",
    "sender": {
      "_id": "user_id",
      "username": "john_doe"
    },
    "room": "room_id",
    "content": "Hello everyone!",
    "imageUrl": null,
    "readBy": ["user_id_1", "user_id_2"],
    "createdAt": "2026-05-30T14:22:00Z"
  }
]
```

#### Send Message
```http
POST /auth/message/:roomId/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Hello everyone!"
}
```

**Response:**
```json
{
  "message": "Message created"
}
```

#### Update Message
```http
PUT /auth/message/:roomId/update/:messageId
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Updated message content"
}
```

#### Delete Message
```http
DELETE /auth/message/:roomId/delete/:messageId
Authorization: Bearer <token>
```

---

### **Journal Routes** (Requires Auth + Room Membership)

#### Get Journal Entries
```http
GET /auth/journal/:roomId/display
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "_id": "journal_id",
    "author": {
      "_id": "user_id",
      "username": "john_doe"
    },
    "room": "room_id",
    "content": "Today we discussed architecture",
    "imageUrl": "https://res.cloudinary.com/...",
    "reaction": [
      {
        "emoji": "👍",
        "users": ["user_id_1", "user_id_2"]
      }
    ],
    "aiResponse": "Great point about...",
    "createdAt": "2026-05-30T14:22:00Z"
  }
]
```

#### Create Journal Entry
```http
POST /auth/journal/:roomId/create
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Today we discussed architecture",
  "imageUrl": "https://res.cloudinary.com/..." // optional
}
```

**Response:**
```json
{
  "message": "journal entry created"
}
```

#### Update Journal Entry
```http
PUT /auth/journal/:roomId/update/:journalId
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Updated entry content"
}
```

#### Delete Journal Entry
```http
DELETE /auth/journal/:roomId/delete/:journalId
Authorization: Bearer <token>
```

#### Add Emoji Reaction
```http
PATCH /auth/journal/:roomId/reaction/:journalId
Authorization: Bearer <token>
Content-Type: application/json

{
  "emoji": "👍"
}
```

**Response:**
```json
[
  {
    "emoji": "👍",
    "users": ["user_id_1", "user_id_2"]
  }
]
```

#### Get AI Feedback (Server-Sent Events)
```http
GET /auth/journal/:roomId/aiResponse/:journalId
Authorization: Bearer <token>
```

**Response (SSE Stream):**
```
data: {"token": "Great analysis of the "}
data: {"token": "architectural patterns "}
data: {"token": "[DONE]"}
```

---

### **File Upload Routes**

#### Upload Image
```http
POST /auth/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

[binary image data]
```

**Response:**
```json
{
  "imageUrl": "https://res.cloudinary.com/...",
  "publicId": "darc/..."
}
```

---

## 🔌 WebSocket Events

### **Client → Server Events**

#### Join Room
```javascript
socket.emit('join_room', { room_id: 'room123' });
```

#### Leave Room
```javascript
socket.emit('leave_room', room_id);
```

#### Switch Room (Update Presence)
```javascript
socket.emit('switch_room', previous_room_id);
```

#### Send Message
```javascript
socket.emit('message_send', {
  room_id: 'room123',
  content: 'Hello team!',
  imageUrl: null // optional
});
```

#### Typing Start
```javascript
socket.emit('typing_start', { room_id: 'room123' });
```

#### Typing End
```javascript
socket.emit('typing_end', { room_id: 'room123' });
```

#### Mark Message as Read
```javascript
socket.emit('read_message', room_id, message_id);
```

---

### **Server → Client Events**

#### Room Members Updated
```javascript
socket.on('room_members', ({ room_id, members }) => {
  // members = ['user1', 'user2'] (usernames)
});
```

#### New Message Received
```javascript
socket.on('message_new', (message) => {
  // message = { _id, sender, content, imageUrl, createdAt }
});
```

#### Message History Loaded
```javascript
socket.on('message_display', (messages) => {
  // array of message objects
});
```

#### User Typing
```javascript
socket.on('is_typing', { username, id }) => {
  // User is typing
});
```

#### User Stopped Typing
```javascript
socket.on('stop_typing', { username, id }) => {
  // User stopped typing
});
```

#### Read Receipt Update
```javascript
socket.on('readUpdate_message', {
  room_id,
  user_id,
  lastReadMessageId
});
```

#### Journal Entry Created
```javascript
socket.on('create_journal', (journal) => {
  // journal = { _id, author, content, reaction, imageUrl, createdAt }
});
```

#### Journal Entry Updated
```javascript
socket.on('update_journal', { journal });
```

#### Journal Entry Deleted
```javascript
socket.on('delete_journal', { entry_id });
```

#### Reaction Added/Removed
```javascript
socket.on('reaction_journal', {
  entryId,
  reactions: [{ emoji, users: [] }]
});
```

#### Error Occurred
```javascript
socket.on('error', { message: 'Error description' });
```

---

## 🧩 Core Components

### **Frontend Components**

#### `App.jsx`
- Main routing component
- Protected routes for authenticated users
- Context providers (Auth, Toast)

#### `AppShell.jsx`
- Main application layout
- Room sidebar and chat/journal tabs
- Socket connection management
- User menu and logout

#### `ChatPanel.jsx`
- Real-time message display
- Message input with image upload
- Typing indicators
- Read receipt visualization

#### `JournalPanel.jsx`
- Journal entry creation and editing
- Rich text editor interface
- Image attachment preview
- Emoji reaction management
- AI feedback streaming display
- AI credit counter

#### `RoomModal.jsx`
- Room creation form
- Room join via invite code
- Form validation

#### Context Providers
- `AuthContext`: Manages JWT token and user data
- `ToastContext`: Global notification system

### **Backend Services**

#### `ai.service.js`
- `generateEmbeddings()` — Convert text to vector embeddings via Google
- `getAIFeedback()` — Stream AI analysis with historical context
- `generateRoomDigest()` — Create daily summaries

#### Socket Handlers
- Connection/disconnection
- Room join/leave/switch
- Message send with validation
- Read receipts
- Presence tracking via Redis

#### Middleware
- `auth.middleware.js` — JWT verification
- `roomMember.middleware.js` — Room access control
- `aiRateLimit.middleware.js` — Daily AI credit limits

---

## 🚀 Advanced Features

### **Vector Search & RAG**

When requesting AI feedback on a journal entry:
1. **Fetch Embeddings**: Retrieve the entry's stored vector embedding
2. **Semantic Search**: Query Pinecone for 3 most similar past entries
3. **Context Assembly**: Include 2 most relevant entries + their AI responses
4. **Prompt Enhancement**: LLM uses this context for informed feedback
5. **Metadata Update**: Save AI response and update Pinecone metadata

### **Daily Digest Generation**

Every night at **00:00 IST**:
1. **Aggregate**: Group all journal entries created in the last 24h by room
2. **Batch Processing**: Use `p-limit(3)` for safe concurrent AI calls
3. **Idempotency Check**: Skip rooms already processed (Redis cache)
4. **AI Summarization**: Generate digest from all entries
5. **Persistence**: Save as special journal entry from "AI Mentor" bot
6. **Broadcasting**: Emit to room members via WebSocket

### **Real-Time Presence Tracking**

- Members stored in Redis set: `room:{roomId}:presence`
- 3-minute expiry on inactivity
- Updated on join/switch/disconnect
- Broadcast to all room members

### **Message Caching Strategy**

- **Last 30 messages** loaded on room join
- **MongoDB** is source of truth
- **Redis** caches AI responses (24h TTL)
- **Pinecone** stores semantic vectors for search

### **Rate Limiting**

- **AI Feedback**: Limited credits per day
- **Enforcement**: `aiRateLimit.middleware.js`
- **Response Header**: `X-RateLimit-Remaining` indicates balance
- **429 Status**: Returned when limit exceeded

---

## 🔧 Environment Setup

### **Database Setup**

#### MongoDB (Local)
```bash
# macOS (with Homebrew)
brew services start mongodb-community

# Linux
sudo systemctl start mongod

# Verify
mongo # or mongosh
```

#### MongoDB Atlas (Cloud)
1. Create account at [mongodb.com/cloud](https://www.mongodb.com/cloud)
2. Create cluster and get connection string
3. Add connection string to `.env` as `Mongo_Url`

#### Redis (Local)
```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis-server

# Verify
redis-cli ping # should return PONG
```

#### Redis Cloud
1. Sign up at [redis.com/cloud](https://redis.com/cloud)
2. Create database and get connection URL
3. Add to `.env` as `REDIS_URL`

### **Third-Party Services**

#### Google Generative AI
1. Visit [ai.google.dev](https://ai.google.dev)
2. Create API key
3. Add to `.env` as `GOOGLE_API_KEY`

#### Pinecone
1. Sign up at [pinecone.io](https://www.pinecone.io)
2. Create index: `darc-index` (dimension: 768 for Google embeddings)
3. Get API key and environment
4. Add to `.env` as `PINECONE_API_KEY` and `PINECONE_ENVIRONMENT`

#### Cloudinary
1. Sign up at [cloudinary.com](https://cloudinary.com)
2. Get cloud name, API key, API secret
3. Add to `.env` as `CLOUDINARY_*`

---

## 📦 Deployment

### **Frontend Deployment (Vercel)**

1. Push code to GitHub
2. Connect repo on [vercel.com](https://vercel.com)
3. Set environment variables:
   - `VITE_API_URL=https://your-backend-url.com`
4. Deploy

### **Backend Deployment (Railway/Render)**

1. Set environment variables on platform:
   - All variables from `.env` file
2. Set start command: `npm start`
3. Deploy

### **Database & Services**

Use managed services (MongoDB Atlas, Redis Cloud, Pinecone, Cloudinary) for reliability.

---

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Commit** changes: `git commit -am 'Add amazing feature'`
4. **Push** to branch: `git push origin feature/amazing-feature`
5. **Open** a Pull Request

### Guidelines
- Follow existing code style
- Add comments for complex logic
- Test new features locally
- Update this README for significant changes

---

## 📝 License

Distributed under the **ISC License**. See `LICENSE` file for more details.

---

## 🎓 Learning Resources

- [Socket.io Documentation](https://socket.io/docs/)
- [React 19 Docs](https://react.dev)
- [MongoDB Mongoose](https://mongoosejs.com)
- [Pinecone Vector Search](https://docs.pinecone.io)
- [Google Generative AI](https://ai.google.dev/docs)
- [Express.js Guide](https://expressjs.com)
- [Vite Guide](https://vitejs.dev/guide/)

---

## 🐛 Known Issues & Roadmap

### Current Limitations
- Message pagination not yet implemented (loads last 30)
- Private rooms flag not enforced
- Mobile responsive design in progress

### Planned Features
- 📱 Progressive Web App (PWA) support
- 🔒 E2E encryption for sensitive rooms
- 📊 Analytics dashboard for room activity
- 🎯 Thread/reply system for better discussions
- 🌙 Dark mode toggle
- 🔔 Browser push notifications
- 👤 User profiles with activity history

---

## 💬 Support & Feedback

Found a bug? Have a feature suggestion?

1. **Check existing issues** on GitHub
2. **Create new issue** with:
   - Clear description
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if relevant

---

**Made with ❤️ by [bhargavmane1802](https://github.com/bhargavmane1802)**

**[⬆ Back to Top](#-darc--developer-collaboration-hub)**
