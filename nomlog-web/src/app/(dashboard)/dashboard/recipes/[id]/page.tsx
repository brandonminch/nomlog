import { notFound } from "next/navigation"

import { RecipeAdminEditor } from "@/components/recipes/recipe-admin-editor"
import type { RecipeDbRow } from "@/lib/recipes/types"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function RecipeEditPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data, error } = await supabase.from("recipes").select("*").eq("id", id).single()

  if (error || !data) {
    notFound()
  }

  return (
    <RecipeAdminEditor recipeId={id} initialRow={data as RecipeDbRow} />
  )
}
