const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuid } = require('uuid');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, '..', '..', 'data', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];
const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${uuid()}${ext}`;
    cb(null, name);
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${ext} not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// POST /api/upload - Upload a file
router.post('/', authMiddleware, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 16MB.' });
        }
        return res.status(400).json({ error: err.message });
      }
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({
        url: fileUrl,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Failed to upload file' });
    }
  });
});

// DELETE /api/upload/:filename - Delete an uploaded file
router.delete('/:filename', authMiddleware, (req, res) => {
  try {
    const filePath = path.join(UPLOADS_DIR, req.params.filename);
    // Prevent directory traversal
    if (!filePath.startsWith(UPLOADS_DIR)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: 'Failed to delete file' });
  }
});

module.exports = router;
