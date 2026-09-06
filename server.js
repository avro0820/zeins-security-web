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

const app = express();

// ── CORS ──────────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://zeins-web-setup.web.app",
  "https://zeins-web-setup.firebaseapp.com",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// ── Routes ─────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/users",    userRoutes);
app.use("/api/sectors",  sectorRoutes);
app.use("/api/boxes",    boxRoutes);
app.use("/api/admin",    adminRoutes);
app.use("/api/files",    fileRoutes);
app.use("/api/settings", settingsRoutes);

// Health check — Render pings "/" to verify the service is up
app.get("/",           (req, res) => res.json({ status: "ok", app: "Zeins Help Center API" }));
app.get("/api/health", (req, res) => res.json({ status: "ok", env: process.env.NODE_ENV }));

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
