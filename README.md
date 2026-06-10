# 🚀 DARC — Developer Collaboration Hub

A **real-time developer collaboration platform** that combines instant messaging, collaborative journaling, and AI-powered insights. DARC enables distributed teams to communicate seamlessly, document ideas in real-time, and receive intelligent feedback to accelerate team growth.

**Live Demo:** [darc-nine.vercel.app](https://darc-nine.vercel.app/)

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
- [Environment Setup](#environment-setup)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

DARC is a **monorepo** featuring a **React 19 + Vite frontend** and a **Node.js + Express 5 backend**. It leverages:

- **Real-time Communication**: Socket.IO for instant messaging and presence tracking
- **Vector Search**: Pinecone for semantic search and intelligent context retrieval
- **AI Integration**: Google Generative AI for streaming feedback on journal entries
- **Caching & Performance**: Redis for rate limiting, caching, and session management
- **Scheduled Tasks**: Node Cron for daily digest generation and automated summaries
- **Email Verification**: Email-based user verification with Redis-backed temporary storage
- **Cloud Storage**: Cloudinary for reliable image hosting and management

This is a **collaborative workspace** where teams can:
1. Register securely with email verification
2. Create or join rooms via invite codes for project-based communication
3. Chat in real-time with typing indicators and read receipts
4. Document ideas and decisions in shared per-room journals
5. Get AI-powered analysis and feedback on journal entries with historical context
6. Add emoji reactions to journal entries for quick feedback
7. Receive daily AI-generated summaries of room activity (nightly digest job)

---

## ✨ Key Features

### 🔐 Authentication & User Management
- **Email Verification** — Secure registration with MX domain validation and email confirmation
- **Bcrypt Password Hashing** — Industry-standard password security
- **JWT-based Authentication** — Secure token generation (1-hour expiry) for API and WebSocket connections
- **Redis-Backed Verification** — Temporary token storage with 24-hour TTL
- **User Profiles** — Username, email, avatar support, and status indicators
- **Session Persistence** — localStorage-based session management

### 💬 Real-Time Messaging
- **Instant Messaging** — WebSocket-powered delivery with live synchronization
- **Message History** — Last 30 messages loaded on room join for context
- **Typing Indicators** — See when others are typing in real-time (2-second timeout)
- **Read Receipts** — Track message read status across the room via persistent tracking
- **Image Support** — Send messages with embedded media via Cloudinary
- **Message Editing** — Update sent messages via REST API with real-time sync
- **Message Deletion** — Remove messages with cascading cleanup across all systems

### 📔 Collaborative Journaling
- **Journal Entries** — Rich text notes with optional image attachments
- **CRUD Operations** — Create, edit, delete entries in real-time
- **Real-Time Sync** — All room members see updates instantly via WebSocket
- **Emoji Reactions** — Quick reactions on any journal entry (👍, 🔥, 🎉, 💡, ❤️, and more)
- **Reaction Broadcasting** — Live reaction updates across the room
- **Per-Room Journals** — Separate journal namespaces for each collaborative space

### 🤖 AI-Powered Insights
- **Streaming AI Feedback** — Contextual analysis on journal entries via Server-Sent Events (SSE)
- **Semantic Context** — Pinecone vector similarity retrieves the 2 most related past entries
- **Smart Caching** — Redis caches AI responses with 24-hour TTL for instant retrieval
- **Vector Embeddings** — Automatic semantic indexing of all journal entries using Gemini embeddings (768-dim)
- **Historical Context** — AI references past entries for informed, continuity-aware feedback
- **Concise Responses** — AI mentor keeps feedback strictly under 200 words for digestibility
- **Cascading Deletion** — AI responses and vector embeddings removed when entries are deleted

### 📊 Daily Digest Job
- **Automated Summaries** — Runs nightly at midnight IST to generate room digests
- **Sliding Window Processing** — Processes up to 3 rooms concurrently (p-limit concurrency control)
- **Idempotency** — Redis tracks processed rooms to prevent duplicate digests
- **AI Bot Persona** — Special "AI Mentor" user (auto-created) posts digests as journal entries
- **Smart Batching** — MongoDB aggregation groups entries by room for efficiency
- **Standup Format** — Digests focus on accomplishments and blockers in 3-sentence summaries

### 🏠 Room Management
- **Create Rooms** — Owner creates collaborative spaces with name and description
- **Join via Invite Code** — Unique nanoid-based invite codes for easy sharing
- **Privacy Control** — Room privacy flags (currently set to false by default)
- **Member Tracking** — Real-time presence awareness with Redis-backed member sets
- **Owner Permissions** — Only owners can delete rooms
- **Room Deletion** — Full cascading cleanup of associated data
- **Presence Expiry** — Redis auto-expires inactive members after 180 seconds (configurable)

### 📤 File Uploads
- **Cloudinary Integration** — Reliable cloud storage for images
- **Multipart Form Data** — Efficient file streaming via Multer + Cloudinary adapter
- **Size Limits** — Frontend enforces 5MB max file size
- **Automatic URL Generation** — Images embedded directly in messages and journals
- **Public ID Tracking** — Asset management across the platform

### 🎨 Modern UI/UX
- **React 19** — Latest features and concurrent rendering optimizations
- **React Router v7** — Nested routing with lazy loading and protected routes
- **Vite** — Lightning-fast dev server (HMR) and optimized production builds
- **Toast Notifications** — Success, error, and info feedback system
- **Context API** — Auth and notification state management
- **Responsive Design** — Mobile-first, CSS-driven layout with glassmorphism effects
- **Landing Page** — Hero section, feature showcase, and CTA-driven design
- **Real-Time UI Sync** — Immediate visual feedback for all operations

---

## 🛠️ Tech Stack

### **Frontend**
| Technology | Version | Purpose |
|-----------|---------|---------|
| **React** | 19.2.6 | UI framework with concurrent features |
| **React Router DOM** | 7.15.0 | Client-side routing with nested routes |
| **Vite** | 8.0.1 | Build tool & dev server with HMR |
| **Socket.io-client** | 4.8.3 | Real-time communication client |
| **ES Modules** | - | Modern JavaScript with tree-shaking |

### **Backend**
| Technology | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | 18+ | Runtime environment |
| **Express** | 5.2.1 | HTTP framework with middleware support |
| **MongoDB** | - | Document database for persistence |
| **Mongoose** | 9.3.3 | ODM for MongoDB with schema validation |
| **Socket.io** | 4.8.3 | WebSocket server for real-time sync |
| **JWT** | 9.0.3 | Token-based stateless authentication |
| **Bcrypt** | 6.0.0 | Password hashing and verification |
| **Google Generative AI** | 0.24.1 | AI feedback streaming (Gemini 2.5 Flash) |
| **Google GenAI (Embeddings)** | 2.6.0 | Vector embeddings (768-dimensional) |
| **Pinecone** | 7.2.0 | Vector database for semantic search |
| **Redis/IORedis** | 5.10.1 | Caching, presence, and session management |
| **Multer** | 2.1.1 | File upload middleware for images |
| **Cloudinary** | 1.41.3 | Cloud storage for media assets |
| **Multer-Storage-Cloudinary** | 4.0.0 | Direct Cloudinary integration with Multer |
| **Node Cron** | 4.2.1 | Scheduled jobs (daily digest at midnight IST) |
| **Helmet** | 8.1.0 | Security headers middleware |
| **CORS** | 2.8.6 | Cross-origin request handling |
| **Dotenv** | 17.4.2 | Environment variable management |
| **p-limit** | 7.3.0 | Concurrency control for digest job |
| **nanoid** | 5.1.7 | Collision-resistant unique ID generation |
| **Nodemailer** | 8.0.10 | Email sending for verification |

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
│ • Landing Page      │   REST   │ • User Routes (Register)   │
│ • Auth UI           │    &     │ • Email Verification       │
│ • ChatPanel         │  Socket  │ • Room Management          │
│ • JournalPanel      │   .IO    │ • Message Service          │
│ • RoomModal         │          │ • Journal CRUD + AI        │
│ • AppShell          │          │ • File Upload              │
│ • Toast System      │          │ • AI Feedback (SSE)        │
└─────────────────────┘          │ • Digest Job (Cron)        │
           │                     └────────────────────────────┘
           │                               │
           │                               ├──► MongoDB (Data)
           │                               ├──► Redis (Cache/Presence)
           │                               ├──► Pinecone (Vectors)
           │                               ├──► Cloudinary (Media)
           │                               ├──► Google GenAI (LLM)
           │                               └──► Nodemailer (Email)
           │
           └──────► .env (Frontend Config)
```

### **Data Flow**

```
User Registration Flow:
User Input → Validation → DNS Check → Bcrypt Hash → Redis Temp Store → 
  Email Verification → User Click Link → Email Verification → MongoDB Save

Message Send Flow:
User Input → Validation → MongoDB Save → Broadcast via Socket.IO → 
  Frontend Update → Read Receipt Tracking

Journal Entry Flow:
Entry Created → Generate Embeddings (768-dim) → Store in Pinecone → 
  Broadcast to Room → Cache in Redis

AI Feedback Flow:
User Request → Check Redis Cache → If miss: Query Pinecone (top 2 similar) → 
  Stream Gemini Response → Save to MongoDB → Cache in Redis

Digest Generation (Nightly):
Cron Job (Midnight IST) → Aggregate Entries (last 24h) → Group by Room → 
  Process with p-limit (max 3 concurrent) → Generate AI Summary → 
  Create Digest Entry → Emit via Socket → Mark in Redis (idempotency)
```

### **Database Schema**

```
User Collection:
- username (unique, lowercase)
- email (unique, lowercase)
- password (bcrypt hashed)
- name, about, avatar, status

Room Collection:
- name (unique)
- owner (user reference)
- description
- isPrivate (boolean)
- inviteCode (nanoid)
- members (array of user refs)
- createdAt

Message Collection:
- room (room reference)
- sender (user reference)
- content (string, max 1000 chars)
- imageUrl (Cloudinary)
- createdAt

Journal Collection:
- room (room reference)
- author (user reference)
- content (text)
- imageUrl (optional)
- embedding (768-dim vector)
- aiResponse (cached AI feedback)
- reaction (array of {emoji, users[]})
- createdAt, updatedAt

ReadReceipt Collection:
- room (room reference)
- user (user reference)
- lastReadMessageId (message reference)

Redis Keys:
- room:{room_id}:presence (set of usernames)
- ai_response:room:{room_id}:journal:{journal_id} (cached AI response)
- digests:{date} (set of processed room IDs)
- {nano_id} (temp verification data, 24h TTL)
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
│       │   └── pinecone.js           # Pinecone index initialization
│       │
│       ├── controllers/              # Request handlers
│       │   ├── user.controller.js    # Register/Login/Verify logic
│       │   ├── room.controller.js    # Room CRUD + Invite
│       │   ├── message.controller.js # Message CRUD
│       │   └── journal.controller.js # Journal CRUD + AI Feedback
│       │
│       ├── model/                    # Mongoose schemas
│       │   ├── user.model.js         # User schema
│       │   ├── room.model.js         # Room schema
│       │   ├── message.model.js      # Message schema
│       │   ├── journal.model.js      # Journal schema
│       │   └── readReceipt.model.js  # Read status tracking
│       │
│       ├── routers/                  # API route definitions
│       │   ├── user.Router.js        # /user routes (register, login, verify)
│       │   ├── room.Router.js        # /auth/room routes
│       │   ├── message.Router.js     # /auth/message routes (update, delete)
│       │   ├── journal.Router.js     # /auth/journal routes (CRUD + AI)
│       │   └── upload.routes.js      # /auth/upload routes (image upload)
│       │
│       ├── middlewares/              # Express middleware
│       │   ├── auth.middleware.js    # JWT verification
│       │   ├── roomMember.middleware.js # Room access check
│       │   └── aiRateLimit.middleware.js # Daily credit limit (optional)
│       │
│       ├── services/                 # Business logic
│       │   ├── ai.service.js         # AI feedback + embeddings + digest
│       │   └── email.service.js      # Email verification sending
│       │
│       ├── sockets/                  # WebSocket handlers
│       │   └── socket.js             # Socket.io event handlers (join, message, typing, etc.)
│       │
│       └── jobs/                     # Background tasks
│           └── digest.job.js         # Daily summary generation (Cron + p-limit)
│
├── frontend/                         # React + Vite
│   ├── index.html                    # HTML entry point
│   ├── package.json                  # Frontend dependencies
│   ├── vite.config.js                # Vite configuration
│   └── src/
│       ├── main.jsx                  # React app root
│       ├── App.jsx                   # Route definitions + Protected routes
│       │
│       ├── pages/                    # Full-page components
│       │   ├── Landing.jsx           # Public landing page with hero & features
│       │   ├── Auth.jsx              # Login/Register form
│       │   └── AppShell.jsx          # Main app layout (chat + journal)
│       │
│       ├── components/               # Reusable UI components
│       │   ├── ChatPanel.jsx         # Message interface with editing & reactions
│       │   ├── JournalPanel.jsx      # Journal interface with AI feedback
│       │   ├── RoomModal.jsx         # Room creation/join modal
│       │   └── Toast.jsx             # Notification display
│       │
│       ├── context/                  # React Context
│       │   ├── AuthContext.jsx       # Auth state (token, user)
│       │   └── ToastContext.jsx      # Toast state & actions
│       │
│       ├── services/                 # API & Socket utilities
│       │   ├── api.js                # REST API wrapper
│       │   └── socket.js             # Socket.io client initialization
│       │
│       ├── styles/                   # CSS modules
│       │   ├── landing.css           # Landing page styles (glassmorphism)
│       │   ├── app.css               # Main app styles
│       │   ├── auth.css              # Auth page styles
│       │   └── components.css        # Component-specific styles
│       │
│       └── assets/                   # Static resources
│           ├── favicon.svg           # App icon
│           ├── planet-glow.png       # Landing page decoration
│           ├── showcase-chat.jpg     # Feature showcase image
│           ├── showcase-journal.jpg  # Feature showcase image
│           └── showcase-ai.jpg       # Feature showcase image
│
├── package.json                      # Root manifest (workspace)
├── package-lock.json                 # Dependency lock file
└── README.md                         # This file
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
- **Pinecone** account for vector database (free tier available)
- **Google Cloud** Generative AI API key (Gemini API)
- **Cloudinary** account for image hosting
- **Nodemailer-compatible email service** (Gmail, Resend, or custom SMTP)
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

# Google Generative AI (Gemini)
Llm_Api_Key=your_google_generative_ai_api_key

# Pinecone (Vector Database)
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=darc-index
PINECONE_ENVIRONMENT=production

# Email Service (Nodemailer - Example: Gmail)
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_specific_password
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
2. Create an account with email verification
3. Log in with your credentials
4. Create or join a room using an invite code
5. Start chatting and journaling!

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
  "email": "john@example.com",
  "password": "secure_password_123"
}
```

**Response:**
```json
{
  "message": "user register redirect to login page"
}
```

#### Verify Email
```http
GET /user/verify/:id
```

**Response:**
- Redirects to `FRONTEND_URL/login?verified=true` on success

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
    "isPrivate": false,
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

### **Message Routes** (Requires Auth)

#### Update Message
```http
PATCH /auth/message/:roomId/:messageId
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Updated message text"
}
```

**Response:**
```json
{
  "message": "message updated"
}
```

#### Delete Message
```http
DELETE /auth/message/:roomId/:messageId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "message deleted"
}
```

---

### **Journal Routes** (Requires Auth)

#### Create Journal Entry
```http
POST /auth/journal/:roomId
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Today I debugged the auth flow...",
  "imageUrl": "optional_cloudinary_url"
}
```

**Response:**
```json
{
  "message": "journal entry created"
}
```

#### Display All Journal Entries
```http
GET /auth/journal/:roomId
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "_id": "journal_id",
    "author": { "_id": "user_id", "username": "john_doe" },
    "content": "Today I debugged...",
    "imageUrl": null,
    "embedding": [...768 values...],
    "aiResponse": "Great work on debugging...",
    "reaction": [
      { "emoji": "👍", "users": ["user_id_2"] }
    ],
    "createdAt": "2026-01-15T10:30:00Z"
  }
]
```

#### Update Journal Entry
```http
PATCH /auth/journal/:roomId/:journalId
Authorization: Bearer <token>
Content-Type: application/json

