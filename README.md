# 🛡️ Zeins Help Center & Security Web System API

A production-ready, secure backend API server for **Zeins Help Center**, built with **Node.js**, **Express**, **Firebase Admin SDK (Firestore & Auth)**, and **Cloudinary**.

---

## 👤 Project Information & Owner

- **Owner Email**: `av6r01@gmail.com`
- **Application**: Zeins Help Center Web System
- **Firebase Project**: `zeins-web-setup`
- **Backend Architecture**: REST API + Firebase Admin + Cloudinary Storage

---

## 🚀 Key Features & System Architecture

- **🔐 Dual Authentication & Authorization**:
  - Verifies Firebase client-side ID tokens.
  - Fallback support for custom JWT tokens.
  - Granular Role-Based Access Control (RBAC): `user`, `admin`, and `owner`.
- **📂 File Storage & Streaming**:
  - Integrated with Cloudinary for fast media & file distribution.
  - Streaming uploads directly from memory buffer (no temporary disk clutter).
  - Supports `.apk`, `.zip`, `.plp`, images, videos, audio, and documents (up to 100MB).
- **📦 Sector & Box Permission Management**:
  - Secure data partitioning by sector.
  - Per-user sector access lists with wildcard (`"*"`) full access for owners.
- **⚡ High Availability & KeepAlive**:
  - Built-in `keepAlive` self-pinging utility to prevent cloud instances (e.g. Render free tier) from sleeping.
- **📊 Admin Dashboard Analytics**:
  - Real-time aggregation of total users, sectors, boxes, and active services.

---

## 💡 Top Tricks & Architecture Secrets

1. **Automatic Owner Promotion**:
   - Registering with the owner email `av6r01@gmail.com` (or registering as the very first user) automatically grants `owner` role and `["*"]` wildcard access across all sectors.
2. **Zero-Disk Streaming Uploads**:
   - Multer memory storage pipes streams directly to Cloudinary so your backend stays stateless and lightweight.
3. **Dual Cloud Deployment Strategy**:
   - **Local Development**: Reads credentials directly from `config/serviceAccountKey.json`.
   - **Cloud/Render Production**: Can parse `FIREBASE_SERVICE_ACCOUNT` as a raw JSON string environment variable without committing secret files to Git.
4. **Anti-Sleep Engine**:
   - `utils/keepAlive.js` pings the health check endpoint every 14 minutes in production so Render never idles.

---

## 🛠️ Environment Configuration

Create a `.env` file in the project root:

```env
PORT=4000
NODE_ENV=development
FRONTEND_URL=https://zeins-web-setup.web.app
JWT_SECRET=your_super_secret_jwt_key_here
FIREBASE_STORAGE_BUCKET=zeins-web-setup.firebasestorage.app

# ── Cloudinary (Free 25GB Storage) ────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLOUDINARY_URL=cloudinary://your_api_key:your_api_secret@your_cloud_name
```

---

## 📦 Installation & Local Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Firebase Credentials
Place your Firebase Admin private key inside the `config` directory:
```text
config/serviceAccountKey.json
```

### 3. Start Development Server
```bash
npm run dev
```

### 4. Start Production Server
```bash
npm start
```

---

## 📡 API Endpoints Overview

### 🔑 Authentication (`/api/auth`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/api/auth/register` | Sync user to Firestore after Firebase client signup | Public |
| `GET` | `/api/auth/me` | Retrieve profile of authenticated user | Authenticated |
| `POST` | `/api/auth/logout` | Revoke tokens & log out | Authenticated |

### 👥 Users & Access (`/api/users` & `/api/admin`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/admin/users` | List all users with roles and access lists | Admin / Owner |
| `PUT` | `/api/admin/users/:uid/access` | Grant or revoke sector access | Admin / Owner |
| `PUT` | `/api/admin/users/:uid/role` | Update user role (`user`, `admin`, `owner`) | Owner only |
| `PUT` | `/api/admin/users/:uid/toggle` | Activate / Deactivate user account | Admin / Owner |
| `GET` | `/api/admin/stats` | System overview metrics & stats | Admin / Owner |

