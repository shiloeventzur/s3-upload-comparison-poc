const {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

class S3UploadService {
  constructor(s3Client, bucket) {
    this.s3 = s3Client;
    this.bucket = bucket;
  }

  async createMultipartUpload(key) {
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
    });
    const result = await this.s3.send(command);
    return result.UploadId;
  }

  async getPresignedUrlForPart(key, uploadId, partNumber) {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const signedUrl = await getSignedUrl(this.s3, command, { expiresIn: 3600 });
    return signedUrl;
  }

  async completeMultipartUpload(key, uploadId, parts) {
    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    });
    const result = await this.s3.send(command);
    return result;
  }

  async abortMultipartUpload(key, uploadId) {
    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
    });
    await this.s3.send(command);
  }
}

module.exports = S3UploadService;