{
  "content": "Updated content"
}
```

**Response:**
```json
{
  "message": "journal updated"
}
```

#### Delete Journal Entry
```http
DELETE /auth/journal/:roomId/:journalId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "journal deleted"
}
```

#### Get AI Feedback (SSE Stream)
```http
GET /auth/journal/:roomId/:journalId/ai
Authorization: Bearer <token>
```

**Response:** Server-Sent Events stream with chunks
```
data: {"token":"Great"}

data: {"token":" work"}

data: {"token":"..."}

data: {"token":"[DONE]"}
```

#### Manage Reactions
```http
POST /auth/journal/:journalId/reaction
Authorization: Bearer <token>
Content-Type: application/json

{
  "emoji": "👍"
}
```

**Response:**
```json
[
  { "emoji": "👍", "users": ["user_id_1", "user_id_2"] }
]
```

---

### **Upload Routes** (Requires Auth)

#### Upload Image
```http
POST /auth/upload
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <binary_image_data>
```

**Response:**
```json
{
  "imageUrl": "https://res.cloudinary.com/.../image.jpg"
}
```

---

## 🔌 WebSocket Events

### **Client → Server Events**

#### Join Room
```javascript
socket.emit('join_room', { room_id: 'room_uuid' });
```

#### Switch Room
```javascript
socket.emit('switch_room', 'old_room_id');
```

#### Leave Room
```javascript
socket.emit('leave_room', 'room_id');
```

#### Send Message
```javascript
socket.emit('message_send', {
  room_id: 'room_uuid',
  content: 'Hello team!',
  imageUrl: 'optional_url'
});
```

#### Typing Start
```javascript
socket.emit('typing_start', { room_id: 'room_uuid' });
```

#### Typing End
```javascript
socket.emit('typing_end', { room_id: 'room_uuid' });
```

#### Read Message
```javascript
socket.emit('read_message', 'room_id', 'message_id');
```

---

### **Server → Client Events**

#### Message Display (History)
```javascript
socket.on('message_display', (messages) => {
  // Array of last 30 messages with populated sender
});
```

#### New Message
```javascript
socket.on('message_new', (message) => {
  // Single message object with populated sender
});
```

#### Update Message
```javascript
socket.on('update_message', (message) => {
  // Updated message object
});
```

#### Delete Message
```javascript
socket.on('delete_message', (message_id) => {
  // Message ID to remove from UI
});
```

#### Is Typing
```javascript
socket.on('is_typing', ({ username, id }) => {
  // User is typing
});
```

#### Stop Typing
```javascript
socket.on('stop_typing', ({ username, id }) => {
  // User stopped typing
});
```

#### Room Members
```javascript
socket.on('room_members', ({ room_id, members }) => {
  // Array of member usernames currently in room
});
```

#### Read Update
```javascript
socket.on('readUpdate_message', ({ room_id, user_id, lastReadMessageId }) => {
  // User read a message
});
```

#### Create Journal
```javascript
socket.on('create_journal', (journal) => {
  // New journal entry with populated author
});
```

#### Update Journal
```javascript
socket.on('update_journal', ({ journal }) => {
  // Updated journal entry
});
```

#### Delete Journal
```javascript
socket.on('delete_journal', ({ entry_id }) => {
  // Journal entry ID to remove
});
```

#### Journal Reaction
```javascript
socket.on('reaction_journal', ({ entryId, reactions }) => {
  // Updated reactions array for entry
});
```

---

## 🔧 Environment Setup

### **Redis Setup**

**Local (macOS with Homebrew):**
```bash
brew install redis
brew services start redis
redis-cli ping  # Should return PONG
```

**Docker:**
```bash
docker run -d -p 6379:6379 redis:latest
```

### **MongoDB Setup**

**Local:**
```bash
# macOS
brew install mongodb-community
brew services start mongodb-community

