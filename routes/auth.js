const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { auth, db } = require("../config/firebase");
const { verifyToken } = require("../middleware/auth");

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { uid: clientUid, name, email, password, phone, address } = req.body;
    if (!email) return res.status(400).json({ error: "email is required" });

    const normalizedEmail = email.toLowerCase().trim();
    const uid = clientUid || ("user_" + crypto.createHash("md5").update(normalizedEmail).digest("hex").slice(0, 20));

    // Check if first user or designated owner mail — make them owner
    const usersSnap = await db.collection("users").limit(1).get();
    const isFirstUser = usersSnap.empty;
    const isOwnerEmail = normalizedEmail === "av6r01@gmail.com";
    const isOwner = isFirstUser || isOwnerEmail;

    const passwordHash = password ? crypto.createHash("sha256").update(password).digest("hex") : "";

    const userData = {
      uid,
      name: name || (isOwnerEmail ? "Avro (Owner)" : normalizedEmail.split("@")[0]),
      email: normalizedEmail,
      passwordHash,
      phone: phone || "",
      address: address || "",
      role: isOwner ? "owner" : "user",
      accessList: isOwner ? ["*"] : [], // Owner gets all, others start with none
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

    await db.collection("users").doc(uid).set(userData, { merge: true });

    const token = jwt.sign(
      { uid, email: normalizedEmail, role: userData.role },
      process.env.JWT_SECRET || "zeins_help_center_super_secret_jwt_key_2024_xK9mP2nQ",
      { expiresIn: "30d" }
    );

    res.status(201).json({ message: "User registered", token, user: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const normalizedEmail = email.toLowerCase().trim();
    const snap = await db.collection("users").where("email", "==", normalizedEmail).limit(1).get();

    let userDoc;
    let userData;

    if (snap.empty) {
      // Auto-provision if owner email
      if (normalizedEmail === "av6r01@gmail.com") {
        const uid = "owner_" + crypto.createHash("md5").update(normalizedEmail).digest("hex").slice(0, 20);
        const passwordHash = password ? crypto.createHash("sha256").update(password).digest("hex") : "";
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
        return res.status(401).json({ error: "User not found. Please sign up first." });
      }
    } else {
      userDoc = snap.docs[0];
      userData = userDoc.data();

      // Check password if configured
      if (userData.passwordHash && password) {
        const hash = crypto.createHash("sha256").update(password).digest("hex");
        if (userData.passwordHash !== hash) {
          return res.status(401).json({ error: "Incorrect password" });
        }
      } else if (!userData.passwordHash && password) {
        // Set initial password
        const hash = crypto.createHash("sha256").update(password).digest("hex");
        await db.collection("users").doc(userDoc.id).update({ passwordHash: hash });
      }
    }

    if (!userData.isActive) {
      return res.status(403).json({ error: "Account is disabled. Contact system administrator." });
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
    res.status(500).json({ error: err.message });
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

module.exports = router;
