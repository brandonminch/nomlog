"use client"

import { useRouter } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"

type SignOutButtonProps = {
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link"
  className?: string
  children?: React.ReactNode
}

export function SignOutButton({
  variant = "outline",
  className,
  children = "Sign out",
}: SignOutButtonProps) {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
    router.push("/login")
  }

  return (
    <Button type="button" variant={variant} className={className} onClick={signOut}>
      {children}
    </Button>
  )
}
