const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const region = process.env.AWS_REGION;
const BUCKET = process.env.S3_BUCKET;

if (!region || !BUCKET) {
  throw new Error(
    "AWS_REGION and S3_BUCKET must be set in environment variables"
  );
}

const s3 = new S3Client({ region });

async function uploadBufferToS3(
  key,
  buffer,
  contentType = "application/octet-stream"
) {
  try {
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      },
    });

    await upload.done();
    console.log(`Uploaded to S3: s3://${BUCKET}/${key}`);
    return `s3://${BUCKET}/${key}`;
  } catch (err) {
    console.error(` S3 upload failed for ${key}:`, err);
    throw err;
  }
}

async function getDownloadUrl(key, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const url = await getSignedUrl(s3, command, { expiresIn });
    console.log(` Generated pre-signed URL for ${key}`);
    return url;
  } catch (err) {
    console.error(`Failed to generate pre-signed URL for ${key}:`, err);
    throw err;
  }
}

module.exports = { uploadBufferToS3, getDownloadUrl, BUCKET, s3 };
