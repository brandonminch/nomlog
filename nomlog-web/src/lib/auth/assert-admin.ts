import { redirect } from "next/navigation"

import { checkUserIsAdmin } from "@/lib/auth/admin-guards"
import { createClient } from "@/lib/supabase/server"

export async function assertAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect("/login")
  }

  if (!(await checkUserIsAdmin(supabase, user.id))) {
    redirect("/unauthorized")
  }

  return { supabase, user }
}
