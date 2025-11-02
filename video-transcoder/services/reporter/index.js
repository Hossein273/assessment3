/**
 * Reporting Microservice
 * -----------------------
 * Provides a simple REST endpoint (/report)
 * that summarises job status counts from DynamoDB.
 */

require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});
const express = require("express");
const { DynamoDBClient, ScanCommand } = require("@aws-sdk/client-dynamodb");

const app = express();
const REGION = process.env.AWS_REGION;
const TABLE_NAME = process.env.DYNAMO_TABLE_NAME;

if (!REGION || !TABLE_NAME) {
  throw new Error(
    "AWS_REGION and DYNAMO_TABLE_NAME must be set in environment variables"
  );
}

const dynamo = new DynamoDBClient({ region: REGION });

// Root route
app.get("/", (req, res) => {
  res.send(
    "🎥 Video Transcoder Reporting Service is running! Visit /report to view stats."
  );
});

// /report route for summarised data
app.get("/report", async (req, res) => {
  try {
    const result = await dynamo.send(
      new ScanCommand({ TableName: TABLE_NAME })
    );
    const items = result.Items || [];

    const summary = items.reduce((acc, item) => {
      const status = item.status?.S || "unknown";
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    res.json({
      totalItems: items.length,
      summary,
      timestamp: new Date().toISOString(),
    });

    console.log("[Reporter] Summary generated:", summary);
  } catch (err) {
    console.error("[Reporter] Error fetching report:", err.message);
    res.status(500).json({ error: "Failed to generate report" });
  }
});

const PORT = 4000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[Reporter] Service running on port ${PORT}`);
});
