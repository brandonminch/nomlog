"use server"

import { assertAdmin } from "@/lib/auth/assert-admin"
import { formStateToUpdatePayload } from "@/lib/recipes/map-to-db"
import type { RecipeFormState } from "@/lib/recipes/types"
import { createClient } from "@/lib/supabase/server"

export async function saveRecipe(id: string, form: RecipeFormState) {
  try {
    await assertAdmin()
    const payload = formStateToUpdatePayload(form)
    const supabase = await createClient()
    const { error } = await supabase.from("recipes").update(payload).eq("id", id)
    if (error) {
      return { ok: false as const, message: error.message }
    }
    return { ok: true as const }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Save failed"
    return { ok: false as const, message }
  }
}
