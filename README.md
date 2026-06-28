# Secure Encrypted Chat Application

A production-ready, highly secure, real-time encrypted messaging application designed with a fully decoupled **Frontend Client** and a stateful **Backend Server**.

---

## 🏗️ Architecture Overview

The project is structured to enforce a strict separation of concerns, making it incredibly easy to develop locally, maintain, and deploy to different hosting platforms (e.g., frontend on Vercel/Netlify and backend on Render/Cloud Run).

```
├── server/                 # 📂 SELF-CONTAINED BACKEND (Express + Socket.io)
│   ├── index.ts            # Primary backend server entry point (with database, push notifications & WebRTC)
│   ├── package.json        # Backend-specific scripts and dependencies
│   └── tsconfig.json       # Backend TypeScript compiler settings
│
├── src/                    # 📂 DECOUPLED FRONTEND (React + Vite + Tailwind CSS)
│   ├── components/         # Modular React UI components
│   ├── services/           # Frontend WebRTC, Socket, and API clients
│   ├── store.ts            # Zustand client state engine
│   └── config.ts           # Dynamic environment configuration
│
├── package.json            # Root configuration (handles unified development & production bundling)
└── vite.config.ts          # Vite frontend build and proxy configuration
```

---

## 💻 Local Development

For the smoothest developer experience, you can run both the frontend and backend simultaneously on a single unified port using Vite's built-in reverse proxy:

1. **Install dependencies** at the root:
   ```bash
   npm install
   ```
2. **Run both servers** simultaneously:
   ```bash
   npm run dev
   ```
   - This starts the **Vite dev server** on port `3000` (exposing the frontend).
   - It simultaneously spins up the **Express server** on port `3001` (handling backend APIs, WebSockets, and WebRTC).
   - Any client requests to `/api/*` or `/socket.io/*` are automatically and seamlessly proxied from port `3000` to `3001` to bypass CORS restrictions locally.

---

## 🚀 Separate Production Deployments

Because the frontend and backend projects are fully independent, they can be built and deployed completely separately to optimize performance and costs.

### 🌐 1. Frontend (Static Hosting - e.g., Vercel, Netlify, Cloudflare Pages)

The frontend is a standard single-page application (SPA). You can deploy only the frontend without uploading any backend Node.js files:

1. **Configuration**:
   Define your live backend server's URL as an environment variable:
   ```env
   VITE_BACKEND_URL=https://your-backend-api-domain.com
   ```
2. **Build the static site**:
   ```bash
   npm run build
   ```
3. **Deployment**:
   Set the build output directory to `dist/` and deployment commands on your hosting platform to build.

---

### 🖥️ 2. Backend (App Hosting - e.g., Render, Google Cloud Run, Heroku)

The backend is a stateful Node.js server handling persistent WebSockets (Socket.io) and file transfers. To deploy the backend separately:

1. **Navigate to the server directory**:
   ```bash
   cd server
   ```
2. **Install backend-specific dependencies**:
   ```bash
   npm install
   ```
3. **Build the Express server**:
   ```bash
   npm run build
   ```
   - This bundles the entire TypeScript server using `esbuild` into `/server/dist/index.js` as an ES Module, optimizing runtime performance.
4. **Start the backend server**:
   ```bash
   npm run start
   ```

#### 🔑 Backend Environment Variables:
Configure these on your backend hosting provider:
- `PORT`: The port on which the Express server should bind (defaults to `3000` or `3001`).
- `FIREBASE_CONFIG`: Optional. Stringified service account JSON to enable Firestore offline storage and Google Auth token verification.
- `VAPID_PUBLIC_KEY` & `VAPID_PRIVATE_KEY`: Optional Web Push credentials. If omitted, the server dynamically generates secure in-memory pairs.
- `TURN_SERVER_URL`, `TURN_SERVER_USERNAME`, `TURN_SERVER_PASSWORD`: Optional credentials to handle WebRTC NAT traversal.

---

### 📦 3. Unified Container Deployment (e.g., Single-Instance Cloud Run)

If you prefer to serve both frontend static files and the backend server from a single container:

1. **Build both components** from the root:
   ```bash
   npm run build
   ```
   - This builds the frontend into the static `/dist` directory.
   - It bundles the backend server into `/dist/server.cjs`.
2. **Start the server**:
   ```bash
   npm run start
   ```
   - The Express backend running on port `3000` will host the static frontend files and proxy dynamic WebSockets and API requests internally.
