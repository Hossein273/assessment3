/**
 * Video Transcoder Worker
 * -----------------------
 * Runs on a separate ECS service / compute instance.
 * Continuously polls SQS for new transcode jobs,
 * downloads raw video from S3, runs ffmpeg, uploads processed file,
 * and updates DynamoDB.
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");

// AWS + helpers
const { s3, BUCKET, uploadBufferToS3 } = require("../../shared/storage"); // adjust path if needed
const { GetObjectCommand } = require("@aws-sdk/client-s3");
const { getVideo, updateVideo } = require("../../shared/db");
const { loadAppConfig } = require("../../shared/config");
const { receiveJobs, deleteJob } = require("../../shared/queue");

// ----------------- Main Transcode Function -----------------
async function transcodeVideo(username, videoId, rawKey) {
  const tmpRaw = path.join("/tmp", `raw-${videoId}.mp4`);
  const tmpOut = path.join("/tmp", `out-${videoId}.mp4`);

  try {
    console.log(`[Worker] Starting transcode for ${videoId}`);

    // 1️⃣ Check DynamoDB record (avoid reprocessing)
    const record = await getVideo(username, videoId);
    if (!record) throw new Error(`Record not found in DynamoDB for ${videoId}`);
    if (record.status === "COMPLETED") {
      console.log(`[Worker] ${videoId} already completed — skipping`);
      return;
    }

    // 2️⃣ Download raw video from S3
    console.log(`[Worker] Downloading ${rawKey} from S3...`);
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: rawKey })
    );
    const buffer = Buffer.from(await obj.Body.transformToByteArray());
    fs.writeFileSync(tmpRaw, buffer);

    // 3️⃣ Update status in DynamoDB → PROCESSING
    await updateVideo(username, videoId, { status: "PROCESSING" });

    // 4️⃣ Fetch config (e.g. preset) — fallback safe
    let preset = "720p";
    try {
      const cfg = await loadAppConfig();
      preset = cfg?.transcodePreset || "720p";
    } catch {
      console.warn("[Worker] Using default preset (720p)");
    }

    // 5️⃣ Run ffmpeg
    console.log(`[Worker] Running ffmpeg (${preset})...`);
    await new Promise((resolve, reject) => {
      ffmpeg(tmpRaw)
        .outputOptions(["-c:v", "libx264", "-crf", "18", "-preset", "veryslow"])
        .outputOptions([
          "-vf",
          preset === "1080p" ? "scale=-1:1080" : "scale=-1:720",
        ])
        .on("start", () => console.log(`[ffmpeg] ${videoId} started`))
        .on("progress", (p) => {
          if (p.percent)
            process.stdout.write(
              `\r[ffmpeg] ${videoId}: ${p.percent.toFixed(1)}%`
            );
        })
        .on("end", resolve)
        .on("error", reject)
        .save(tmpOut);
    });

    // 6️⃣ Upload transcoded video back to S3
    const processedKey = `processed/${videoId}_${preset}.mp4`;
    const outBuffer = fs.readFileSync(tmpOut);
    await uploadBufferToS3(processedKey, outBuffer, "video/mp4");

    // 7️⃣ Update DynamoDB → COMPLETED
    await updateVideo(username, videoId, {
      status: "COMPLETED",
      processedKey,
      updatedAt: new Date().toISOString(),
    });

    console.log(`\n[Worker] Finished ${videoId} (${preset})`);
  } catch (err) {
    console.error(`[Worker] Error transcoding ${videoId}:`, err.message);
    try {
      await updateVideo(username, videoId, { status: "FAILED" });
    } catch (dbErr) {
      console.error(
        "[Worker] Failed to mark FAILED in DynamoDB:",
        dbErr.message
      );
    }
  } finally {
    // Cleanup temp files
    [tmpRaw, tmpOut].forEach((f) => {
      try {
        fs.unlinkSync(f);
      } catch {}
    });
  }
}

// ----------------- Job Polling Loop -----------------
async function pollLoop() {
  console.log("[Worker] Started polling for transcode jobs...");
  while (true) {
    try {
      // 1️⃣ Long-poll SQS (wait up to 20s)
      const msgs = await receiveJobs({
        maxNumberOfMessages: 1,
        waitTimeSeconds: 20,
        visibilityTimeout: 900, // 15 min
      });

      if (!msgs.length) continue;

      for (const msg of msgs) {
        const { username, videoId, rawKey } = JSON.parse(msg.Body);
        console.log(`[Queue] Received job for ${videoId}`);
        await transcodeVideo(username, videoId, rawKey);
        await deleteJob(msg.ReceiptHandle);
      }
    } catch (err) {
      console.error("[Worker] Poll loop error:", err.message);
      await new Promise((r) => setTimeout(r, 3000)); // backoff delay
    }
  }
}

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Exiting worker...");
  process.exit(0);
});

// Start polling
pollLoop();
