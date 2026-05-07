/**
 * Multer upload middleware for KYC document images.
 * Files are stored in uploads/kyc/<userId>/ on disk.
 * Max file size: 5 MB. Allowed types: JPEG, PNG, WebP.
 */
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const userId = req.user?.id ?? 'unknown';
    const dir = path.join(__dirname, '../../uploads/kyc', String(userId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase() || '.jpg';
    const name = `${file.fieldname}-${Date.now()}${ext}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG and WebP images are allowed'));
  }
}

const kycUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = { kycUpload };
