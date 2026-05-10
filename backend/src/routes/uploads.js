// uploads.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const cloudinary = require('cloudinary').v2;
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { body } = require('express-validator');

// ─── Image validation ────────────────────────────────────────────────
// MIME type from the client is trivially spoofable. We attempt a real image
// decode via sharp; anything that's not actually one of these formats is
// rejected before reaching Cloudinary.
const validateImageBuffer = async (buffer) => {
  try {
    const metadata = await sharp(buffer).metadata();
    const allowed = ['jpeg', 'png', 'webp', 'gif', 'avif'];
    if (!allowed.includes(metadata.format)) {
      throw new Error(`Unsupported format: ${metadata.format}`);
    }
    // Reject files that have plausible image headers but absurd dimensions
    // (decompression bombs / decoding-time DoS).
    if ((metadata.width || 0) > 10000 || (metadata.height || 0) > 10000) {
      throw new Error('Image dimensions exceed 10000px');
    }
    return metadata;
  } catch (err) {
    throw Object.assign(new Error('Invalid image file'), { status: 400 });
  }
};

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 5MB hard cap. Multer rejects above this before we even decode.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      const err = new Error('Only image and PDF files are allowed');
      err.status = 400;
      cb(err, false);
    }
  },
});

// ─── Public images: listing photos, avatars ─────────────────────────
router.post('/image', authenticate, upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await validateImageBuffer(req.file.buffer);
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'bookalocal',
          transformation: [{ width: 1200, quality: 'auto' }],
          // Tag with the user id so we can audit / clean up orphans later
          context: { user_id: req.user.id },
        },
        (error, result) => error ? reject(error) : resolve(result)
      ).end(req.file.buffer);
    });
    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch (error) { next(error); }
});

router.post('/images', authenticate, upload.array('images', 10), async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
    await Promise.all(req.files.map(f => validateImageBuffer(f.buffer)));
    const uploads = await Promise.all(req.files.map(file => new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: 'bookalocal',
          transformation: [{ width: 1200, quality: 'auto' }],
          context: { user_id: req.user.id },
        },
        (err, result) => err
          ? reject(err)
          : resolve({ url: result.secure_url, public_id: result.public_id })
      ).end(file.buffer);
    })));
    res.json({ images: uploads });
  } catch (error) { next(error); }
});

// ─── Private KYC documents ───────────────────────────────────────────
// Uploaded into a PRIVATE folder with type=authenticated. The URL returned
// to the guide is signed and expires in 24 hours. Admins request a fresh
// short-lived signed URL via /sign-private-url when reviewing.
router.post('/kyc-doc',
  authenticate,
  requireRole('guide'),
  upload.single('document'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const isPdf = req.file.mimetype === 'application/pdf';
      if (isPdf) {
        // Quick PDF magic-number check (first 5 bytes are %PDF-)
        const head = req.file.buffer.slice(0, 5).toString('ascii');
        if (head !== '%PDF-') {
          return res.status(400).json({ error: 'File is not a valid PDF' });
        }
      } else {
        await validateImageBuffer(req.file.buffer);
      }

      const result = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          {
            folder: 'bookalocal/kyc',
            type: 'authenticated', // requires signature to access
            resource_type: isPdf ? 'raw' : 'image',
            // Don't transform — admin needs the original
            context: {
              user_id: req.user.id,
              uploaded_at: new Date().toISOString(),
            },
          },
          (err, r) => err ? reject(err) : resolve(r)
        ).end(req.file.buffer);
      });

      // Issue a 24h signed URL. We store result.public_id in the DB (not the URL)
      // so we can re-sign later when the URL expires.
      const expires = Math.floor(Date.now() / 1000) + 24 * 3600;
      const signedUrl = cloudinary.url(result.public_id, {
        type: 'authenticated',
        resource_type: isPdf ? 'raw' : 'image',
        sign_url: true,
        expires_at: expires,
      });

      res.json({
        public_id: result.public_id,
        signed_url: signedUrl,
        expires_at: expires,
        resource_type: isPdf ? 'raw' : 'image',
      });
    } catch (error) { next(error); }
  }
);

// ─── Sign a fresh URL for an existing private upload ────────────────
// Used by the admin KYC review screen.
router.post('/sign-private-url',
  authenticate,
  requireRole('admin'),
  validate([
    body('public_id').isString().isLength({ min: 1, max: 255 })
      .withMessage('public_id is required'),
    body('resource_type').optional().isIn(['image', 'raw', 'video'])
      .withMessage('resource_type must be image, raw, or video'),
  ]),
  async (req, res, next) => {
    try {
      const { public_id, resource_type = 'image' } = req.body;
      // Defense in depth — only sign URLs for our KYC folder
      if (!public_id.startsWith('bookalocal/kyc/')) {
        return res.status(400).json({ error: 'Only KYC documents can be signed via this endpoint' });
      }
      // 15 minute TTL — admin should be actively reviewing
      const expires = Math.floor(Date.now() / 1000) + 15 * 60;
      const url = cloudinary.url(public_id, {
        type: 'authenticated',
        resource_type,
        sign_url: true,
        expires_at: expires,
      });
      res.json({ signed_url: url, expires_at: expires });
    } catch (error) { next(error); }
  }
);

module.exports = router;
