/**
 * Dead Letter Queue Processor
 * ---------------------------
 * This tool reads messages from the DLQ (dead-letter queue)
 * and logs them for review or requeues them into the main SQS queue.
 *
 * Usage:
 *   node services/tools/dlq_processor.js
 */

require("dotenv").config({
  path: require("path").join(__dirname, "../../.env"),
});
const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
} = require("@aws-sdk/client-sqs");

// ✅ Environment Variables
const REGION = process.env.AWS_REGION;
const DLQ_URL = process.env.DLQ_QUEUE_URL;
const MAIN_QUEUE_URL = process.env.SQS_QUEUE_URL;

if (!REGION || !DLQ_URL || !MAIN_QUEUE_URL) {
  console.error(
    "[DLQ] ❌ Missing required environment variables. Check .env file."
  );
  process.exit(1);
}

// ✅ Create SQS Client
const sqs = new SQSClient({ region: REGION });

/**
 * Fetch messages from the DLQ
 */
async function processDLQ() {
  try {
    console.log(`[DLQ] Checking for failed messages in: ${DLQ_URL}`);

    const receiveCmd = new ReceiveMessageCommand({
      QueueUrl: DLQ_URL,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 3,
    });

    const response = await sqs.send(receiveCmd);

    if (!response.Messages || response.Messages.length === 0) {
      console.log("[DLQ] No failed messages found.");
      return;
    }

    console.log(`[DLQ] Found ${response.Messages.length} failed message(s).`);

    for (const msg of response.Messages) {
      console.log("───────────────────────────────────────────");
      console.log(`[DLQ] Message ID: ${msg.MessageId}`);
      console.log(`[DLQ] Body: ${msg.Body}`);
      console.log("───────────────────────────────────────────");

      // Option 1: Log and delete (just inspection)
      await sqs.send(
        new DeleteMessageCommand({
          QueueUrl: DLQ_URL,
          ReceiptHandle: msg.ReceiptHandle,
        })
      );
      console.log(`[DLQ] 🗑️  Deleted message ${msg.MessageId} from DLQ.`);

      // Option 2: (Optional) Requeue message to main queue
      // Uncomment the following lines if you want to retry it automatically:
      /*
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: MAIN_QUEUE_URL,
          MessageBody: msg.Body
        })
      );
      console.log(`[DLQ] 🔁 Requeued message ${msg.MessageId} to main queue.`);
      */
    }
  } catch (err) {
    console.error("[DLQ] Error processing DLQ:", err.message);
  }
}

/**
 * Entry point
 */
(async () => {
  console.log("============================================");
  console.log("     Video Transcoder DLQ Processor");
  console.log("============================================");
  console.log(`Region: ${REGION}`);
  console.log(`DLQ URL: ${DLQ_URL}`);
  console.log(`Main Queue URL: ${MAIN_QUEUE_URL}`);
  console.log("--------------------------------------------");

  await processDLQ();

  console.log("[DLQ] Processing complete.");
})();
