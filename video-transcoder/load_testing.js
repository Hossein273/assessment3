/**
 * load_testing.js
 * ----------------
 * Stress test your video transcoder API running on EC2.
 * - Sends concurrent uploads to the API /upload endpoint
 * - Polls /videos/:id/status until complete or failed
 * - Designed to simulate load for CloudWatch + Auto Scaling
 */

const fetch = require("node-fetch");
const fs = require("fs");
const FormData = require("form-data");

// 🔧 CONFIGURATION
const API_BASE_URL =
  process.env.API_BASE_URL ||
  "http://ec2-3-106-248-75.ap-southeast-2.compute.amazonaws.com:3000"; // ✅ your API EC2 public DNS
const TOKEN = process.env.JWT_TOKEN || "PASTE_YOUR_VALID_JWT_TOKEN_HERE"; // replace or export before running
const VIDEO_FILE = process.env.VIDEO_FILE || "video1.mp4"; // path to your sample video
const NUM_REQUESTS = parseInt(process.env.NUM_REQUESTS || "5"); // number of concurrent uploads
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || "3000"); // 3s between polls

console.log("🚀 Load test starting...");
console.log(`Target API: ${API_BASE_URL}`);
console.log(`Concurrent uploads: ${NUM_REQUESTS}`);
console.log(`Using token: ${TOKEN.slice(0, 15)}...`);

// ------------- Upload Function -------------
async function uploadVideo(i) {
  const form = new FormData();
  form.append("video", fs.createReadStream(VIDEO_FILE));

  try {
    const res = await fetch(`${API_BASE_URL}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    });

    const result = await res.json();
    if (!res.ok) {
      console.error(`❌ Request ${i} failed:`, result.error || res.statusText);
      return;
    }

    console.log(
      `✅ Request ${i}: Upload successful! VideoId = ${result.videoId}`
    );

    // Poll status
    const startTime = Date.now();
    await pollVideoStatus(i, result.videoId, startTime);
  } catch (err) {
    console.error(`❌ Request ${i} failed:`, err.message);
  }
}

// ------------- Polling Function -------------
async function pollVideoStatus(i, videoId, startTime) {
  let attempts = 0;
  let done = false;

  while (!done && attempts < 20) {
    try {
      const res = await fetch(`${API_BASE_URL}/videos/${videoId}/status`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });

      const result = await res.json();
      console.log(
        `📡 Request ${i}: Poll ${attempts} -> Status: ${result.status}`
      );

      if (result.status === "completed" || result.status === "failed") {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(
          `🎬 Request ${i}: Transcoding ${result.status} after ${duration}s`
        );
        done = true;
      } else {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      }
    } catch (err) {
      console.error(`⚠️ Request ${i}: Poll error ->`, err.message);
      break;
    }

    attempts++;
  }
}

// ------------- Main Runner -------------
(async () => {
  const promises = [];
  for (let i = 1; i <= NUM_REQUESTS; i++) {
    promises.push(uploadVideo(i));
  }
  await Promise.all(promises);
  console.log("🏁 All requests finished.");
})();
