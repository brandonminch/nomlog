import type { SupabaseClient } from "@supabase/supabase-js"

/** RLS on `admin_users` allows each user to read only their own row. */
export async function checkUserIsAdmin(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("admin_users check failed:", error.message)
    return false
  }

  return data != null
}
