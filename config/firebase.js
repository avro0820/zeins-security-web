const admin = require("firebase-admin");

if (!admin.apps.length) {
  let credential;

  // Option 1: JSON file (local development)
  try {
    const serviceAccount = require("./serviceAccountKey.json");
    credential = admin.credential.cert(serviceAccount);
    console.log("🔑 Firebase: loaded from serviceAccountKey.json");
  } catch (_) {
    // Option 2: Environment variable (Render.com production)
    const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (rawServiceAccount) {
      try {
        let jsonString = rawServiceAccount.trim();
        // Support base64 encoded string if provided
        if (!jsonString.startsWith("{")) {
          jsonString = Buffer.from(jsonString, "base64").toString("utf-8");
        }
        const serviceAccount = JSON.parse(jsonString);
        credential = admin.credential.cert(serviceAccount);
        console.log("🔑 Firebase: loaded from FIREBASE_SERVICE_ACCOUNT env var");
      } catch (e) {
        console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", e.message);
        process.exit(1);
      }
    } else {
      // Option 3: Google Application Default Credentials (Google Cloud)
      try {
        credential = admin.credential.applicationDefault();
        console.log("🔑 Firebase: using Application Default Credentials");
      } catch (adcErr) {
        console.warn("⚠️ Firebase credentials not found! Ensure serviceAccountKey.json exists locally or FIREBASE_SERVICE_ACCOUNT is configured in Render.");
      }
    }
  }

  try {
    admin.initializeApp({
      credential,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "zeins-web-setup.firebasestorage.app",
    });
    console.log(`📦 Storage bucket: ${process.env.FIREBASE_STORAGE_BUCKET || "zeins-web-setup.firebasestorage.app"}`);
  } catch (initErr) {
    console.error("❌ Firebase initializeApp error:", initErr.message);
  }
}

const db      = admin.firestore();
const auth    = admin.auth();
const storage = admin.storage();

module.exports = { admin, db, auth, storage };
