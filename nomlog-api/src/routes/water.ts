import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../config/supabase';
import posthog from '../config/posthog';

const router = Router();

// Validate date format YYYY-MM-DD
const isValidDateFormat = (date: string): boolean => {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) return false;
  
  // Check if it's a valid date
  const parsed = new Date(date);
  return !isNaN(parsed.getTime());
};

// Get water log for a specific date
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string;
    
    if (!date) {
      res.status(400).json({ error: 'Missing required query parameter: date' });
      return;
    }
    
    if (!isValidDateFormat(date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }
    
    const { data: waterLog, error } = await supabaseAdmin
      .from('water_logs')
      .select('id, date, glasses, created_at, updated_at')
      .eq('user_id', req.user!.id)
      .eq('date', date)
      .single();
    
    if (error) {
      // PGRST116 means no rows found - return null waterLog
      if (error.code === 'PGRST116') {
        res.json({ waterLog: null });
        return;
      }
      throw error;
    }
    
    res.json({ waterLog });
  } catch (error) {
    console.error('Error fetching water log:', error);
    res.status(500).json({
      error: 'Failed to fetch water log',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Create or update water log for a specific date
router.put('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const { date, glasses } = req.body;
    
    if (!date) {
      res.status(400).json({ error: 'Missing required field: date' });
      return;
    }
    
    if (!isValidDateFormat(date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }
    
    if (typeof glasses !== 'number' || glasses < 0) {
      res.status(400).json({ error: 'glasses must be a non-negative number' });
      return;
    }
    
    // Upsert: insert or update based on user_id + date unique constraint
    const { data: waterLog, error } = await supabaseAdmin
      .from('water_logs')
      .upsert(
        {
          user_id: req.user!.id,
          date,
          glasses
        },
        {
          onConflict: 'user_id,date'
        }
      )
      .select('id, date, glasses, created_at, updated_at')
      .single();
    
    if (error) {
      console.error('Database error:', error);
      throw error;
    }
    
    posthog.capture({
      distinctId: req.user!.id,
      event: 'water log updated',
      properties: {
        glasses,
        date,
      },
    });

    res.json({
      message: 'Water log updated successfully',
      waterLog
    });
  } catch (error) {
    console.error('Error updating water log:', error);
    posthog.captureException(error, req.user?.id);
    res.status(500).json({
      error: 'Failed to update water log',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
