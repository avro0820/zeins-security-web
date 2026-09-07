require("dotenv").config();
const express = require("express");
const cors    = require("cors");
const path    = require("path");

const authRoutes     = require("./routes/auth");
const userRoutes     = require("./routes/users");
const sectorRoutes   = require("./routes/sectors");
const boxRoutes      = require("./routes/boxes");
const adminRoutes    = require("./routes/admin");
const fileRoutes     = require("./routes/files");
const settingsRoutes = require("./routes/settings");
const supportRoutes  = require("./routes/support");

const app = express();

// ── CORS ──────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:4000",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:4000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "https://zeins-web-setup.web.app",
  "https://zeins-web-setup.firebaseapp.com",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);

    // Allow all localhost and 127.0.0.1 ports
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    // Allow Firebase Hosting, Render, Vercel, Netlify
    if (/^https:\/\/([a-z0-9-]+\.)?(web\.app|firebaseapp\.com|onrender\.com|vercel\.app|netlify\.app)$/.test(origin)) {
      return callback(null, true);
    }

    // Explicitly allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow origin without blocking
    return callback(null, true);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));

// Preflight OPTIONS for all routes
app.options("*", cors());

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// ── Routes ─────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/users",    userRoutes);
app.use("/api/sectors",  sectorRoutes);
app.use("/api/boxes",    boxRoutes);
app.use("/api/admin",    adminRoutes);
app.use("/api/files",    fileRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/support",  supportRoutes);

// Health check — Render pings "/api/health" to verify the service is up
app.get("/api/health", (req, res) => res.json({ status: "ok", env: process.env.NODE_ENV, app: "Zeins Help Center" }));

// SPA fallback: any non-API route returns frontend index.html
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ── Error handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message || "Internal server error" });
});

// ── Start ──────────────────────────────────────────────────
// Render assigns its own PORT — always use process.env.PORT
const PORT = process.env.PORT || 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Zeins Help Center API running on port ${PORT}`);
  console.log(`🌐 Allowed origins: ${allowedOrigins.join(", ")}`);
});

// Keep Render free tier awake (no-op in dev)
if (process.env.NODE_ENV === "production") {
  const keepAlive = require("./utils/keepAlive");
  keepAlive();
}
