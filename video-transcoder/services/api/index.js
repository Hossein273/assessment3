require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});
console.log("loaded .env TABLE =", process.env.DDB_TABLE);

const express = require("express");
const fileUpload = require("express-fileupload");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const { sendToQueue } = require("../../shared/queue");
const { listVideos } = require("../../shared/db");
const { requireGroups, getGroups } = require("../../shared/permissions");
const {
  getVideoById,
  deleteVideoRecord,
  getUserVideos,
  adminListAllVideos,
} = require("../../shared/db");

const mime = require("mime");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { enqueueTranscodeJob } = require("../../shared/queue");

// Helpers
const {
  s3,
  BUCKET,
  uploadBufferToS3,
  getDownloadUrl,
} = require("../../shared/storage");
const { getVideo, createVideo, updateVideo } = require("../../shared/db");
const { register, confirm, login, verifyToken } = require("./auth");
const { loadAppConfig } = require("../../shared/config"); // keep this if you use Parameter Store

// Express setup
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload());
app.use(express.static(path.join(__dirname, "public")));

const authenticateToken = verifyToken;

// --- Routes ---

// Default login page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

// Transcoder frontend page
app.get("/transcoder", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "transcoder.html"));
});

// ----------------- Cognito auth -----------------

app.post("/auth/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ error: "Username, email and password required" });
  }
  try {
    await register(username, email, password);
    res.json({
      message: "User registered. Check email for confirmation code.",
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(400).json({ error: err.message });
  }
});

app.post("/auth/confirm", async (req, res) => {
  const { username, code } = req.body;
  if (!username || !code) {
    return res
      .status(400)
      .json({ error: "Username and confirmation code required" });
  }
  try {
    await confirm(username, code);
    res.json({ message: "User confirmed successfully" });
  } catch (err) {
    console.error("Confirm error:", err);
    res.status(400).json({ error: err.message });
  }
});

app.post("/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }
  try {
    const tokens = await login(username, password);
    res.json({ token: tokens.IdToken });
  } catch (err) {
    console.error("Login error:", err);
    res.status(400).json({ error: err.message });
  }
});

// ----------------- Video upload + processing -----------------
app.post("/upload", authenticateToken, async (req, res) => {
  try {
    if (!req.files || !req.files.video) {
      return res.status(400).json({ error: "No video uploaded" });
    }

    const video = req.files.video;
    if (!video.mimetype.startsWith("video/")) {
      return res
        .status(400)
        .json({ error: "Invalid file type. Only videos allowed." });
    }

    const id = uuidv4();
    const ext = mime.getExtension(video.mimetype) || "mp4";
    const rawKey = `raw/${id}.${ext}`;

    // 1. upload to S3
    await uploadBufferToS3(rawKey, video.data, video.mimetype);

    // 2. save metadata
    await createVideo(req.user.username, id, {
      originalName: video.name,
      rawKey,
      status: "QUEUED",
      createdAt: new Date().toISOString(),
    });

    // 3. enqueue for worker
    await sendToQueue({
      username: req.user.username,
      videoId: id,
      bucket: process.env.S3_BUCKET,
      key: rawKey, // 👈 consistent!
    });

    console.log(`[API] Enqueued job ${id} for ${req.user.username}`);

    res.json({
      message: "Video uploaded, job queued for transcoding.",
      videoId: id,
      status: "QUEUED",
    });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Failed to upload video" });
  }
});

