import { Suspense } from "react"

import { LoginForm } from "@/components/auth/login-form"

export default function LoginPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center p-6">
      <Suspense
        fallback={
          <p className="text-muted-foreground text-sm">Loading sign-in…</p>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  )
}
