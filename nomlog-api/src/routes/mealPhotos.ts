import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import posthog from '../config/posthog';

const router = Router();
const MEAL_PHOTO_BUCKET = process.env.MEAL_PHOTO_BUCKET || 'meal-photos';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 1 },
});

const uploadSingle = upload.single('photo');

function extFromMime(mime: string | undefined): string {
  if (!mime) return 'jpg';
  const m = mime.toLowerCase();
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  return 'jpg';
}

function multerMiddleware(req: Request, res: Response, next: NextFunction): void {
  uploadSingle(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'Photo too large (max 12MB)' });
        return;
      }
      res.status(400).json({ error: err.message });
      return;
    }
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Invalid upload' });
      return;
    }
    next();
  });
}

/** Proxies meal photo bytes to Supabase Storage (server has reliable egress; RN → Supabase upload often fails with "Network request failed"). */
router.post('/', requireAuth, multerMiddleware, async (req: Request, res: Response) => {
  try {
    const file = req.file;
    if (!file?.buffer) {
      res.status(400).json({ error: 'Missing photo file' });
      return;
    }

    const userId = req.user!.id;
    const ext = extFromMime(file.mimetype);
    const contentType = file.mimetype || 'image/jpeg';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const { error } = await supabaseAdmin.storage.from(MEAL_PHOTO_BUCKET).upload(path, file.buffer, {
      cacheControl: '3600',
      contentType,
      upsert: false,
    });

    if (error) {
      console.error('[mealPhotos] storage upload failed:', error.message);
      res.status(400).json({ error: error.message || 'Storage upload failed' });
      return;
    }

    posthog.capture({
      distinctId: userId,
      event: 'meal photo uploaded',
      properties: {
        content_type: contentType,
        file_size_bytes: file.size,
      },
    });

    res.json({ path });
  } catch (e) {
    console.error('[mealPhotos] unexpected error:', e);
    posthog.captureException(e, req.user?.id);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

export default router;
