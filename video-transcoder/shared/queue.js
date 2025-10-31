const {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} = require("@aws-sdk/client-sqs");
const sqs = new SQSClient({ region: process.env.AWS_REGION });
const QUEUE_URL = process.env.QUEUE_URL;

async function enqueueTranscodeJob({ username, videoId, rawKey }) {
  await sqs.send(
    new SendMessageCommand({
      QueueUrl: QUEUE_URL,
      MessageBody: JSON.stringify({
        username,
        videoId,
        rawKey,
        ts: Date.now(),
      }),
    })
  );
}

async function receiveJobs({
  maxNumberOfMessages = 1,
  waitTimeSeconds = 20,
  visibilityTimeout = 900,
}) {
  const res = await sqs.send(
    new ReceiveMessageCommand({
      QueueUrl: QUEUE_URL,
      MaxNumberOfMessages: maxNumberOfMessages,
      WaitTimeSeconds: waitTimeSeconds,
      VisibilityTimeout: visibilityTimeout,
    })
  );
  return res.Messages || [];
}

async function deleteJob(receiptHandle) {
  await sqs.send(
    new DeleteMessageCommand({
      QueueUrl: QUEUE_URL,
      ReceiptHandle: receiptHandle,
    })
  );
}

module.exports = { enqueueTranscodeJob, receiveJobs, deleteJob };
