const fetch = require("node-fetch");
const fs = require("fs");
const FormData = require("form-data");

const NUM_REQUESTS = 5; // number of concurrent uploads
const VIDEO_FILE = "video1.mp4"; // small sample video
const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjllNjE3YmFjLTQxZWMtNGE2ZS1iODZlLTViMDcyNDBjNzZlOSIsInVzZXJuYW1lIjoiYWxpIiwiaWF0IjoxNzU2NTYzMjQ0LCJleHAiOjE3NTY1NjY4NDR9.QGouKxrqbWS5F3bD3c9ojs0PGPvU-FmpFvfLBvT17vo"; // replace with valid token

async function uploadVideo(i) {
  const form = new FormData();
  form.append("video", fs.createReadStream(VIDEO_FILE));

  try {
    // Step 1: Upload video
    const res = await fetch("http://localhost:3000/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: form,
    });

    const result = await res.json();
    if (!res.ok) {
      console.error(`Request ${i} failed:`, result.error || res.statusText);
      return;
    }

    console.log(`Request ${i}: Upload successful! VideoId = ${result.videoId}`);

    // Step 2: Poll video status until done
    const startTime = Date.now();
    await pollVideoStatus(i, result.videoId, startTime);
  } catch (err) {
    console.error(`Request ${i} failed:`, err.message);
  }
}

async function pollVideoStatus(i, videoId, startTime) {
  let attempts = 0;
  let done = false;

  while (!done && attempts < 20) {
    // poll max 20 times
    try {
      const res = await fetch(
        `http://localhost:3000/videos/${videoId}/status`,
        {
          headers: { Authorization: `Bearer ${TOKEN}` },
        }
      );
      const result = await res.json();

      console.log(`Request ${i}: Poll ${attempts} -> Status: ${result.status}`);

      if (result.status === "completed" || result.status === "failed") {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(
          `Request ${i}: Transcoding ${result.status} after ${duration} seconds`
        );
        done = true;
      } else {
        await new Promise((r) => setTimeout(r, 3000)); // wait 3s before next poll
      }
    } catch (err) {
      console.error(`Request ${i}: Poll error ->`, err.message);
      break;
    }

    attempts++;
  }
}

(async () => {
  const promises = [];
  for (let i = 1; i <= NUM_REQUESTS; i++) {
    promises.push(uploadVideo(i));
  }
  await Promise.all(promises);
  console.log("All requests finished.");
})();
