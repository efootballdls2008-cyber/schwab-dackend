/**
 * KYC Routes
 *
 * POST   /kyc                    — user submits KYC (multipart/form-data)
 * GET    /kyc/me                 — user fetches their own submission
 * GET    /kyc                    — admin: list all submissions (optional ?status=pending)
 * GET    /kyc/:id                — admin: single submission
 * PATCH  /kyc/:id                — admin: approve or reject
 * DELETE /kyc/:id                — admin: delete a submission
 */
const express  = require('express');
const { body, param, query } = require('express-validator');
const path     = require('path');
const pool     = require('../db/pool');
const validate = require('../middleware/validate');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { kycUpload } = require('../middleware/upload');
const createUserNotification  = require('../utils/createUserNotification');
const createAdminNotification = require('../utils/createAdminNotification');

const router = express.Router();
router.use(authenticate);

// ── Helper: camelCase a KYC row ───────────────────────────────
function toCamel(row) {
  if (!row) return null;
  return {
    id:              row.id,
    userId:          row.user_id,
    status:          row.status,
    fullName:        row.full_name,
    dateOfBirth:     row.date_of_birth,
    country:         row.country,
    idType:          row.id_type,
    idNumber:        row.id_number,
    frontImage:      row.front_image,
    backImage:       row.back_image   || null,
    selfieImage:     row.selfie_image,
    rejectionReason: row.rejection_reason || null,
    reviewedBy:      row.reviewed_by  || null,
    reviewedAt:      row.reviewed_at  || null,
    submittedAt:     row.submitted_at,
    updatedAt:       row.updated_at,
  };
}

// ── Helper: build public URL from file path ───────────────────
function toUrl(filePath) {
  if (!filePath) return null;
  // Convert absolute disk path → relative URL served by /uploads
  const rel = filePath.replace(/\\/g, '/');
  const idx = rel.indexOf('/uploads/');
  return idx !== -1 ? rel.slice(idx) : `/${rel}`;
}

function rowToResponse(row) {
  const obj = toCamel(row);
  if (!obj) return null;
  obj.frontImage  = toUrl(obj.frontImage);
  obj.backImage   = toUrl(obj.backImage);
  obj.selfieImage = toUrl(obj.selfieImage);
  return obj;
}

