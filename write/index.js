const express = require("express");
const uploadNewRouter = require("./routes/upload-new");
const uploadOldRouter = require("./routes/upload-old");

const app = express();
const PORT = 3000;

// Middlewares
app.use(express.json());
app.use("/upload-new", uploadNewRouter);
app.use("/upload-old", uploadOldRouter);

// Routes
app.get("/health", (req, res) => res.sendStatus(200));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