### 🗂️ Sectors & Boxes (`/api/sectors`, `/api/boxes`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/sectors` | Get sectors accessible to user | Sector Access / Admin |
| `POST` | `/api/sectors` | Create a new sector | Admin / Owner |
| `GET` | `/api/boxes` | List boxes within a sector | Sector Access / Admin |
| `POST` | `/api/boxes` | Create new box inside a sector | Admin / Owner |

### ☁️ File Management (`/api/files`)
| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/api/files/upload` | Upload file/media to Cloudinary (up to 100MB) | Admin / Owner |
| `DELETE` | `/api/files` | Delete file from Cloudinary storage | Admin / Owner |

---

## 🚀 Pushing to GitHub Safely

Ensure your secret files (`.env` and `config/serviceAccountKey.json`) are **never** committed by following these steps:

```bash
# 1. Initialize Git repository
git init

# 2. Stage all files (the included .gitignore will automatically safeguard your keys)
git add .

# 3. Commit the code
git commit -m "feat: complete Zeins security backend setup with Firebase & Cloudinary"

# 4. Link your remote GitHub repository (replace with your repo URL)
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>.git

# 5. Push to GitHub
git push -u origin main
```

---

---

## 🌐 Live Deployment Guide (Render, Firebase Hosting, Netlify)

This project supports three deployment architectures that work seamlessly together:

### Option A: Render (Backend API or Complete Fullstack)
1. Push your repository to GitHub.
2. In [Render Dashboard](https://dashboard.render.com):
   - Click **New +** → **Blueprint** (connect your repository to use `render.yaml`) OR create a **Web Service**.
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
3. In **Environment Variables**, add:
   - `NODE_ENV`: `production`
   - `JWT_SECRET`: *(Auto-generated or a random 32+ character string)*
   - `FIREBASE_STORAGE_BUCKET`: `zeins-web-setup.firebasestorage.app`
   - `CLOUDINARY_CLOUD_NAME`: `dneatk4ks`
   - `CLOUDINARY_API_KEY`: `126185716818649`
   - `CLOUDINARY_API_SECRET`: `cqHijga8P0ZCt4P8nB_L9jGpVPM`
   - `FIREBASE_SERVICE_ACCOUNT`: *(Copy entire contents of `config/serviceAccountKey.json` as a single line or base64 string)*
4. Once deployed, Render provides your live URL: `https://<service-name>.onrender.com`.
   *(Note: The server also hosts the frontend at this URL automatically!)*

---

### Option B: Firebase Hosting (Frontend)
1. Install Firebase CLI (if not already installed):
   ```bash
   npm install -g firebase-tools
   ```
2. Log in and verify project:
   ```bash
   firebase login
   firebase use default
   ```
3. Deploy the public directory:
   ```bash
   firebase deploy --only hosting
   ```
4. Your site will be live at: `https://zeins-web-setup.web.app` (it connects automatically to the Render backend).

---

### Option C: Netlify (Frontend with Zero-CORS API Proxy)
1. In [Netlify Dashboard](https://app.netlify.com):
   - Click **Add new site** → **Import an existing project** (from GitHub).
   - **Publish directory**: `public`
   - **Build command**: *(leave blank or `npm run build` if any)*
2. Netlify uses `netlify.toml` which automatically proxies all `/api/*` requests directly to your live Render backend (`https://zeins-help-center-backend.onrender.com`), eliminating CORS issues!

---

## 🔒 Security Best Practices
- Keep `.gitignore` intact so private keys and `.env` files are never exposed publicly.
- When deploying to **Render / Vercel / Railway**, set the environment variables via the platform dashboard.
- For `FIREBASE_SERVICE_ACCOUNT` on Render, minify your `serviceAccountKey.json` into a single line string (or base64 encode it) and add it directly in Render's environment variable panel.

---

## 📩 Support & Contact
For technical inquiries or system assistance, contact the system owner at:
**`av6r01@gmail.com`**
