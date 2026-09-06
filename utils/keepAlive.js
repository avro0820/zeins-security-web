/**
 * keepAlive.js — pings the server every 14 min so Render free tier stays awake.
 */
const https = require("https");
const http  = require("http");

const keepAlive = () => {
  const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
  if (!RENDER_URL) return;

  setInterval(() => {
    const url  = `${RENDER_URL}/api/health`;
    const lib  = url.startsWith("https") ? https : http;
    lib.get(url, (res) => {
      console.log(`💓 Keep-alive ping → ${res.statusCode}`);
    }).on("error", (err) => {
      console.warn(`⚠️  Keep-alive failed: ${err.message}`);
    });
  }, 14 * 60 * 1000);

  console.log(`💓 Keep-alive running for: ${RENDER_URL}`);
};

module.exports = keepAlive;
