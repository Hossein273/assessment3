const {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");
const sqs = new SQSClient({ region: process.env.AWS_REGION });
const QUEUE_URL = process.env.SQS_QUEUE_URL;
async function sendToQueue(messageBody) {
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify(messageBody),
    })
  );
  console.log(`[SQS] Enqueued job for video ${messageBody.videoId}`);
}

// --- Worker: receive a job ---
async function receiveMessage() {
  const res = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: 1,
      WaitTimeSeconds: 20, // long polling
      VisibilityTimeout: 90,
    })
  );
  return res.Messages && res.Messages.length ? res.Messages[0] : null;
}

// --- Worker: delete a processed job ---
async function deleteMessage(receiptHandle) {
  await sqs.send(
    new DeleteMessageCommand({
      QueueUrl: QUEUE_URL,
      ReceiptHandle: receiptHandle,
    })
  );
  console.log(`[SQS] Deleted message from queue`);
}

module.exports = { sendToQueue, receiveMessage, deleteMessage };
