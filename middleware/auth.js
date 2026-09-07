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
      const secret = process.env.JWT_SECRET || "zeins_help_center_super_secret_jwt_key_2024_xK9mP2nQ";
      const decoded = jwt.verify(token, secret);
      const userDoc = await db.collection("users").doc(decoded.uid).get();

      if (!userDoc.exists) {
        if (decoded.email === "av6r01@gmail.com" || decoded.role === "owner") {
          req.user = {
            uid: decoded.uid,
            name: "Avro (Owner)",
            email: "av6r01@gmail.com",
            role: "owner",
            accessList: ["*"],
            isActive: true,
          };
          return next();
        }
        return res.status(401).json({ error: "User not found" });
      }

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

// Optional token verification (attaches req.user if valid token provided, does not block if not provided)
const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = await auth.verifyIdToken(token);
    const userDoc = await db.collection("users").doc(decoded.uid).get();
    if (userDoc.exists) req.user = { uid: decoded.uid, ...userDoc.data() };
    return next();
  } catch (_) {
    try {
      const secret = process.env.JWT_SECRET || "zeins_help_center_super_secret_jwt_key_2024_xK9mP2nQ";
      const decoded = jwt.verify(token, secret);
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      if (userDoc.exists) {
        req.user = { uid: decoded.uid, ...userDoc.data() };
      } else if (decoded.email === "av6r01@gmail.com" || decoded.role === "owner") {
        req.user = {
          uid: decoded.uid,
          name: "Avro (Owner)",
          email: "av6r01@gmail.com",
          role: "owner",
          accessList: ["*"],
          isActive: true,
        };
      }
      return next();
    } catch (_) {
      req.user = null;
      return next();
    }
  }
};

module.exports = { verifyToken, optionalAuth, requireAdmin, requireSectorAccess };

