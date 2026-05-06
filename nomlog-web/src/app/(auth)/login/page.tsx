import { Suspense } from "react"

import { LoginForm } from "@/components/auth/login-form"
import { AuthScreen } from "@/components/layout/auth-screen"

export default function LoginPage() {
  return (
    <AuthScreen>
      <Suspense
        fallback={
          <p className="text-muted-foreground animate-pulse text-center text-sm">
            Loading sign-in…
          </p>
        }
      >
        <LoginForm />
      </Suspense>
    </AuthScreen>
  )
}
