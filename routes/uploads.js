const express = require('express');
const multer = require('multer');
const streamifier = require('streamifier');
const logger = require('../config/logger');
const authenticateToken = require('../middleware/auth');
const cloudinary = require('../config/cloudinary');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

function uploadBufferToCloudinary(buffer, { resourceType = 'auto', folder } = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      resource_type: resourceType
    };
    if (folder) options.folder = folder;

    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });

    streamifier.createReadStream(buffer).pipe(stream);
  });
}

// POST /api/uploads/cloudinary
// form-data: file=<File>, optional: folder=<string>
router.post('/cloudinary', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file || !file.buffer || file.size === 0) {
      return res.status(400).json({ error: 'invalid_file', message: 'Missing file' });
    }

    const requestedFolder = typeof req.body?.folder === 'string' ? req.body.folder.trim() : '';
    const folder = requestedFolder || 'adscape';

    const result = await uploadBufferToCloudinary(file.buffer, {
      resourceType: 'auto',
      folder
    });

    return res.json({
      url: result.secure_url,
      resourceType: result.resource_type,
      publicId: result.public_id,
      bytes: result.bytes,
      format: result.format,
      originalFilename: file.originalname
    });
  } catch (error) {
    logger.error('[uploads/cloudinary] upload failed:', error);
    return res.status(500).json({
      error: 'cloudinary_upload_failed',
      message: error.message
    });
  }
});

module.exports = router;

