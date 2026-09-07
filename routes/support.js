const express = require("express");
const router = express.Router();
const { db } = require("../config/firebase");
const { verifyToken, requireAdmin } = require("../middleware/auth");

// ── POST /api/support — Create a new support ticket / inquiry ──
router.post("/", verifyToken, async (req, res) => {
  try {
    const { subject, category, priority, sectorId, sectorName, message } = req.body;

    if (!subject || !subject.trim()) {
      return res.status(400).json({ error: "Subject is required" });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message is required" });
    }

    const now = new Date().toISOString();
    const senderRole = req.user.role || "user";
    const senderName = req.user.name || req.user.email.split("@")[0];

    const ticketData = {
      userId: req.user.uid,
      userEmail: req.user.email,
      userName: senderName,
      userRole: senderRole,
      subject: subject.trim(),
      category: category || "General Support",
      priority: priority || "normal",
      sectorId: sectorId || null,
      sectorName: sectorName || null,
      status: "open", // open | replied | resolved | closed
      unreadByUser: false,
      unreadByAdmin: true,
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: "msg_" + Date.now(),
          senderId: req.user.uid,
          senderName,
          senderEmail: req.user.email,
          senderRole,
          text: message.trim(),
          timestamp: now,
        },
      ],
    };

    const docRef = await db.collection("support_tickets").add(ticketData);
    res.status(201).json({
      message: "Support ticket created successfully",
      ticket: { id: docRef.id, ...ticketData },
    });
  } catch (err) {
    console.error("Create ticket error:", err);
    res.status(500).json({ error: err.message || "Failed to create support ticket" });
  }
});

// ── GET /api/support — List tickets (User sees own, Admin/Owner sees all) ──
router.get("/", verifyToken, async (req, res) => {
  try {
    const isAdmin = req.user.role === "admin" || req.user.role === "owner";
    let query = db.collection("support_tickets");

    if (!isAdmin) {
      query = query.where("userId", "==", req.user.uid);
    }

    const snap = await query.get();
    let tickets = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // In-memory sort by updatedAt descending
    tickets.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    // Calculate unread count
    let unreadCount = 0;
    if (isAdmin) {
      unreadCount = tickets.filter((t) => t.unreadByAdmin).length;
    } else {
      unreadCount = tickets.filter((t) => t.unreadByUser).length;
    }

    res.json({ tickets, unreadCount });
  } catch (err) {
    console.error("List tickets error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch support tickets" });
  }
});

// ── GET /api/support/:id — Get ticket details & mark read ──
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const docRef = db.collection("support_tickets").doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticket = doc.data();
    const isAdmin = req.user.role === "admin" || req.user.role === "owner";

    if (!isAdmin && ticket.userId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied to this ticket" });
    }

    // Mark as read according to caller
    const updates = {};
    if (isAdmin && ticket.unreadByAdmin) {
      updates.unreadByAdmin = false;
      ticket.unreadByAdmin = false;
    }
    if (!isAdmin && ticket.unreadByUser) {
      updates.unreadByUser = false;
      ticket.unreadByUser = false;
    }

    if (Object.keys(updates).length > 0) {
      await docRef.update(updates);
    }

    res.json({ ticket: { id: doc.id, ...ticket } });
  } catch (err) {
    console.error("Get ticket error:", err);
    res.status(500).json({ error: err.message || "Failed to fetch ticket" });
  }
});

// ── POST /api/support/:id/reply — Add a reply in conversation thread ──
router.post("/:id/reply", verifyToken, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "Message text cannot be empty" });
    }

    const docRef = db.collection("support_tickets").doc(req.params.id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    const ticket = doc.data();
    const isAdmin = req.user.role === "admin" || req.user.role === "owner";

    if (!isAdmin && ticket.userId !== req.user.uid) {
      return res.status(403).json({ error: "Access denied to this ticket" });
    }

    const now = new Date().toISOString();
    const senderRole = req.user.role || "user";
    const senderName = req.user.name || req.user.email.split("@")[0];

    const replyMsg = {
      id: "msg_" + Date.now(),
      senderId: req.user.uid,
      senderName,
      senderEmail: req.user.email,
      senderRole,
      text: message.trim(),
      timestamp: now,
    };

    const messages = Array.isArray(ticket.messages) ? [...ticket.messages, replyMsg] : [replyMsg];

    const updates = {
      messages,
      updatedAt: now,
      status: isAdmin ? "replied" : "open",
      unreadByUser: isAdmin,
      unreadByAdmin: !isAdmin,
    };

    await docRef.update(updates);

    res.json({
      message: "Reply sent successfully",
      reply: replyMsg,
      ticket: { id: doc.id, ...ticket, ...updates },
    });
  } catch (err) {
    console.error("Reply ticket error:", err);
    res.status(500).json({ error: err.message || "Failed to post reply" });
  }
});

// ── PUT /api/support/:id/status — Admin/Owner change ticket status ──
router.put("/:id/status", verifyToken, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["open", "replied", "resolved", "closed"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const docRef = db.collection("support_tickets").doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Ticket not found" });

    const now = new Date().toISOString();
    await docRef.update({
      status,
      updatedAt: now,
    });

    res.json({ message: "Status updated successfully", status });
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({ error: err.message || "Failed to update status" });
  }
});

// ── POST /api/support/:id/grant-sector — Beneficial admin shortcut to approve requested sector ──
router.post("/:id/grant-sector", verifyToken, requireAdmin, async (req, res) => {
  try {
    const docRef = db.collection("support_tickets").doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Ticket not found" });

    const ticket = doc.data();
    if (!ticket.sectorId) {
      return res.status(400).json({ error: "This ticket does not have an attached sector request" });
    }

    // Update user accessList in users collection
    const userRef = db.collection("users").doc(ticket.userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: "Target user not found" });
    }

    const userData = userDoc.data();
    let currentAccess = Array.isArray(userData.accessList) ? [...userData.accessList] : [];
    if (!currentAccess.includes(ticket.sectorId) && !currentAccess.includes("*")) {
      currentAccess.push(ticket.sectorId);
      await userRef.update({
        accessList: currentAccess,
        updatedAt: new Date().toISOString(),
      });
    }

    // Post an automated confirmation reply to the ticket
    const now = new Date().toISOString();
    const systemMsg = {
      id: "msg_" + Date.now(),
      senderId: req.user.uid,
      senderName: `${req.user.name || "Admin"} (System Action)`,
      senderEmail: req.user.email,
      senderRole: req.user.role || "admin",
      text: `✅ Sector Access Granted: You have been granted access to "${ticket.sectorName || ticket.sectorId}". You can now view and download resources inside this sector.`,
      timestamp: now,
    };

    const messages = Array.isArray(ticket.messages) ? [...ticket.messages, systemMsg] : [systemMsg];

    await docRef.update({
      messages,
      status: "resolved",
      unreadByUser: true,
      unreadByAdmin: false,
      updatedAt: now,
    });

    res.json({
      message: `Sector access successfully granted to ${ticket.userName} and ticket resolved.`,
      accessList: currentAccess,
    });
  } catch (err) {
    console.error("Grant sector error:", err);
    res.status(500).json({ error: err.message || "Failed to grant sector access" });
  }
});

// ── DELETE /api/support/:id — Admin/Owner delete ticket ──
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const docRef = db.collection("support_tickets").doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) return res.status(404).json({ error: "Ticket not found" });

    await docRef.delete();
    res.json({ message: "Ticket deleted successfully" });
  } catch (err) {
    console.error("Delete ticket error:", err);
    res.status(500).json({ error: err.message || "Failed to delete ticket" });
  }
});

module.exports = router;
