# S3 Upload Comparison POC

This project demonstrates and benchmarks **two upload architectures** to AWS S3:

1. **Old server-handled upload** – Files are streamed through the backend before reaching S3
2. **New direct-to-S3 upload** – Files are uploaded directly to S3 using presigned URLs and multipart uploads

The goal is to **compare performance, resource usage, and scalability** for large file uploads (30GB–100GB).

---

## 🧱 Architecture Overview

### 🔴 Old Architecture (Server-Handled)

```
Client → Nginx → Write → S3
```

#### Flow

1. Client sends `POST /write/upload-old/prepare` with a list of files

2. **Write service**:

   * Generates a `layerId` (represents an upload session)
   * For each file:

     * Creates S3 `MultipartUpload`
     * Generates `uploadId`
   * Stores metadata in **Redis** with uploading user. (keyed by layerId)
   * Returns `layerId` and file metadata to client

3. Client uploads chunks:

   * `POST /write/upload-old/:layerId/:fileId`
   * Headers:

     * `chunkIndex`
   * Body:

     * binary chunk (chunk size determined by client)

4. **Write service**:

   * Uploads chunk to S3
   * Stores returned `ETag` in Redis

5. Once all chunks are received:

   * Write service calls **CompleteMultipartUpload** in S3

---

### 🟢 New Architecture (Direct-to-S3 with Presigned URLs)

```
Client → S3
   ↑
Write (presigned URLs + orchestration)
```

#### Flow

1. Client sends `POST /write/upload-new/prepare` with:

   * files list
   * file sizes

2. **Write service**:

   * Generates `layerId`
   * For each file:

     * Creates S3 `MultipartUpload`
     * Generates `uploadId`
     * Calculates number of chunks
   * Stores metadata in **Redis**
   * Returns:

     * `layerId`
     * per-file `uploadId`
     * chunk count

3. Client uploads directly to S3:

   * Requests presigned URLs from backend
   * Uploads chunks in parallel to S3

4. Client collects `ETags` from S3 responses

5. Client sends:

   * `POST /write/upload-new/complete`
   * Includes all `ETags`

6. **Write service**:

   * Calls **CompleteMultipartUpload**

---

## 🔌 API Design

> All endpoints are handled by the **Write service**

---

## 🔴 Old Flow API

### `POST /write/upload-old/prepare`

Initialize upload session

**Request:**

```json
{
  "files": [
    { "fileName": "video.mp4", "size": 104857600 }
  ]
}
```

**Response:**

```json
{
  "layerId": "layer-123",
  "files": [
    {
      "fileId": "file-1",
      "uploadId": "s3-upload-id"
    }
  ]
}
```

---

### `POST /write/upload-old/:layerId/:fileId`

Upload a single chunk

**Headers:**

```
chunkIndex: number
```

**Body:**

* Binary chunk

**Response:**

```
202 Accepted
```

---

### (Internal)

* Store ETags in Redis
* Auto-complete upload when all chunks received

---

## 🟢 New Flow API

### `POST /write/upload-new/prepare`

Initialize upload session

**Request:**

```json
{
  "files": [
    { "fileName": "video.mp4", "size": 104857600 }
  ]
}
```

**Response:**

```json
{
  "layerId": "layer-123",
  "files": [
    {
      "fileId": "file-1",
      "uploadId": "s3-upload-id",
      "totalChunks": 20
    }
  ]
}
```

---

### `POST /write/upload-new/presign`

Get presigned URLs for specific parts

**Request:**

```json
{
  "layerId": "layer-123",
  "fileId": "file-1",
  "parts": [1, 2, 3]
}
```

**Response:**

```json
{
  "urls": [
    { "partNumber": 1, "url": "..." },
    { "partNumber": 2, "url": "..." }
  ]
}
```

---

### `POST /write/upload-new/complete`

Finalize multipart upload

**Request:**

```json
{
  "layerId": "layer-123",
  "fileId": "file-1",
  "parts": [
    { "PartNumber": 1, "ETag": "etag-1" },
    { "PartNumber": 2, "ETag": "etag-2" }
  ]
}
```

**Response:**

```json
{
  "status": "completed"
}
```

---

### `POST /write/upload-new/abort` (optional)

Abort multipart upload

---
