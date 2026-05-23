# Darc

A modern web application with a React frontend and a Node.js/Express backend, supporting real-time functionality and robust REST APIs. This project demonstrates a clean full-stack architecture intended for features such as authentication, user management, journals, messaging, room-based collaboration, and file uploads.

**Live Demo:** [darc-nine.vercel.app](https://darc-nine.vercel.app)

---

## Table of Contents
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Authentication**: Secure user login and protected routes.
- **User Management**: User registration and profile handling.
- **Journal**: CRUD operations for journal entries.
- **Messaging**: Real-time communication with Socket.IO.
- **Rooms**: Multi-user rooms for collaboration/chat.
- **File Uploads**: Cloudinary integration for media uploads.
- **Digest Job**: Automated jobs (likely notifications or summaries).
- **API Security**: JWT-based authentication, CORS controls.
- **Frontend**: SPA using React, React Router, Vite for super-fast development.

## Tech Stack

**Frontend:**
- React 19
- React Router DOM v7
- Vite
- Socket.io-client

**Backend:**
- Node.js (ES modules)
- Express 5
- MongoDB & Mongoose
- Socket.io
- JWT, Bcrypt
- multer, multer-storage-cloudinary for file uploads
- node-cron for background jobs
- dotenv for config management

---

## Project Structure

```
/
├── backend/
│   ├── index.js
│   ├── package.json
│   └── src/
│       ├── config/
│       ├── controllers/
│       ├── jobs/
│       ├── middlewares/
│       ├── model/
│       ├── routers/
│       ├── services/
│       └── sockets/
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx
│       ├── main.js, main.jsx
│       ├── assets/
│       ├── components/
│       ├── context/
│       ├── pages/
│       ├── services/
│       └── styles/
├── package.json (meta)
└── .gitignore
```

---

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn
- MongoDB instance (local or remote)
- Cloudinary account for file uploads

### 1. Clone the Repo

```bash
git clone https://github.com/bhargavmane1802/Darc.git
cd Darc
```

### 2. Set Up Backend

```bash
cd backend
cp .env.example .env   # Create and fill with your config
npm install
npm run dev            # or 'npm start' for production
```

#### Backend Example .env

```
PORT=8080
Mongo_Url=your_mongo_connection_string
JWT_SECRET=your_jwt_secret
FRONTEND_URL=http://localhost:5173
CLOUDINARY_CLOUD_NAME=your_cloudinary
CLOUDINARY_API_KEY=your_key
CLOUDINARY_API_SECRET=your_secret
```

### 3. Set Up Frontend

```bash
cd ../frontend
npm install
npm run dev            # Starts Vite on localhost:5173
```

### 4. Visit the App

- Go to http://localhost:5173 (or as shown in your terminal output)

---

## API Endpoints

(Not exhaustive, inferred from `backend/index.js`)

| Route Prefix      | Purpose                  | Auth Required | Notes /
| ----------------- | ----------------------- | ------------- | ------------- |
| `/user`           | User management         | No            | Registration/login/etc |
| `/auth/room`      | Room operations         | Yes           | Room CRUD, joining, etc |
| `/auth/journal`   | Journal operations      | Yes           | CRUD for journals |
| `/auth/message`   | Messaging endpoints     | Yes           | Real-time etc |
| `/auth/upload`    | File uploads            | Yes           | Cloudinary-backed |
| `/test`           | (Testing only)          | No            | Triggers digest job |
| All others        | —                       | —             | Returns 404     |

> CORS is restricted to whitelisted origins in env (`FRONTEND_URL`, localhost:3000, 5173).

---

## Environment Variables

Set these in both backend and frontend as needed. Backend requires at minimum:

- `PORT`
- `Mongo_Url`
- `JWT_SECRET`
- `FRONTEND_URL`
- `CLOUDINARY_*`

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/fooBar`)
3. Commit your changes (`git commit -am 'Add some fooBar'`)
4. Push to the branch (`git push origin feature/fooBar`)
5. Open a pull request

> Please open issues for bugs or feature requests!

---

## License

Distributed under the ISC license. See `backend/package.json` for more details.