// ----------------- S3 Pre-signed Upload -----------------
app.post("/videos/upload-url", authenticateToken, async (req, res) => {
  try {
    const id = uuidv4();
    const key = `raw/${id}.mp4`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: "video/mp4",
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 mins

    await createVideo(req.user.username, id, {
      rawKey: key,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });

    console.log(
      `[S3] Generated pre-signed upload URL for ${req.user.username}`
    );
    res.json({ uploadUrl: url, videoId: id });
  } catch (err) {
    console.error("Error generating upload URL:", err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// Trigger transcoding after presigned upload completes
// Manual trigger (optional if Lambda auto-enqueues jobs)
app.post("/upload/trigger/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Get the video metadata we saved earlier
    const video = await getVideo(req.user.username, id);
    if (!video) {
      return res.status(404).json({ error: "Video not found" });
    }

    // 2. Make sure the video actually has an S3 key
    if (!video.rawKey) {
      return res
        .status(400)
        .json({ error: "Video has no S3 key (rawKey) stored yet." });
    }

    // 3. Update status
    await updateVideo(req.user.username, id, { status: "QUEUED" });

    // 4. Enqueue job for the worker – NOTE: use video.rawKey here 👇
    await sendToQueue({
      username: req.user.username,
      videoId: id,
      bucket: process.env.S3_BUCKET,
      key: video.rawKey,
    });

    console.log(`[API] Manually triggered transcoding for ${id}`);
    res.json({ message: "Transcoding job queued manually.", videoId: id });
  } catch (err) {
    console.error("Trigger error:", err);
    res.status(500).json({ error: "Failed to trigger transcoding" });
  }
});

// ----------------- Video Listing -----------------
app.get("/videos", authenticateToken, async (req, res) => {
  try {
    const videos = await getUserVideos(req.user.username);

    // Pre-generate download URLs for completed videos
    const withUrls = await Promise.all(
      videos.map(async (v) => {
        if (v.status === "COMPLETED" && v.processedKey) {
          v.downloadUrl = await getDownloadUrl(v.processedKey, 300);
        }
        return v;
      })
    );

    res.json(withUrls);
  } catch (err) {
    console.error("List videos error:", err);
    res.status(500).json({ error: "Failed to list videos" });
  }
});

// ----------------- Download -----------------
app.get("/videos/:id/download", authenticateToken, async (req, res) => {
  try {
    const video = await getVideo(req.user.username, req.params.id);
    if (!video) return res.status(404).json({ error: "Video not found" });

    if (video.status === "COMPLETED" && video.processedKey) {
      const url = await getDownloadUrl(video.processedKey, 300);
      return res.json({ url });
    }

    if (video.rawKey) {
      const url = await getDownloadUrl(video.rawKey, 300);
      return res.json({ url });
    }

    res.status(404).json({ error: "Video not available" });
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({ error: "Failed to generate download link" });
  }
});

// ----------------- Admin Delete -----------------
app.delete(
  "/admin/videos/:id",
  authenticateToken,
  requireGroups("Admin"),
  async (req, res) => {
    const { id } = req.params;
    try {
      const video = await getVideoById(id);
      if (!video) return res.status(404).json({ error: "Video not found" });

      if (video.rawKey)
        await s3.send(
          new DeleteObjectCommand({ Bucket: BUCKET, Key: video.rawKey })
        );
      if (video.processedKey)
        await s3.send(
          new DeleteObjectCommand({ Bucket: BUCKET, Key: video.processedKey })
        );

      await deleteVideoRecord(video.username, id);
      res.json({ message: `Video ${id} deleted by Admin` });
    } catch (err) {
      console.error("Admin delete error:", err);
      res.status(500).json({ error: "Failed to delete video" });
    }
  }
);

// ----------------- Transcoding -----------------
async function transcodeVideo(username, videoId, rawKey) {
  const tmpRaw = path.join("/tmp", `raw-${videoId}.mp4`);
  const tmpOut = path.join("/tmp", `out-${videoId}.mp4`);

  try {
    const obj = await s3.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: rawKey })
    );
    const fileBuffer = Buffer.from(await obj.Body.transformToByteArray());
    fs.writeFileSync(tmpRaw, fileBuffer);

    await updateVideo(username, videoId, { status: "PROCESSING" });

    const cfg = await loadAppConfig();
    const preset = cfg.transcodePreset;

    await new Promise((resolve, reject) => {
      const ff = ffmpeg(tmpRaw).outputOptions([
        "-c:v",
        "libx264",
        "-crf",
        "18",
        "-preset",
        "veryslow",
      ]);

      if (preset === "1080p") {
        ff.outputOptions(["-vf", "scale=-1:1080"]);
      } else {
        ff.outputOptions(["-vf", "scale=-1:720"]);
      }

      ff.on("start", () =>
        console.log(`[Transcoder] Starting ${videoId} with preset ${preset}`)
      )
        .on("progress", (p) => {
          if (p.percent)
            console.log(`[Transcoder] ${videoId}: ${p.percent.toFixed(1)}%`);
        })
        .on("end", resolve)
        .on("error", reject)
        .save(tmpOut);
    });

    const outBuffer = fs.readFileSync(tmpOut);
    const processedKey = `processed/${videoId}_${preset}.mp4`;
    await uploadBufferToS3(processedKey, outBuffer, "video/mp4");

    await updateVideo(username, videoId, {
      status: "COMPLETED",
      processedKey,
      updatedAt: new Date().toISOString(),
    });

    console.log(`[Transcoder] Finished ${videoId}`);
  } catch (err) {
    console.error(`[Transcoder] Error transcoding ${videoId}: ${err.message}`);
    await updateVideo(username, videoId, { status: "FAILED" });
  } finally {
    [tmpRaw, tmpOut].forEach((f) => {
      try {
        fs.unlinkSync(f);
      } catch {}
    });
  }
}

app.get("/config.js", async (req, res) => {
  try {
    const cfg = await loadAppConfig();
    res.type("application/javascript");
    res.send(`window.API_BASE_URL = "${cfg.apiBaseUrl}";`);
  } catch (err) {
    console.error("Failed to load config:", err);
    res.type("application/javascript");
    res.send(`window.API_BASE_URL = "/";`);
  }
});

// ----------------- Start -----------------
app.listen(PORT, "0.0.0.0", () =>
  console.log(`Server running on port ${PORT}`)
);
