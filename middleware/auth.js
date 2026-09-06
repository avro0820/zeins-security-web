const jwt = require("jsonwebtoken");
const { auth, db } = require("../config/firebase");

// Verify JWT or Firebase token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Try Firebase ID token first
    const decoded = await auth.verifyIdToken(token);
    const userDoc = await db.collection("users").doc(decoded.uid).get();

    if (!userDoc.exists) {
      return res.status(401).json({ error: "User not found in database" });
    }

    req.user = { uid: decoded.uid, ...userDoc.data() };
    next();
  } catch (firebaseErr) {
    // Fallback to custom JWT
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      if (!userDoc.exists) return res.status(401).json({ error: "User not found" });
      req.user = { uid: decoded.uid, ...userDoc.data() };
      next();
    } catch (jwtErr) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }
  }
};

// Require admin/owner role
const requireAdmin = (req, res, next) => {
  if (req.user?.role !== "admin" && req.user?.role !== "owner") {
    return res.status(403).json({ error: "Forbidden: Admin access required" });
  }
  next();
};

// Check if user has access to a specific sector
const requireSectorAccess = async (req, res, next) => {
  const { sectorId } = req.params;
  const user = req.user;

  if (user.role === "admin" || user.role === "owner") return next();

  const accessList = user.accessList || [];
  if (!accessList.includes(sectorId)) {
    return res.status(403).json({ error: "You don't have access to this sector" });
  }
  next();
};

module.exports = { verifyToken, requireAdmin, requireSectorAccess };
