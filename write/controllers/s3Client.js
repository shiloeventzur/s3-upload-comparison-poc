const {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} = require("@aws-sdk/client-s3");

const BUCKET_NAME = "uploads";

const s3 = new S3Client({
  endpoint: "http://s3:9000",
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: "minioadmin",
    secretAccessKey: "minioadmin",
  },
});

async function ensureBucket(retries = 10, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
      console.log(`Bucket "${BUCKET_NAME}" already exists.`);
      return;
    } catch (err) {
      // Bucket doesn't exist — try to create it
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) {
        await s3.send(new CreateBucketCommand({ Bucket: BUCKET_NAME }));
        console.log(`Bucket "${BUCKET_NAME}" created.`);
        return;
      }
      // S3 not ready yet — wait and retry
      console.log(
        `Waiting for MinIO... (attempt ${i + 1}/${retries})`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Could not connect to MinIO after retries");
}

module.exports = { s3, BUCKET_NAME, ensureBucket };
