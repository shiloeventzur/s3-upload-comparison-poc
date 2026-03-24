const express = require("express");
const fileUpload = require("express-fileupload");
const uploadNewRouter = require("./routes/upload-new");
const uploadOldRouter = require("./routes/upload-old");
const { ensureBucket } = require("./controllers/s3Client");

const app = express();
const PORT = 3000;

// Middlewares
app.use(express.json());
app.use(
  fileUpload({
    useTempFiles: false,   // keep chunks as in-memory buffers — no disk caching
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max per chunk request
  })
);

app.use("/upload-new", uploadNewRouter);
app.use("/upload-old", uploadOldRouter);

// Routes
app.get("/health", (req, res) => res.sendStatus(200));

// Start
(async () => {
  await ensureBucket();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
})();
