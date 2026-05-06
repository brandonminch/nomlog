import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { RecipeSourceService } from '../services/recipeSourceService';
import { RecipeInteractionRepository } from '../services/recipeRepository';
import { RecipeInteractionTypeSchema } from '../types/recipe';
import posthog from '../config/posthog';
import { singleRouteParam } from '../utils/singleRouteParam';

const router = Router();
const recipeSourceService = new RecipeSourceService();
const interactionRepo = new RecipeInteractionRepository();

router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = singleRouteParam(req.params.id);
    if (!id) {
      res.status(400).json({ error: 'Missing recipe id' });
      return;
    }

    const recipe = await recipeSourceService.getRecipeById(id);
    if (!recipe) {
      res.status(404).json({ error: 'Recipe not found' });
      return;
    }

    res.json({ recipe });
  } catch (error) {
    console.error('Failed to fetch recipe detail:', error);
    res.status(500).json({
      error: 'Failed to fetch recipe detail',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================
// Recipe Interactions
// ============================================================

/** Record an interaction (view, save, cook, rate, skip). */
router.post('/:id/interactions', requireAuth, async (req: Request, res: Response) => {
  try {
    const recipeId = singleRouteParam(req.params.id);
    const userId = (req as any).userId as string;

    const parsed = RecipeInteractionTypeSchema.safeParse(req.body.interactionType);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid or missing interactionType' });
      return;
    }

    if (!recipeId) {
      res.status(400).json({ error: 'Missing recipe id' });
      return;
    }

    const rating = parsed.data === 'rated' ? req.body.rating : undefined;
    if (parsed.data === 'rated' && (typeof rating !== 'number' || rating < 1 || rating > 5)) {
      res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
      return;
    }

    const interaction = await interactionRepo.record({
      userId,
      recipeId,
      interactionType: parsed.data,
      rating,
      notes: req.body.notes ?? null,
    });

    if (req.user?.id) {
      posthog.capture({
        distinctId: req.user.id,
        event: 'recipe interaction recorded',
        properties: {
          recipe_id: recipeId,
          interaction_type: parsed.data,
          rating: rating ?? null,
        },
      });
    }

    res.status(201).json({ interaction });
  } catch (error) {
    console.error('Failed to record recipe interaction:', error);
    posthog.captureException(error, req.user?.id);
    res.status(500).json({
      error: 'Failed to record interaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/** Remove a specific interaction type (e.g. unsave). */
router.delete('/:id/interactions/:interactionType', requireAuth, async (req: Request, res: Response) => {
  try {
    const recipeId = singleRouteParam(req.params.id);
    const interactionType = singleRouteParam(req.params.interactionType);
    const userId = (req as any).userId as string;

    if (!recipeId || !interactionType) {
      res.status(400).json({ error: 'Missing recipe id or interactionType' });
      return;
    }

    const parsed = RecipeInteractionTypeSchema.safeParse(interactionType);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid interactionType' });
      return;
    }

    await interactionRepo.removeInteraction(userId, recipeId, parsed.data);
    res.status(204).send();
  } catch (error) {
    console.error('Failed to remove recipe interaction:', error);
    res.status(500).json({
      error: 'Failed to remove interaction',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/** Get a user's interactions with a specific recipe. */
router.get('/:id/interactions', requireAuth, async (req: Request, res: Response) => {
  try {
    const recipeId = singleRouteParam(req.params.id);
    const userId = (req as any).userId as string;

    if (!recipeId) {
      res.status(400).json({ error: 'Missing recipe id' });
      return;
    }

    const interactions = await interactionRepo.getUserInteractions(userId, recipeId);
    res.json({ interactions });
  } catch (error) {
    console.error('Failed to fetch recipe interactions:', error);
    res.status(500).json({
      error: 'Failed to fetch interactions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/** Get aggregate stats for a recipe (view count, avg rating, etc.). */
router.get('/:id/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const recipeId = singleRouteParam(req.params.id);
    if (!recipeId) {
      res.status(400).json({ error: 'Missing recipe id' });
      return;
    }
    const stats = await interactionRepo.getRecipeAggregates(recipeId);
    res.json({ stats });
  } catch (error) {
    console.error('Failed to fetch recipe stats:', error);
    res.status(500).json({
      error: 'Failed to fetch recipe stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
