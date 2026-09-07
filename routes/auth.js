const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { auth, db } = require("../config/firebase");
const { verifyToken } = require("../middleware/auth");

// Password helpers (supports both salted new format and legacy unsalted SHA-256)
function hashPassword(password) {
  if (!password) return "";
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.createHash("sha256").update(password + salt).digest("hex");
  return `${hash}:${salt}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return true; // Account created without password
  if (storedHash.includes(":")) {
    const [hash, salt] = storedHash.split(":");
    const testHash = crypto.createHash("sha256").update(password + salt).digest("hex");
    return testHash === hash;
  }
  // Legacy unsalted sha256
  const legacyHash = crypto.createHash("sha256").update(password).digest("hex");
  return legacyHash === storedHash;
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { uid: clientUid, name, email, password, phone, address } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalizedEmail = email.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ error: "Please provide a valid email address" });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    // Check if account already exists
    const existingSnap = await db.collection("users").where("email", "==", normalizedEmail).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ error: "An account with this email address already exists. Please log in." });
    }

    const uid = clientUid || ("user_" + crypto.createHash("md5").update(normalizedEmail).digest("hex").slice(0, 20));

    // Check if first user or designated owner mail — make them owner
    const usersSnap = await db.collection("users").limit(1).get();
    const isFirstUser = usersSnap.empty;
    const isOwnerEmail = normalizedEmail === "av6r01@gmail.com";
    const isOwner = isFirstUser || isOwnerEmail;

    const passwordHash = hashPassword(password);

    const userData = {
      uid,
      name: name?.trim() || (isOwnerEmail ? "Avro (Owner)" : normalizedEmail.split("@")[0]),
      email: normalizedEmail,
      passwordHash,
      phone: phone?.trim() || "",
      address: address?.trim() || "",
      role: isOwner ? "owner" : "user",
      accessList: isOwner ? ["*"] : [], // Owner gets full access; users get public sectors by default
      isActive: true,
      socials: {
        facebook: "",
        instagram: "",
        linkedin: "",
        twitter: "",
        github: "",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.collection("users").doc(uid).set(userData);

    const token = jwt.sign(
      { uid, email: normalizedEmail, role: userData.role },
      process.env.JWT_SECRET || "zeins_help_center_super_secret_jwt_key_2024_xK9mP2nQ",
      { expiresIn: "30d" }
    );

    // Return user without sensitive fields
    const { passwordHash: _, ...safeUser } = userData;
    res.status(201).json({ message: "User registered successfully", token, user: safeUser });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: err.message || "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!password) return res.status(400).json({ error: "Password is required" });

    const normalizedEmail = email.toLowerCase().trim();
    const snap = await db.collection("users").where("email", "==", normalizedEmail).limit(1).get();

    let userDoc;
    let userData;

    if (snap.empty) {
      // Auto-provision if owner email
      if (normalizedEmail === "av6r01@gmail.com") {
        const uid = "owner_" + crypto.createHash("md5").update(normalizedEmail).digest("hex").slice(0, 20);
        const passwordHash = hashPassword(password);
        userData = {
          uid,
          name: "Avro (Owner)",
          email: normalizedEmail,
          passwordHash,
          phone: "",
          address: "",
          role: "owner",
          accessList: ["*"],
          isActive: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await db.collection("users").doc(uid).set(userData);
        userDoc = { id: uid };
      } else {
        return res.status(401).json({ error: "Account not found. Please click 'Sign Up' to create your account." });
      }
    } else {
      userDoc = snap.docs[0];
      userData = userDoc.data();

      // Check password if set
      if (userData.passwordHash) {
        if (!verifyPassword(password, userData.passwordHash)) {
          return res.status(401).json({ error: "Incorrect password. Please try again." });
        }
      } else {
        // Set initial password for account created without one
        const passwordHash = hashPassword(password);
        await db.collection("users").doc(userDoc.id).update({ passwordHash });
      }
    }

    if (!userData.isActive) {
      return res.status(403).json({ error: "This account has been deactivated. Please contact av6r01@gmail.com." });
    }

    const token = jwt.sign(
      { uid: userData.uid || userDoc.id, email: userData.email, role: userData.role },
      process.env.JWT_SECRET || "zeins_help_center_super_secret_jwt_key_2024_xK9mP2nQ",
      { expiresIn: "30d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        uid: userData.uid || userDoc.id,
        name: userData.name,
        email: userData.email,
        role: userData.role,
        accessList: userData.accessList || [],
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message || "Login failed" });
  }
});

// GET /api/auth/me — get current user profile
router.get("/me", verifyToken, async (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout
router.post("/logout", verifyToken, async (req, res) => {
  try {
    if (req.user && req.user.uid) {
      await auth.revokeRefreshTokens(req.user.uid).catch(() => {});
    }
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-password
router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ error: "Email and newPassword are required" });

    const normalizedEmail = email.toLowerCase().trim();
    if (newPassword.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    const snap = await db.collection("users").where("email", "==", normalizedEmail).limit(1).get();
    if (snap.empty) {
      return res.status(404).json({ error: "No account found with this email address" });
    }

    const userDoc = snap.docs[0];
    const passwordHash = hashPassword(newPassword);

    await db.collection("users").doc(userDoc.id).update({
      passwordHash,
      updatedAt: new Date().toISOString(),
    });

    res.json({ message: "Password updated successfully! You can now log in with your new password." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: err.message || "Failed to reset password" });
  }
});

module.exports = router;