# Or use Docker
docker run -d -p 27017:27017 --name darc-mongo mongo:latest
```

**Cloud (MongoDB Atlas):**
1. Create cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Get connection string: `mongodb+srv://user:pass@cluster.mongodb.net/darc`
3. Update `Mongo_Url` in `.env`

### **Pinecone Setup**

1. Create account at [pinecone.io](https://www.pinecone.io/)
2. Create index named `darc-index` with dimension `768` (matches Gemini embeddings)
3. Get API key from dashboard
4. Update `.env` with `PINECONE_API_KEY` and `PINECONE_INDEX_NAME`

### **Google Generative AI Setup**

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create API key for free
3. Update `Llm_Api_Key` in `.env`

### **Cloudinary Setup**

1. Create account at [cloudinary.com](https://cloudinary.com/)
2. Get Cloud Name, API Key, and API Secret
3. Update `.env` with these values

### **Email Service Setup (Gmail Example)**

1. Enable 2-Factor Authentication on your Gmail account
2. Generate App Password: [accounts.google.com/apppasswords](https://accounts.google.com/apppasswords)
3. Update `.env`:
   ```env
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASSWORD=your_app_password
   ```

---

## 🚢 Deployment

### **Deploy to Vercel (Frontend)**

```bash
cd frontend
npm run build
vercel deploy
```

### **Deploy to Render/Railway (Backend)**

1. Push to GitHub
2. Connect repository to Render/Railway
3. Set environment variables in dashboard
4. Deploy

### **MongoDB Atlas**

Already configured for cloud deployment.

### **Redis Cloud**

1. Create cluster at [redis.com](https://redis.com)
2. Update `REDIS_URL` in backend `.env`

### **Production Checklist**

- [ ] Set `FRONTEND_URL` to production domain
- [ ] Update CORS origins
- [ ] Change JWT_SECRET to strong random value
- [ ] Enable HTTPS for all services
- [ ] Set up monitoring and logging
- [ ] Configure rate limiting
- [ ] Test email verification flow
- [ ] Verify Pinecone indexing works
- [ ] Test AI feedback streaming
- [ ] Validate daily digest job

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit changes: `git commit -m 'Add your feature'`
4. Push to branch: `git push origin feature/your-feature`
5. Submit a Pull Request

Please ensure:
- Code follows existing style
- Tests pass (if applicable)
- README is updated for new features

---

## 📝 License

This project is open source. Check the LICENSE file for details.

---

## 🎯 Future Enhancements

- [ ] Message threads and replies
- [ ] User mentions and @notifications
- [ ] Voice/video chat integration
- [ ] Advanced search with filters
- [ ] Custom emoji reactions
- [ ] Journal entry templates
- [ ] Team analytics dashboard
- [ ] Integration with GitHub/GitLab
- [ ] Mobile app (React Native)
- [ ] Offline support with sync
- [ ] End-to-end encryption option
- [ ] Two-factor authentication

---

**Made with ❤️ by [bhargavmane1802](https://github.com/bhargavmane1802)**