// ── POST /kyc  — user submits KYC ────────────────────────────
router.post(
  '/',
  kycUpload.fields([
    { name: 'frontImage',  maxCount: 1 },
    { name: 'backImage',   maxCount: 1 },
    { name: 'selfieImage', maxCount: 1 },
  ]),
  [
    body('fullName').trim().notEmpty().withMessage('Full name required'),
    body('dateOfBirth').isDate().withMessage('Valid date of birth required'),
    body('country').trim().notEmpty().withMessage('Country required'),
    body('idType')
      .isIn(['passport', 'drivers_license', 'national_id'])
      .withMessage('ID type must be passport, drivers_license, or national_id'),
    body('idNumber').trim().notEmpty().withMessage('ID number required'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { fullName, dateOfBirth, country, idType, idNumber } = req.body;

      const files = req.files || {};
      const frontFile  = files.frontImage?.[0];
      const backFile   = files.backImage?.[0];
      const selfieFile = files.selfieImage?.[0];

      if (!frontFile)  return res.status(422).json({ success: false, message: 'Front image of ID is required' });
      if (!selfieFile) return res.status(422).json({ success: false, message: 'Selfie image is required' });

      // Passport only needs front; driver's license and national ID need back too
      if (idType !== 'passport' && !backFile) {
        return res.status(422).json({ success: false, message: 'Back image of ID is required for this document type' });
      }

      // Check for existing pending/approved submission
      const [[existing]] = await pool.query(
        'SELECT id, status FROM kyc_submissions WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1',
        [userId]
      );
      if (existing && existing.status === 'approved') {
        return res.status(409).json({ success: false, message: 'Your KYC is already approved' });
      }
      if (existing && existing.status === 'pending') {
        return res.status(409).json({ success: false, message: 'You already have a pending KYC submission' });
      }

      const [result] = await pool.query(
        `INSERT INTO kyc_submissions
           (user_id, full_name, date_of_birth, country, id_type, id_number,
            front_image, back_image, selfie_image)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          userId, fullName, dateOfBirth, country, idType, idNumber,
          frontFile.path,
          backFile ? backFile.path : null,
          selfieFile.path,
        ]
      );

      const [[row]] = await pool.query('SELECT * FROM kyc_submissions WHERE id = ?', [result.insertId]);

      // Notify user
      createUserNotification({
        userId,
        title: 'KYC Submitted',
        message: 'Your identity verification documents have been submitted and are under review.',
        type: 'security',
        relatedId: result.insertId,
        relatedType: 'kyc',
      });

      // Notify admin
      const [[user]] = await pool.query('SELECT first_name, last_name FROM users WHERE id = ?', [userId]);
      const userName = user ? `${user.first_name} ${user.last_name}` : `User #${userId}`;
      createAdminNotification({
        title: 'New KYC Submission',
        message: `${userName} submitted KYC documents (${idType.replace('_', ' ')}).`,
        type: 'user',
        relatedId: result.insertId,
        relatedType: 'kyc',
      });

      res.status(201).json({ success: true, data: rowToResponse(row) });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /kyc/me  — user fetches their own latest submission ──
router.get('/me', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(
      'SELECT * FROM kyc_submissions WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1',
      [req.user.id]
    );
    res.json({ success: true, data: row ? rowToResponse(row) : null });
  } catch (err) {
    next(err);
  }
});

// ── GET /kyc  — admin: list all submissions ───────────────────
router.get(
  '/',
  requireAdmin,
  async (req, res, next) => {
    try {
      const { status, userId } = req.query;
      let sql = `
        SELECT k.*, u.first_name, u.last_name, u.email
        FROM kyc_submissions k
        JOIN users u ON u.id = k.user_id
      `;
      const params = [];
      const where = [];
      if (status) { where.push('k.status = ?'); params.push(status); }
      if (userId) { where.push('k.user_id = ?'); params.push(parseInt(userId)); }
      if (where.length) sql += ' WHERE ' + where.join(' AND ');
      sql += ' ORDER BY k.submitted_at DESC';

      const [rows] = await pool.query(sql, params);
      const data = rows.map(row => ({
        ...rowToResponse(row),
        userFirstName: row.first_name,
        userLastName:  row.last_name,
        userEmail:     row.email,
      }));
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

// ── GET /kyc/:id  — admin: single submission ──────────────────
router.get(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [[row]] = await pool.query(
        `SELECT k.*, u.first_name, u.last_name, u.email
         FROM kyc_submissions k
         JOIN users u ON u.id = k.user_id
         WHERE k.id = ?`,
        [req.params.id]
      );
      if (!row) return res.status(404).json({ success: false, message: 'KYC submission not found' });
      res.json({
        success: true,
        data: {
          ...rowToResponse(row),
          userFirstName: row.first_name,
          userLastName:  row.last_name,
          userEmail:     row.email,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ── PATCH /kyc/:id  — admin: approve or reject ────────────────
router.patch(
  '/:id',
  requireAdmin,
  [
    param('id').isInt({ min: 1 }),
    body('status').isIn(['approved', 'rejected']).withMessage('Status must be approved or rejected'),
    body('rejectionReason').optional().trim(),
  ],
  validate,
  async (req, res, next) => {
    try {
      const [[submission]] = await pool.query('SELECT * FROM kyc_submissions WHERE id = ?', [req.params.id]);
      if (!submission) return res.status(404).json({ success: false, message: 'KYC submission not found' });

      const { status, rejectionReason } = req.body;
      const now = new Date();

      await pool.query(
        `UPDATE kyc_submissions
         SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = ?
         WHERE id = ?`,
        [status, rejectionReason || null, req.user.id, now, req.params.id]
      );

      // Update user's kyc_verified flag
      if (status === 'approved') {
        await pool.query('UPDATE users SET kyc_verified = 1 WHERE id = ?', [submission.user_id]);
      } else if (status === 'rejected') {
        await pool.query('UPDATE users SET kyc_verified = 0 WHERE id = ?', [submission.user_id]);
      }

      const [[updated]] = await pool.query('SELECT * FROM kyc_submissions WHERE id = ?', [req.params.id]);

      // Notify user
      if (status === 'approved') {
        createUserNotification({
          userId: submission.user_id,
          title: 'KYC Approved ✓',
          message: 'Your identity has been verified. You now have full access to all platform features.',
          type: 'security',
          relatedId: req.params.id,
          relatedType: 'kyc',
        });
      } else {
        createUserNotification({
          userId: submission.user_id,
          title: 'KYC Rejected',
          message: rejectionReason
            ? `Your KYC was rejected. Reason: ${rejectionReason}. Please resubmit with correct documents.`
            : 'Your KYC was rejected. Please resubmit with correct documents.',
          type: 'security',
          relatedId: req.params.id,
          relatedType: 'kyc',
        });
      }

      res.json({ success: true, data: rowToResponse(updated) });
    } catch (err) {
      next(err);
    }
  }
);

// ── DELETE /kyc/:id  — admin: delete submission ───────────────
router.delete(
  '/:id',
  requireAdmin,
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res, next) => {
    try {
      const [result] = await pool.query('DELETE FROM kyc_submissions WHERE id = ?', [req.params.id]);
      if (result.affectedRows === 0) return res.status(404).json({ success: false, message: 'KYC submission not found' });
      res.json({ success: true, message: 'KYC submission deleted' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
