/**
 * Notification Microservice
 * -------------------------
 * Periodically scans DynamoDB for completed video jobs
 * and logs notifications to the console.
 */

require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});
const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");

// Load environment variables
const REGION = process.env.AWS_REGION;
const TABLE_NAME = process.env.DDB_TABLE;

if (!REGION || !TABLE_NAME) {
  throw new Error(
    "AWS_REGION and DYNAMO_TABLE_NAME must be set in environment variables"
  );
}

const dynamo = new DynamoDBClient({ region: REGION });

console.log(`[Notifier] Service started...`);
console.log(`[Notifier] Monitoring table: ${TABLE_NAME}`);

async function checkCompletedJobs() {
  try {
    const command = new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: "#s = :completed",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":completed": { S: "completed" } },
    });

    const res = await dynamo.send(command);

    if (res.Items.length === 0) {
      console.log("[Notifier] No completed jobs found.");
      return;
    }

    for (const item of res.Items) {
      const username = item.username?.S || "unknown";
      const videoId = item.videoId?.S || "unknown";
      console.log(
        `[Notifier] ✅ User '${username}' — Video '${videoId}' marked as completed.`
      );
    }
  } catch (err) {
    console.error("[Notifier] Error scanning table:", err.message);
  }
}

// Run every 60 seconds
setInterval(checkCompletedJobs, 60 * 1000);
