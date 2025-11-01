// worker.js - Video worker consuming SQS jobs and transcoding
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { s3, uploadBufferToS3, BUCKET } = require("./storage");
const { updateVideo } = require("./db");
const { receiveMessage, deleteMessage } = require("./queue");

async function processJob(job) {
  const { username, videoId, rawKey } = job;
  console.log(`[Worker] Processing video ${videoId} for user ${username}`);

  const tmpRaw = path.join("/tmp", `raw-${videoId}.mp4`);
  const tmpOut = path.join("/tmp", `out-${videoId}_720p.mp4`);

  try {
    // Download raw video
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: rawKey })
    );
    const buffer = Buffer.from(await obj.Body.transformToByteArray());
    fs.writeFileSync(tmpRaw, buffer);

    // Update status
    await updateVideo(username, videoId, { status: "PROCESSING" });

    // Transcode
    await new Promise((resolve, reject) => {
      ffmpeg(tmpRaw)
        .outputOptions([
          "-vf",
          "scale=-1:720",
          "-c:v",
          "libx264",
          "-crf",
          "20",
          "-preset",
          "slow",
        ])
        .on("start", () =>
          console.log(`[Worker] Starting ffmpeg for ${videoId}`)
        )
        .on("progress", (p) => {
          if (p.percent)
            console.log(`[Worker] ${videoId}: ${p.percent.toFixed(1)}%`);
        })
        .on("end", resolve)
        .on("error", reject)
        .save(tmpOut);
    });

    // Upload processed file
    const outBuffer = fs.readFileSync(tmpOut);
    const processedKey = `processed/${videoId}_720p.mp4`;
    await uploadBufferToS3(processedKey, outBuffer, "video/mp4");

    // Update DynamoDB
    await updateVideo(username, videoId, {
      status: "COMPLETED",
      processedKey,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[Worker] Completed video ${videoId}`);
  } catch (err) {
    console.error(`[Worker] Error processing ${videoId}:`, err);
    await updateVideo(username, videoId, { status: "FAILED" });
  } finally {
    try {
      fs.unlinkSync(tmpRaw);
    } catch {}
    try {
      fs.unlinkSync(tmpOut);
    } catch {}
  }
}

// --- Continuous polling loop ---
async function pollQueue() {
  console.log("[Worker] Polling for new jobs...");
  while (true) {
    try {
      const msg = await receiveMessage();
      if (msg) {
        const body = JSON.parse(msg.Body);
        await processJob(body);
        await deleteMessage(msg.ReceiptHandle);
      }
    } catch (err) {
      console.error("[Worker] Poll error:", err);
      await new Promise((r) => setTimeout(r, 5000)); // small backoff
    }
  }
}

pollQueue();
