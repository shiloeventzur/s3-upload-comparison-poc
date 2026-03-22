const express = require("express");
const { randomUUID } = require("crypto");
const {
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} = require("@aws-sdk/client-s3");
const { s3, BUCKET_NAME } = require("../controllers/s3Client");
const redis = require("../controllers/redisClient");

const router = express.Router();

// ─── POST /prepare ───────────────────────────────────────────
router.post("/prepare", async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: "files array is required" });
    }

    const layerId = randomUUID();
    const responseFiles = [];

    for (const file of files) {
      const fileId = randomUUID();
      const s3Key = `${layerId}/${file.fileName}`;

      // Client sends totalChunks — trust it as the source of truth
      const totalChunks = file.totalChunks;
      if (!totalChunks || totalChunks < 1) {
        return res.status(400).json({ error: "totalChunks is required per file" });
      }

      // Start S3 multipart upload
      const { UploadId: uploadId } = await s3.send(
        new CreateMultipartUploadCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
        })
      );

      // Store metadata in Redis (immutable — never updated by chunk handlers)
      await redis.set(
        `upload:${layerId}:${fileId}`,
        JSON.stringify({ uploadId, s3Key, fileName: file.fileName, totalChunks })
      );

      // Atomic counter starts at 0
      await redis.set(`chunks:${layerId}:${fileId}`, 0);

      responseFiles.push({ fileId, uploadId });
    }

    res.json({ layerId, files: responseFiles });
  } catch (err) {
    console.error("Prepare error:", err);
    res.status(500).json({ error: "Failed to prepare upload" });
  }
});

// ─── POST /:layerId/:fileId  (chunk upload) ──────────────────
router.post("/:layerId/:fileId", async (req, res) => {
  try {
    const { layerId, fileId } = req.params;
    const chunkIndex = parseInt(req.headers["chunkindex"], 10);

    if (isNaN(chunkIndex)) {
      return res.status(400).json({ error: "chunkIndex header is required" });
    }

    // Get the uploaded buffer from express-fileupload
    if (!req.files || !req.files.chunk) {
      return res.status(400).json({ error: "No chunk file in request body" });
    }
    const buffer = req.files.chunk.data;

    // Fetch upload metadata from Redis (immutable, safe to read concurrently)
    const raw = await redis.get(`upload:${layerId}:${fileId}`);
    if (!raw) {
      return res.status(404).json({ error: "Upload session not found" });
    }
    const meta = JSON.parse(raw);
    const partNumber = chunkIndex + 1;

    // Upload part to S3
    const { ETag } = await s3.send(
      new UploadPartCommand({
        Bucket: BUCKET_NAME,
        Key: meta.s3Key,
        UploadId: meta.uploadId,
        PartNumber: partNumber,
        Body: buffer,
      })
    );

    // Store ETag in Redis list
    await redis.rpush(
      `etags:${layerId}:${fileId}`,
      JSON.stringify({ PartNumber: partNumber, ETag })
    );

    // Atomic increment — returns the new value; exactly one request will see totalChunks
    const completed = await redis.incr(`chunks:${layerId}:${fileId}`);

    // ── Auto-complete when all chunks received ──
    if (completed === meta.totalChunks) {
      const etagEntries = await redis.lrange(`etags:${layerId}:${fileId}`, 0, -1);
      const parts = etagEntries
        .map((e) => JSON.parse(e))
        .sort((a, b) => a.PartNumber - b.PartNumber);

      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: BUCKET_NAME,
          Key: meta.s3Key,
          UploadId: meta.uploadId,
          MultipartUpload: { Parts: parts },
        })
      );

      // Clean up all Redis keys for this file
      await redis.del(
        `upload:${layerId}:${fileId}`,
        `etags:${layerId}:${fileId}`,
        `chunks:${layerId}:${fileId}`
      );

      console.log(`✅ Upload complete: ${meta.s3Key}`);
    }

    res.sendStatus(202);
  } catch (err) {
    console.error("Chunk upload error:", err);
    res.status(500).json({ error: "Failed to upload chunk" });
  }
});

module.exports = router;
