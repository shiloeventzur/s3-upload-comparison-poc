const express = require("express");
const router = express.Router();
const uploadController = require("../controllers/uploadFile");

router.post("/initialize", uploadController.initialize);
router.post("/get-urls", uploadController.getUrls);
router.post("/complete", uploadController.complete);
router.post("/abort", uploadController.abort);

module.exports = router;
