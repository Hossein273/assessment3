/**
 * Worker Service – Video Transcoding Worker
 * ------------------------------------------
 * Polls SQS for messages from the "transcoding-job" queue,
 * downloads the video from S3, transcodes it using FFmpeg,
 * uploads the result back to S3, updates DynamoDB status,
 * and automatically lets SQS send failed jobs to the DLQ.
 */

require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});
const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");
const {
  DynamoDBClient,
  UpdateItemCommand,
} = require("@aws-sdk/client-dynamodb");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const ffmpeg = require("fluent-ffmpeg");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const REGION = process.env.AWS_REGION;
const QUEUE_URL = process.env.SQS_QUEUE_URL;
const BUCKET = process.env.S3_BUCKET;
const TABLE_NAME = process.env.DDB_TABLE;

if (!QUEUE_URL || !BUCKET || !TABLE_NAME) {
  throw new Error(
    "Missing required environment variables (SQS_QUEUE_URL, S3_BUCKET, DYNAMO_TABLE_NAME)"
  );
}

const sqs = new SQSClient({ region: REGION });
const s3 = new S3Client({ region: REGION });
const dynamo = new DynamoDBClient({ region: REGION });

// ---------------------------------------------
// Helper: download file from S3
// ---------------------------------------------
async function downloadFromS3(key, destPath) {
  const data = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const writeStream = fs.createWriteStream(destPath);
  return new Promise((resolve, reject) => {
    data.Body.pipe(writeStream);
    data.Body.on("error", reject);
    writeStream.on("finish", resolve);
  });
}

// ---------------------------------------------
// Helper: upload file to S3
// ---------------------------------------------
async function uploadToS3(filePath, key) {
  const fileStream = fs.createReadStream(filePath);
  await s3.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: fileStream })
  );
  console.log(`[S3] Uploaded transcoded file: ${key}`);
}

// ---------------------------------------------
// Helper: update DynamoDB status
// ---------------------------------------------
async function updateVideoStatus(username, videoId, status) {
  await dynamo.send(
    new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: {
        username: { S: username },
        videoId: { S: videoId },
      },
      UpdateExpression: "SET #s = :status",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":status": { S: status } },
    })
  );
  console.log(`[DB] Updated ${username}/${videoId} → ${status}`);
}

// ---------------------------------------------
// Transcode video (CPU intensive)
// ---------------------------------------------
async function transcodeVideo(localInput, localOutput) {
  console.log(`[FFmpeg] Transcoding ${localInput} → ${localOutput}`);
  return new Promise((resolve, reject) => {
    ffmpeg(localInput)
      .outputOptions([
        "-vf scale=-1:720",
        "-c:v libx264",
        "-preset slow",
        "-crf 22",
      ])
      .on("end", resolve)
      .on("error", reject)
      .save(localOutput);
  });
}

// ---------------------------------------------
// Process one SQS message
// ---------------------------------------------
async function processMessage(msg) {
  const body = JSON.parse(msg.Body);
  const { username, videoId, s3Key } = body;

  console.log(`[Worker] Processing video ${videoId}`);

  const tempInput = path.join("/tmp", `${uuidv4()}_input.mp4`);
  const tempOutput = path.join("/tmp", `${uuidv4()}_output_720p.mp4`);

  try {
    await updateVideoStatus(username, videoId, "processing");
    await downloadFromS3(s3Key, tempInput);
    await transcodeVideo(tempInput, tempOutput);
    const outputKey = s3Key.replace("uploads/", "uploads/transcoded/");

    await uploadToS3(tempOutput, outputKey);
    await updateVideoStatus(username, videoId, "completed");

    fs.unlinkSync(tempInput);
    fs.unlinkSync(tempOutput);

    console.log(`[Worker] ✅ Completed job for ${videoId}`);
  } catch (err) {
    console.error(`[Worker] ❌ Failed job for ${videoId}:`, err.message);
    await updateVideoStatus(videoId, "failed");
    throw err; // 🔹 Important: Re-throw so SQS redrives to DLQ after maxReceiveCount
  }
}

// ---------------------------------------------
// Poll SQS for jobs
// ---------------------------------------------
async function pollQueue() {
  console.log(`[Worker] Listening for jobs on: ${QUEUE_URL}`);
  while (true) {
    try {
      const { Messages } = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: QUEUE_URL,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 10,
        })
      );

      if (!Messages || Messages.length === 0) continue;

      for (const msg of Messages) {
        try {
          await processMessage(msg);

          // ✅ Delete message only if successful
          await sqs.send(
            new DeleteMessageCommand({
              QueueUrl: QUEUE_URL,
              ReceiptHandle: msg.ReceiptHandle,
            })
          );
          console.log(`[SQS] Deleted message for ${msg.MessageId}`);
        } catch (err) {
          console.error(
            `[SQS] Message ${msg.MessageId} failed → will retry / DLQ`
          );
        }
      }
    } catch (err) {
      console.error("[Worker] Poll error:", err);
      await new Promise((r) => setTimeout(r, 5000)); // wait before retry
    }
  }
}

// ---------------------------------------------
pollQueue();
