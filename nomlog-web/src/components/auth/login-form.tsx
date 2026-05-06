"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { createClient } from "@/lib/supabase/client"
import { safeReturnPath } from "@/lib/auth/safe-return-path"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const returnTo = safeReturnPath(searchParams.get("return"))

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const { error: signError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      if (signError) {
        setError(signError.message)
        return
      }
      router.refresh()
      router.push(returnTo)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-sm animate-in fade-in-0 slide-in-from-bottom-2 shadow-lg ring-1 ring-border/60 duration-500">
      <CardHeader className="space-y-3 pb-2">
        <p className="text-primary text-xs font-semibold tracking-widest uppercase">
          Nomlog
        </p>
        <div>
          <CardTitle className="font-heading text-2xl">Sign in</CardTitle>
          <CardDescription className="mt-2 text-pretty leading-relaxed">
            Use the same Supabase account as the Nomlog app. Only users in{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              admin_users
            </code>{" "}
            can access the dashboard.
          </CardDescription>
        </div>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
        </CardContent>
        <CardFooter className="pt-2">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
