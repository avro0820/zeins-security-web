const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const path     = require("path");
const { verifyToken, requireAdmin } = require("../middleware/auth");

// ── Cloudinary setup ──────────────────────────────────────
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

// ── Multer: memory storage (we stream to Cloudinary) ─────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 }, // 150 MB max per file
  fileFilter: (req, file, cb) => {
    const allowed = [
      ".plp", ".jpg", ".jpeg", ".png", ".gif", ".webp",
      ".apk", ".app", ".ipa", ".exe", ".zip", ".rar", ".7z",
      ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
      ".mp4", ".mp3", ".wav", ".mkv", ".avi",
      ".txt", ".json", ".csv", ".xml",
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error(`File type "${ext}" is not allowed`));
  },
});

// ── Helper: upload buffer to Cloudinary ──────────────────
const uploadToCloudinary = (buffer, originalName, mimetype) => {
  return new Promise((resolve, reject) => {
    const ext         = path.extname(originalName).toLowerCase();
    const baseName    = path.basename(originalName, ext)
                          .replace(/[^a-zA-Z0-9_-]/g, "_")
                          .slice(0, 60);
    const publicId    = `zeins/${baseName}_${Date.now()}`;
    const isRaw       = ![".jpg",".jpeg",".png",".gif",".webp",".mp4",".mkv",".avi",".mp3",".wav"].includes(ext);
    const resourceType = ext === ".mp4" || ext === ".mkv" || ext === ".avi" ? "video"
                       : ext === ".mp3" || ext === ".wav" ? "audio"
                       : isRaw ? "raw"
                       : "image";

    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: resourceType, overwrite: false },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(buffer);
  });
};

// ── POST /api/files/upload ────────────────────────────────
router.post("/upload", verifyToken, requireAdmin, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    // Check Cloudinary is configured
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(500).json({ error: "File storage not configured (Cloudinary env vars missing)" });
    }

    const result = await uploadToCloudinary(req.file.buffer, req.file.originalname, req.file.mimetype);
    const ext    = path.extname(req.file.originalname).replace(".", "").toLowerCase();

    res.json({
      file: {
        name:        req.file.originalname,
        url:         result.secure_url,
        type:        ext,
        size:        req.file.size,
        publicId:    result.public_id,
        resourceType: result.resource_type,
      },
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// ── DELETE /api/files ────────────────────────────────────
router.delete("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { publicId, resourceType } = req.body;
    if (!publicId) return res.status(400).json({ error: "publicId required" });

    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType || "raw",
      invalidate: true,
    });
    res.json({ message: "File deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
