"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { saveRecipe } from "@/app/(dashboard)/dashboard/recipes/actions"
import { recipeRowToFormState } from "@/lib/recipes/map-from-db"
import type { RecipeDbRow, RecipeFormState } from "@/lib/recipes/types"
import { buttonVariants } from "@/lib/button-variants"
import { cn } from "@/lib/utils"
import { RecipeAppPreview } from "@/components/recipes/recipe-app-preview"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"

function Field({
  label,
  id,
  value,
  onChange,
  className,
  type = "text",
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  className?: string
  type?: string
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      />
    </div>
  )
}

function JsonField({
  label,
  id,
  value,
  onChange,
  rows = 10,
}: {
  label: string
  id: string
  value: string
  onChange: (v: string) => void
  rows?: number
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="font-mono text-xs"
        spellCheck={false}
      />
    </div>
  )
}

export function RecipeAdminEditor({
  recipeId,
  initialRow,
}: {
  recipeId: string
  initialRow: RecipeDbRow
}) {
  const [form, setForm] = useState<RecipeFormState>(() =>
    recipeRowToFormState(initialRow)
  )
  const [message, setMessage] = useState<{
    type: "ok" | "err"
    text: string
  } | null>(null)
  const [isPending, startTransition] = useTransition()

  function patch<K extends keyof RecipeFormState>(key: K, value: RecipeFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function submit() {
    setMessage(null)
    startTransition(async () => {
      const result = await saveRecipe(recipeId, form)
      if (result.ok) {
        setMessage({ type: "ok", text: "Saved successfully." })
      } else {
        setMessage({ type: "err", text: result.message })
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/recipes"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ArrowLeft className="mr-1 size-4" />
          All recipes
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Edit recipe
        </h1>
      </div>

      {message ? (
        <p
          role="status"
          className={
            message.type === "ok"
              ? "text-sm text-green-700 dark:text-green-400"
              : "text-destructive text-sm"
          }
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="lg:sticky lg:top-4">
          <RecipeAppPreview form={form} />
        </div>

        <ScrollArea className="h-[calc(100vh-8rem)] pr-4 lg:h-[calc(100vh-6rem)]">
          <div className="space-y-6 pb-8">
            <Card>
              <CardHeader>
                <CardTitle>Basics</CardTitle>
                <CardDescription>
                  Identifiers and copy. Changing{" "}
                  <code className="text-xs">canonical_url</code> must stay unique.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Title"
                  id="title"
                  value={form.title}
                  onChange={(v) => patch("title", v)}
                  className="sm:col-span-2"
                />
                <Field
                  label="Source key"
                  id="sourceKey"
                  value={form.sourceKey}
                  onChange={(v) => patch("sourceKey", v)}
                />
                <Field
                  label="Source name"
                  id="sourceName"
                  value={form.sourceName}
                  onChange={(v) => patch("sourceName", v)}
                />
                <Field
                  label="Canonical URL"
                  id="canonicalUrl"
                  value={form.canonicalUrl}
                  onChange={(v) => patch("canonicalUrl", v)}
                  className="sm:col-span-2"
                />
                <Field
                  label="Original URL"
                  id="originalUrl"
                  value={form.originalUrl}
                  onChange={(v) => patch("originalUrl", v)}
                  className="sm:col-span-2"
                />
                <Field
                  label="Image URL"
                  id="imageUrl"
                  value={form.imageUrl}
                  onChange={(v) => patch("imageUrl", v)}
                  className="sm:col-span-2"
                />
                <Field
                  label="Author name"
                  id="authorName"
                  value={form.authorName}
                  onChange={(v) => patch("authorName", v)}
                  className="sm:col-span-2"
                />
                <Field
                  label="Saved by user id (UUID or empty)"
                  id="savedByUserId"
                  value={form.savedByUserId}
                  onChange={(v) => patch("savedByUserId", v)}
                  className="sm:col-span-2"
                />
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="summary">Summary</Label>
                  <Textarea
                    id="summary"
                    value={form.summary}
                    onChange={(e) => patch("summary", e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Timing and yield</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Prep (minutes)"
                  id="prepTime"
                  value={form.prepTimeMinutes}
                  onChange={(v) => patch("prepTimeMinutes", v)}
                />
                <Field
                  label="Cook (minutes)"
                  id="cookTime"
                  value={form.cookTimeMinutes}
                  onChange={(v) => patch("cookTimeMinutes", v)}
                />
                <Field
                  label="Total (minutes)"
                  id="totalTime"
                  value={form.totalTimeMinutes}
                  onChange={(v) => patch("totalTimeMinutes", v)}
                />
                <Field
                  label="Yield text"
                  id="yieldText"
                  value={form.yieldText}
                  onChange={(v) => patch("yieldText", v)}
                  className="sm:col-span-3"
                />
                <Field
                  label="Servings"
                  id="servings"
                  value={form.servings}
                  onChange={(v) => patch("servings", v)}
                />
                <Field
                  label="Serving unit"
                  id="servingUnit"
                  value={form.servingUnit}
                  onChange={(v) => patch("servingUnit", v)}
                  className="sm:col-span-2"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Classification</CardTitle>
                <CardDescription>
                  Difficulty: <code className="text-xs">easy</code>,{" "}
                  <code className="text-xs">medium</code>,{" "}
                  <code className="text-xs">advanced</code>. Cost tier:{" "}
                  <code className="text-xs">budget</code>,{" "}
                  <code className="text-xs">moderate</code>,{" "}
                  <code className="text-xs">premium</code>.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <Field
                  label="Cuisine"
                  id="cuisine"
                  value={form.cuisine}
                  onChange={(v) => patch("cuisine", v)}
                />
                <Field
                  label="Difficulty"
                  id="difficulty"
                  value={form.difficulty}
                  onChange={(v) => patch("difficulty", v)}
                />
                <Field
                  label="Estimated cost tier"
                  id="estimatedCostTier"
                  value={form.estimatedCostTier}
                  onChange={(v) => patch("estimatedCostTier", v)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>JSON fields</CardTitle>
                <CardDescription>
                  Must be valid JSON arrays or object (nutrition). Same shapes as
                  the API / mobile app.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <JsonField
                  label="Ingredients"
                  id="ingredientsJson"
                  value={form.ingredientsJson}
                  onChange={(v) => patch("ingredientsJson", v)}
                  rows={12}
                />
                <Separator />
                <JsonField
                  label="Instructions"
                  id="instructionsJson"
                  value={form.instructionsJson}
                  onChange={(v) => patch("instructionsJson", v)}
                  rows={12}
                />
                <Separator />
                <JsonField
                  label="Nutrition (object or null)"
                  id="nutritionJson"
                  value={form.nutritionJson}
                  onChange={(v) => patch("nutritionJson", v)}
                  rows={8}
                />
                <Separator />
                <JsonField
                  label="Tags"
                  id="tagsJson"
                  value={form.tagsJson}
                  onChange={(v) => patch("tagsJson", v)}
                  rows={4}
                />
                <JsonField
                  label="Meal types"
                  id="mealTypesJson"
                  value={form.mealTypesJson}
                  onChange={(v) => patch("mealTypesJson", v)}
                  rows={4}
                />
                <JsonField
                  label="Ingredient names"
                  id="ingredientNamesJson"
                  value={form.ingredientNamesJson}
                  onChange={(v) => patch("ingredientNamesJson", v)}
                  rows={4}
                />
                <JsonField
                  label="Dietary flags"
                  id="dietaryFlagsJson"
                  value={form.dietaryFlagsJson}
                  onChange={(v) => patch("dietaryFlagsJson", v)}
                  rows={4}
                />
                <JsonField
                  label="Allergens"
                  id="allergensJson"
                  value={form.allergensJson}
                  onChange={(v) => patch("allergensJson", v)}
                  rows={4}
                />
                <JsonField
                  label="Categories"
                  id="categoriesJson"
                  value={form.categoriesJson}
                  onChange={(v) => patch("categoriesJson", v)}
                  rows={4}
                />
                <JsonField
                  label="Equipment needed"
                  id="equipmentNeededJson"
                  value={form.equipmentNeededJson}
                  onChange={(v) => patch("equipmentNeededJson", v)}
                  rows={4}
                />
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Link
                href="/dashboard/recipes"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Cancel
              </Link>
              <Button type="button" onClick={submit} disabled={isPending}>
                {isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
