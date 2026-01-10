const multer = require("multer");
const path = require("path");
const fs = require("fs");

function createUploader({ destFolder, maxSizeMB, allowedFileTypes }) {
  // Ensure folder exists
  if (!fs.existsSync(destFolder)) {
    fs.mkdirSync(destFolder, { recursive: true });
  }

  // Storage config
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, destFolder);
    },
    filename: (req, file, cb) => {
      const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueName + path.extname(file.originalname));
    },
  });

  // File filter
  const fileFilter = (req, file, cb) => {
    if (allowedFileTypes.includes(file.mimetype.split("/")[1])) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"), false);
    }
  };

  return multer({
    storage,
    limits: { fileSize: maxSizeMB * 1024 * 1024 },
    fileFilter,
  });
}

module.exports = createUploader;
