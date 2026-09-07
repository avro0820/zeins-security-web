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
      const sectorDoc = await db.collection("sectors").doc(sectorId).get();
      const isPublicSector = sectorDoc.exists && sectorDoc.data().isPublic !== false;
      if (!isPublicSector && !access.includes("*") && !access.includes(sectorId)) {
        return res.status(403).json({ error: "Access denied to this sector" });
      }
    }

    const snap = await db.collection("boxes")
      .where("sectorId", "==", sectorId)
      .get();

    const boxes = snap.docs.map((d) => {
      const data = d.data();
      // Always hide actual URLs from regular users
      if (user.role !== "admin" && user.role !== "owner") {
        return {
          id: d.id,
          ...data,
          webLink: (data.webLink || data.resourceUrl) ? "HIDDEN" : null,
          resourceUrl: data.resourceUrl ? "HIDDEN" : null,
          tutorialUrl: data.tutorialUrl ? "HIDDEN" : null,
          plpFileUrl: data.plpFileUrl ? "HIDDEN" : null,
          appLink: data.appLink ? "HIDDEN" : null,
          // Boolean flags so frontend renders clean action buttons
          hasWebLink: !!(data.webLink || data.resourceUrl),
          hasTutorialUrl: !!data.tutorialUrl,
          hasPlpFile: !!(data.plpFileUrl || (data.files && data.files.length)),
          hasAppLink: !!data.appLink,
        };
      }
      return { id: d.id, ...data };
    });

    boxes.sort((a, b) => (a.order || 0) - (b.order || 0));

    res.json({ boxes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to check user access to a box's sector
async function checkUserBoxAccess(req, boxData) {
  const user = req.user;
  if (user.role === "admin" || user.role === "owner") return true;

  const sectorDoc = await db.collection("sectors").doc(boxData.sectorId).get();
  const isPublicSector = sectorDoc.exists && sectorDoc.data().isPublic !== false;
  const access = user.accessList || [];

  if (!isPublicSector && !access.includes("*") && !access.includes(boxData.sectorId)) {
    return false;
  }
  return true;
}

// POST /api/boxes/:boxId/open-resource or open-web — returns redirect for hidden Web Link
router.post(["/:boxId/open-resource", "/:boxId/open-web"], verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("boxes").doc(req.params.boxId).get();
    if (!doc.exists) return res.status(404).json({ error: "Box not found" });
    const data = doc.data();

    const allowed = await checkUserBoxAccess(req, data);
    if (!allowed) return res.status(403).json({ error: "Access denied to this sector" });

    const targetUrl = data.webLink || data.resourceUrl;
    if (!targetUrl) return res.status(404).json({ error: "No web link configured for this box" });
    res.json({ url: targetUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boxes/:boxId/open-tutorial — returns redirect for hidden Video Link
router.post("/:boxId/open-tutorial", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("boxes").doc(req.params.boxId).get();
    if (!doc.exists) return res.status(404).json({ error: "Box not found" });
    const data = doc.data();

    const allowed = await checkUserBoxAccess(req, data);
    if (!allowed) return res.status(403).json({ error: "Access denied to this sector" });

    if (!data.tutorialUrl) return res.status(404).json({ error: "No tutorial video URL configured" });
    res.json({ url: data.tutorialUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boxes/:boxId/open-plp — returns redirect for hidden PLP / File Pack Link
router.post("/:boxId/open-plp", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("boxes").doc(req.params.boxId).get();
    if (!doc.exists) return res.status(404).json({ error: "Box not found" });
    const data = doc.data();

    const allowed = await checkUserBoxAccess(req, data);
    if (!allowed) return res.status(403).json({ error: "Access denied to this sector" });

    const plpUrl = data.plpFileUrl || (data.files && data.files[0]?.url);
    if (!plpUrl) return res.status(404).json({ error: "No PLP / file pack attached to this box" });
    res.json({ url: plpUrl, name: data.plpFileName || "plp-file-package" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/boxes/:boxId/open-app — returns redirect for hidden Workable Companion App Link
router.post("/:boxId/open-app", verifyToken, async (req, res) => {
  try {
    const doc = await db.collection("boxes").doc(req.params.boxId).get();
    if (!doc.exists) return res.status(404).json({ error: "Box not found" });
    const data = doc.data();

    const allowed = await checkUserBoxAccess(req, data);
    if (!allowed) return res.status(403).json({ error: "Access denied to this sector" });

    if (!data.appLink) return res.status(404).json({ error: "No workable companion app configured" });
    res.json({ url: data.appLink, name: data.appName || "Companion App" });
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
      webLink, resourceUrl, tutorialUrl,
      plpFileUrl, plpFileName, plpFileSize,
      appLink, appName,
      tags, files, order
    } = req.body;

    if (!sectorId || !title) return res.status(400).json({ error: "sectorId and title required" });

    // Verify sector exists
    const sectorDoc = await db.collection("sectors").doc(sectorId).get();
    if (!sectorDoc.exists) return res.status(404).json({ error: "Sector not found" });

    const snap = await db.collection("boxes")
      .where("sectorId", "==", sectorId)
      .get();
    const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order || 0), 0);

    const boxData = {
      sectorId,
      title,
      instruction: instruction || "",
      templateText: templateText || "",
      webLink: webLink || resourceUrl || "",
      resourceUrl: resourceUrl || webLink || "",
      tutorialUrl: tutorialUrl || "",
      plpFileUrl: plpFileUrl || "",
      plpFileName: plpFileName || "",
      plpFileSize: plpFileSize || "",
      appLink: appLink || "",
      appName: appName || "",
      tags: tags || [],
      files: files || [],
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
      "title", "instruction", "templateText", "webLink", "resourceUrl",
      "tutorialUrl", "plpFileUrl", "plpFileName", "plpFileSize",
      "appLink", "appName", "tags", "files", "isActive", "order"
    ];
    const updates = { updatedAt: new Date().toISOString() };
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) {
        updates[k] = req.body[k];
      }
    });

    // Synchronize webLink and resourceUrl if either is set
    if (req.body.webLink !== undefined && req.body.resourceUrl === undefined) {
      updates.resourceUrl = req.body.webLink;
    } else if (req.body.resourceUrl !== undefined && req.body.webLink === undefined) {
      updates.webLink = req.body.resourceUrl;
    }

    await db.collection("boxes").doc(req.params.boxId).update(updates);
    res.json({ message: "Box updated successfully" });
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
