const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const { verifyToken, requireAdmin } = require("../middleware/auth");

const SETTINGS_DOC = "global";

// GET /api/settings — public settings (maintenance status, support links)
router.get("/", async (req, res) => {
  try {
    const doc = await db.collection("settings").doc(SETTINGS_DOC).get();
    if (!doc.exists) {
      return res.json({
        settings: {
          maintenanceMode: false,
          supportLinks: {
            facebook: "",
            telegram: "",
            whatsapp: "",
          },
          systemName: "Zeins Help Center",
        },
      });
    }
    res.json({ settings: doc.data() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings — admin updates settings
router.put("/", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { maintenanceMode, supportLinks, systemName } = req.body;
    const updates = { updatedAt: new Date().toISOString() };
    if (maintenanceMode !== undefined) updates.maintenanceMode = maintenanceMode;
    if (supportLinks !== undefined) updates.supportLinks = supportLinks;
    if (systemName !== undefined) updates.systemName = systemName;

    await db.collection("settings").doc(SETTINGS_DOC).set(updates, { merge: true });
    res.json({ message: "Settings updated" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
