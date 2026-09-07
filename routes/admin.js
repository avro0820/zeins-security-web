const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const { verifyToken, requireAdmin } = require("../middleware/auth");

// GET /api/admin/users — list all users
router.get("/users", verifyToken, requireAdmin, async (req, res) => {
  try {
    const snap = await db.collection("users").get();
    const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    users.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:uid/access — grant or revoke sector access
router.put("/users/:uid/access", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { accessList } = req.body; // Array of sectorIds, or ["*"] for all
    if (!Array.isArray(accessList)) return res.status(400).json({ error: "accessList must be an array" });

    await db.collection("users").doc(req.params.uid).update({
      accessList,
      updatedAt: new Date().toISOString(),
    });
    res.json({ message: "Access updated", accessList });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:uid/role — change user role
router.put("/users/:uid/role", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const validRoles = ["user", "admin", "owner"];
    if (!validRoles.includes(role)) return res.status(400).json({ error: "Invalid role" });

    // Only owner can promote to admin/owner
    if (req.user.role !== "owner" && (role === "admin" || role === "owner")) {
      return res.status(403).json({ error: "Only owner can assign admin roles" });
    }

    await db.collection("users").doc(req.params.uid).update({
      role,
      updatedAt: new Date().toISOString(),
    });
    res.json({ message: "Role updated", role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/admin/users/:uid/toggle — activate or deactivate user
router.put("/users/:uid/toggle", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { isActive } = req.body;
    await db.collection("users").doc(req.params.uid).update({
      isActive: !!isActive,
      updatedAt: new Date().toISOString(),
    });
    res.json({ message: "User status updated", isActive: !!isActive });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/stats — system stats for dashboard
router.get("/stats", verifyToken, requireAdmin, async (req, res) => {
  try {
    const [usersSnap, sectorsSnap, boxesSnap] = await Promise.all([
      db.collection("users").get(),
      db.collection("sectors").get(),
      db.collection("boxes").get(),
    ]);

    res.json({
      stats: {
        totalUsers: usersSnap.size,
        totalSectors: sectorsSnap.size,
        totalBoxes: boxesSnap.size,
        activeSectors: sectorsSnap.docs.filter((d) => d.data().isActive).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
