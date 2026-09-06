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
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        credential = admin.credential.cert(serviceAccount);
        console.log("🔑 Firebase: loaded from FIREBASE_SERVICE_ACCOUNT env var");
      } catch (e) {
        console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT env var:", e.message);
        process.exit(1);
      }
    } else {
      // Option 3: Google Application Default Credentials (Google Cloud)
      credential = admin.credential.applicationDefault();
      console.log("🔑 Firebase: using Application Default Credentials");
    }
  }

  admin.initializeApp({
    credential,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });

  console.log(`📦 Storage bucket: ${process.env.FIREBASE_STORAGE_BUCKET}`);
}

const db      = admin.firestore();
const auth    = admin.auth();
const storage = admin.storage();

module.exports = { admin, db, auth, storage };
