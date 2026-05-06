"use client"

import { Clock, ExternalLink } from "lucide-react"

import type { RecipeFormState } from "@/lib/recipes/types"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"

type IngredientLine = { text?: string }
type InstructionLine = { text?: string; title?: string; position?: number }

function tryParse<T>(raw: string): { ok: true; value: T } | { ok: false; error: string } {
  try {
    const v = JSON.parse(raw) as T
    return { ok: true, value: v }
  } catch {
    return { ok: false, error: "Invalid JSON" }
  }
}

/**
 * Read-only preview styled like nomlog-app RecipeDetailScreen (typography, chips, sections).
 */
export function RecipeAppPreview({ form }: { form: RecipeFormState }) {
  const ingredientsResult = tryParse<unknown[]>(form.ingredientsJson)
  const instructionsResult = tryParse<unknown[]>(form.instructionsJson)
  const nutritionResult = tryParse<Record<string, number | undefined> | null>(
    form.nutritionJson.trim() || "null"
  )

  const jsonErrors: string[] = []
  if (!ingredientsResult.ok) jsonErrors.push("ingredients")
  if (!instructionsResult.ok) jsonErrors.push("instructions")
  if (!nutritionResult.ok) jsonErrors.push("nutrition")

  const ingredients = ingredientsResult.ok ? ingredientsResult.value : []
  const instructions = instructionsResult.ok ? instructionsResult.value : []
  const nutrition = nutritionResult.ok ? nutritionResult.value : null

  const totalTime = form.totalTimeMinutes.trim()
    ? Number.parseInt(form.totalTimeMinutes, 10)
    : null

  return (
    <div className="bg-card text-card-foreground border-border rounded-xl border p-4 shadow-sm">
      <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
        App preview
      </p>
      {jsonErrors.length > 0 ? (
        <p className="text-destructive mb-3 text-sm">
          Fix JSON for: {jsonErrors.join(", ")} to update the preview.
        </p>
      ) : null}

      <h2 className="text-[22px] leading-tight font-bold text-gray-900 dark:text-gray-50">
        {form.title.trim() || "Untitled recipe"}
      </h2>
      <p className="mt-1 text-[13px] text-gray-500">
        From {form.sourceName.trim() || "—"}
      </p>

      {form.summary.trim() ? (
        <p className="mt-3 text-[15px] leading-[22px] text-gray-700 dark:text-gray-300">
          {form.summary}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {form.yieldText.trim() ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1.5 text-[13px] text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            {form.yieldText}
          </span>
        ) : null}
        {totalTime != null && !Number.isNaN(totalTime) ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1.5 text-[13px] text-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <Clock className="size-3.5 text-gray-500" strokeWidth={2} />
            {totalTime} min
          </span>
        ) : null}
      </div>

      {nutrition && typeof nutrition === "object" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {nutrition.calories != null ? (
            <span className="rounded-full bg-violet-50 px-2.5 py-1.5 text-[13px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-200">
              {Math.round(Number(nutrition.calories))} cal
            </span>
          ) : null}
          {nutrition.protein != null ? (
            <span className="rounded-full bg-violet-50 px-2.5 py-1.5 text-[13px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-200">
              {Math.round(Number(nutrition.protein))}g protein
            </span>
          ) : null}
          {nutrition.carbohydrates != null ? (
            <span className="rounded-full bg-violet-50 px-2.5 py-1.5 text-[13px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-200">
              {Math.round(Number(nutrition.carbohydrates))}g carbs
            </span>
          ) : null}
          {nutrition.fat != null ? (
            <span className="rounded-full bg-violet-50 px-2.5 py-1.5 text-[13px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-200">
              {Math.round(Number(nutrition.fat))}g fat
            </span>
          ) : null}
        </div>
      ) : null}

      {Array.isArray(ingredients) && ingredients.length > 0 ? (
        <div className="mt-4 space-y-2 rounded-[14px] border border-gray-100 p-3 dark:border-gray-800">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-50">
            Ingredients
          </p>
          {ingredients.map((ing, idx) => {
            const line = ing as IngredientLine
            const text = line?.text ?? (typeof ing === "string" ? ing : JSON.stringify(ing))
            return (
              <p key={idx} className="text-sm leading-5 text-gray-700 dark:text-gray-300">
                <span className="mr-1">•</span>
                {text}
              </p>
            )
          })}
        </div>
      ) : null}

      {Array.isArray(instructions) && instructions.length > 0 ? (
        <div className="mt-4 space-y-3 rounded-[14px] border border-gray-100 p-3 dark:border-gray-800">
          <p className="text-sm font-bold text-gray-900 dark:text-gray-50">
            Instructions
          </p>
          {instructions.map((step, idx) => {
            const s = step as InstructionLine
            const text = s?.text ?? ""
            return (
              <div key={idx} className="flex gap-2">
                <span className="mt-0.5 text-sm font-semibold text-gray-500">
                  {idx + 1}.
                </span>
                <p className="flex-1 text-sm leading-5 text-gray-700 dark:text-gray-300">
                  {text}
                </p>
              </div>
            )
          })}
        </div>
      ) : null}

      {form.sourceKey.trim() && form.sourceKey.trim() !== "internal" && form.canonicalUrl.trim() ? (
        <a
          href={form.canonicalUrl.trim()}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            buttonVariants({ variant: "outline" }),
            "mt-4 inline-flex w-full items-center justify-center gap-2 border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-200"
          )}
        >
          <ExternalLink className="size-4" strokeWidth={2} />
          Open source website
        </a>
      ) : null}
    </div>
  )
}
