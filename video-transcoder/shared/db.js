// db.js
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || "ap-southeast-2" })
);
const TABLE = process.env.DDB_TABLE;

// Create a new video record
async function createVideo(username, videoId, metadata) {
  try {
    const item = {
      username,
      videoId,
      ...metadata,
    };
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: item,
      })
    );
    console.log(`[DB] Created video for ${username}, ID: ${videoId}`);
  } catch (err) {
    console.error("createVideo error:", err);
  }
}

// Get one video by username + videoId
async function getVideo(username, videoId) {
  try {
    const cmd = new GetCommand({
      TableName: TABLE,
      Key: { username, videoId },
    });
    const out = await ddb.send(cmd);
    return out.Item || null;
  } catch (err) {
    console.error("getVideo error:", err);
    return null;
  }
}

// Update a video (e.g. status or processedKey)
async function updateVideo(username, videoId, updates) {
  try {
    const updateExpr = [];
    const exprNames = {};
    const exprValues = {};

    for (const [key, val] of Object.entries(updates)) {
      updateExpr.push(`#${key} = :${key}`);
      exprNames[`#${key}`] = key;
      exprValues[`:${key}`] = val;
    }

    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { username, videoId },
        UpdateExpression: "SET " + updateExpr.join(", "),
        ExpressionAttributeNames: exprNames,
        ExpressionAttributeValues: exprValues,
      })
    );
    console.log(`[DB] Updated video ${videoId} for ${username}`);
  } catch (err) {
    console.error("updateVideo error:", err);
  }
}

// Delete one video
async function deleteVideoRecord(username, videoId) {
  try {
    const cmd = new DeleteCommand({
      TableName: TABLE,
      Key: { username, videoId },
    });
    await ddb.send(cmd);
    console.log(`[DB] Deleted video ${videoId} for user ${username}`);
  } catch (err) {
    console.error("deleteVideoRecord error:", err);
  }
}

// List videos for one user
async function getUserVideos(username) {
  try {
    const cmd = new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "#u = :u",
      ExpressionAttributeNames: { "#u": "username" },
      ExpressionAttributeValues: { ":u": username },
    });
    const out = await ddb.send(cmd);
    return out.Items || [];
  } catch (err) {
    console.error("getUserVideos error:", err);
    return [];
  }
}

// List ALL videos (Admin only)
async function adminListAllVideos() {
  try {
    const cmd = new ScanCommand({ TableName: TABLE });
    const out = await ddb.send(cmd);
    return out.Items || [];
  } catch (err) {
    console.error("adminListAllVideos error:", err);
    return [];
  }
}

module.exports = {
  createVideo,
  getVideo,
  updateVideo,
  deleteVideoRecord,
  getUserVideos,
  adminListAllVideos,
};
