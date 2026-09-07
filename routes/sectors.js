const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const { verifyToken, optionalAuth, requireAdmin } = require("../middleware/auth");

// GET /api/sectors — list sectors (public for all, restricted for authorized)
router.get("/", optionalAuth, async (req, res) => {
  try {
    const user = req.user;
    const snap = await db.collection("sectors").orderBy("order", "asc").get();
    const sectors = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Admins and owners see all sectors (including inactive ones)
    if (user && (user.role === "admin" || user.role === "owner")) {
      return res.json({ sectors });
    }

    // Filter for regular users & guests
    const filtered = sectors.filter((s) => {
      // Inactive sectors are hidden from non-admins
      if (s.isActive === false) return false;

      // If user has specific access granted
      if (user && user.accessList) {
        if (user.accessList.includes("*") || user.accessList.includes(s.id)) return true;
      }

      // Public sectors are viewable by everyone
      return s.isPublic !== false;
    });

    res.json({ sectors: filtered });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sectors/:sectorId — get one sector
router.get("/:sectorId", optionalAuth, async (req, res) => {
  try {
    const doc = await db.collection("sectors").doc(req.params.sectorId).get();
    if (!doc.exists) return res.status(404).json({ error: "Sector not found" });

    const sectorData = { id: doc.id, ...doc.data() };
    const user = req.user;

    const isAdmin = user && (user.role === "admin" || user.role === "owner");
    const isPublic = sectorData.isPublic !== false;
    const hasAccess = user && user.accessList && (user.accessList.includes("*") || user.accessList.includes(doc.id));

    if (!isAdmin && !isPublic && !hasAccess) {
      return res.status(403).json({ error: "You don't have access to this sector" });
    }

    res.json({ sector: sectorData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sectors — admin creates sector
router.post("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, isActive, isPublic, order } = req.body;
    if (!name) return res.status(400).json({ error: "name is required" });

    // Get current max order
    const snap = await db.collection("sectors").orderBy("order", "desc").limit(1).get();
    const maxOrder = snap.empty ? 0 : snap.docs[0].data().order || 0;

    const sectorData = {
      name,
      description: description || "",
      isActive: isActive !== undefined ? isActive : true,
      isPublic: isPublic !== undefined ? isPublic : true,
      order: order !== undefined ? order : maxOrder + 1,
      createdBy: req.user.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ref = await db.collection("sectors").add(sectorData);
    res.status(201).json({ sector: { id: ref.id, ...sectorData } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/sectors/:sectorId — admin updates sector
router.put("/:sectorId", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, isActive, isPublic, order } = req.body;
    const updates = { updatedAt: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (isActive !== undefined) updates.isActive = isActive;
    if (isPublic !== undefined) updates.isPublic = isPublic;
    if (order !== undefined) updates.order = order;

    await db.collection("sectors").doc(req.params.sectorId).update(updates);
    res.json({ message: "Sector updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sectors/:sectorId — admin deletes sector
router.delete("/:sectorId", verifyToken, requireAdmin, async (req, res) => {
  try {
    const sectorId = req.params.sectorId;

    // Also delete all boxes in this sector
    const boxesSnap = await db.collection("boxes").where("sectorId", "==", sectorId).get();
    const batch = db.batch();
    boxesSnap.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(db.collection("sectors").doc(sectorId));
    await batch.commit();

    res.json({ message: "Sector and its boxes deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
