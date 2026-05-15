import express from "express";
import upload from "../config/cloudinary.js";
import validate_auth from "../middlwares/auth.middlware.js"

const router = express.Router();

// 'image' is the name of the field in the multipart/form-data request
router.post("/", validate_auth, upload.single("image"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided." });
    }

    // req.file contains the Cloudinary URL and Public ID
    res.status(200).json({
      imageUrl: req.file.path,
      publicId: req.file.filename,
    });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ message: "Failed to upload image." });
  }
});

// Optional: Add Multer error handling (e.g., File too large)
router.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ message: "File exceeds the 5MB limit." });
  }
  next(err);
});

export default router;

