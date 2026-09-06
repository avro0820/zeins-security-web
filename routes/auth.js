const express = require("express");
const router = express.Router();
const { auth, db } = require("../config/firebase");
const { verifyToken } = require("../middleware/auth");

// POST /api/auth/register
// Called after Firebase client-side signup to sync user to Firestore
router.post("/register", async (req, res) => {
  try {
    const { uid, name, email, phone, address } = req.body;
    if (!uid || !email) return res.status(400).json({ error: "uid and email required" });

    // Check if first user or designated owner mail — make them owner
    const usersSnap = await db.collection("users").limit(1).get();
    const isFirstUser = usersSnap.empty;
    const isOwnerEmail = email.toLowerCase() === "av6r01@gmail.com";
    const isOwner = isFirstUser || isOwnerEmail;

    const userData = {
      uid,
      name: name || "",
      email,
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

    await db.collection("users").doc(uid).set(userData);
    res.status(201).json({ message: "User registered", user: userData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/me — get current user profile
router.get("/me", verifyToken, async (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout — just client-side, but endpoint for audit logging
router.post("/logout", verifyToken, async (req, res) => {
  try {
    // Optionally revoke Firebase refresh tokens
    await auth.revokeRefreshTokens(req.user.uid);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
