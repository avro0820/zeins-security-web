const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const { verifyToken, requireAdmin, requireSectorAccess } = require("../middleware/auth");

// GET /api/boxes?sectorId=xxx — list boxes in a sector
router.get("/", verifyToken, async (req, res) => {
  try {
    const { sectorId } = req.query;
    if (!sectorId) return res.status(400).json({ error: "sectorId is required" });

    // Check sector access
    const user = req.user;
    if (user.role !== "admin" && user.role !== "owner") {
      const access = user.accessList || [];
      if (!access.includes("*") && !access.includes(sectorId)) {
        return res.status(403).json({ error: "Access denied to this sector" });
      }
    }

    const snap = await db.collection("boxes")
      .where("sectorId", "==", sectorId)
      .orderBy("order", "asc")
      .get();

    const boxes = snap.docs.map((d) => {
      const data = d.data();
      // Always hide actual URLs from regular users
      if (user.role !== "admin" && user.role !== "owner") {
        return {
          id: d.id,
          ...data,
          resourceUrl: data.resourceUrl ? "HIDDEN" : null,
          tutorialUrl: data.tutorialUrl ? "HIDDEN" : null,
          // Keep a boolean so frontend knows if link exists
          hasResourceUrl: !!data.resourceUrl,
          hasTutorialUrl: !!data.tutorialUrl,
        };
      }
      return { id: d.id, ...data };
    });

    res.json({ boxes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boxes/:boxId/open-resource — returns redirect for hidden URL
router.post("/:boxId/open-resource", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("boxes").doc(req.params.boxId).get();
    if (!doc.exists) return res.status(404).json({ error: "Box not found" });
    const data = doc.data();

    // Check sector access
    const user = req.user;
    if (user.role !== "admin" && user.role !== "owner") {
      const access = user.accessList || [];
      if (!access.includes("*") && !access.includes(data.sectorId)) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    if (!data.resourceUrl) return res.status(404).json({ error: "No resource URL" });
    res.json({ url: data.resourceUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boxes/:boxId/open-tutorial
router.post("/:boxId/open-tutorial", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("boxes").doc(req.params.boxId).get();
    if (!doc.exists) return res.status(404).json({ error: "Box not found" });
    const data = doc.data();

    const user = req.user;
    if (user.role !== "admin" && user.role !== "owner") {
      const access = user.accessList || [];
      if (!access.includes("*") && !access.includes(data.sectorId)) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    if (!data.tutorialUrl) return res.status(404).json({ error: "No tutorial URL" });
    res.json({ url: data.tutorialUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/boxes/:boxId — single box
router.get("/:boxId", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("boxes").doc(req.params.boxId).get();
    if (!doc.exists) return res.status(404).json({ error: "Box not found" });
    res.json({ box: { id: doc.id, ...doc.data() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boxes — admin creates box
router.post("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const {
      sectorId, title, instruction, templateText,
      resourceUrl, tutorialUrl, tags, files, order
    } = req.body;

    if (!sectorId || !title) return res.status(400).json({ error: "sectorId and title required" });

    // Verify sector exists
    const sectorDoc = await db.collection("sectors").doc(sectorId).get();
    if (!sectorDoc.exists) return res.status(404).json({ error: "Sector not found" });

    const snap = await db.collection("boxes")
      .where("sectorId", "==", sectorId)
      .orderBy("order", "desc")
      .limit(1)
      .get();
    const maxOrder = snap.empty ? 0 : snap.docs[0].data().order || 0;

    const boxData = {
      sectorId,
      title,
      instruction: instruction || "",
      templateText: templateText || "",
      resourceUrl: resourceUrl || "",
      tutorialUrl: tutorialUrl || "",
      tags: tags || [],
      files: files || [], // Array of { name, url, type, size }
      order: order !== undefined ? order : maxOrder + 1,
      isActive: true,
      createdBy: req.user.uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const ref = await db.collection("boxes").add(boxData);
    res.status(201).json({ box: { id: ref.id, ...boxData } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/boxes/:boxId — admin updates box
router.put("/:boxId", verifyToken, requireAdmin, async (req, res) => {
  try {
    const allowed = [
      "title", "instruction", "templateText", "resourceUrl",
      "tutorialUrl", "tags", "files", "isActive", "order"
    ];
    const updates = { updatedAt: new Date().toISOString() };
    allowed.forEach((k) => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    await db.collection("boxes").doc(req.params.boxId).update(updates);
    res.json({ message: "Box updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/boxes/:boxId — admin deletes box
router.delete("/:boxId", verifyToken, requireAdmin, async (req, res) => {
  try {
    await db.collection("boxes").doc(req.params.boxId).delete();
    res.json({ message: "Box deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
