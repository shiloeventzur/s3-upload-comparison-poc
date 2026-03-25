const { v4: uuidv4 } = require('uuid');
const redis = require('./redisClient');
const { s3, BUCKET_NAME } = require('./s3Client');
const S3UploadService = require('../services/s3Class');

const s3Service = new S3UploadService(s3, BUCKET_NAME);

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

async function initialize(req, res) {
  try {
    const { files } = req.body; // [{ fileName: string, size: number }]
    const layerId = uuidv4();
    const resultFiles = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileId = `file-${i + 1}`;
      const key = `${layerId}/${file.fileName}`;
      const uploadId = await s3Service.createMultipartUpload(key);
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

      // Store metadata in Redis
      await redis.set(`${layerId}:${fileId}`, JSON.stringify({
        uploadId,
        key,
        totalChunks,
        fileName: file.fileName,
        size: file.size,
      }));

      resultFiles.push({
        fileId,
        uploadId,
        totalChunks,
      });
    }

    res.json({ layerId, files: resultFiles });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to initialize upload' });
  }
}

async function getUrls(req, res) {
  try {
    const { layerId, fileId, parts } = req.body; // parts: [number]
    const metadataStr = await redis.get(`${layerId}:${fileId}`);
    if (!metadataStr) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    const metadata = JSON.parse(metadataStr);
    const urls = [];

    for (const partNumber of parts) {
      const url = await s3Service.getPresignedUrlForPart(metadata.key, metadata.uploadId, partNumber);
      urls.push({ partNumber, url });
    }

    res.json({ urls });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to get presigned URLs' });
  }
}

async function complete(req, res) {
  try {
    const { layerId, fileId, parts } = req.body; // parts: [{ PartNumber: number, ETag: string }]
    const metadataStr = await redis.get(`${layerId}:${fileId}`);
    if (!metadataStr) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    const metadata = JSON.parse(metadataStr);

    await s3Service.completeMultipartUpload(metadata.key, metadata.uploadId, parts);
    await redis.del(`${layerId}:${fileId}`);

    res.json({ status: 'completed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to complete upload' });
  }
}

async function abort(req, res) {
  try {
    const { layerId, fileId } = req.body;
    const metadataStr = await redis.get(`${layerId}:${fileId}`);
    if (!metadataStr) {
      return res.status(404).json({ error: 'Upload session not found' });
    }
    const metadata = JSON.parse(metadataStr);

    await s3Service.abortMultipartUpload(metadata.key, metadata.uploadId);
    await redis.del(`${layerId}:${fileId}`);

    res.json({ status: 'aborted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to abort upload' });
  }
}

module.exports = {
  initialize,
  getUrls,
  complete,
  abort,
};