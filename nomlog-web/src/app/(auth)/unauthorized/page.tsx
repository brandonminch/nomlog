import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SignOutButton } from "@/components/auth/sign-out-button"
import { AuthScreen } from "@/components/layout/auth-screen"

export default function UnauthorizedPage() {
  return (
    <AuthScreen>
      <Card className="w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-2 shadow-lg ring-1 ring-border/60 duration-500">
        <CardHeader className="space-y-3 pb-2">
          <p className="text-primary text-xs font-semibold tracking-widest uppercase">
            Nomlog
          </p>
          <div>
            <CardTitle className="font-heading text-2xl">Access denied</CardTitle>
            <CardDescription className="mt-2 text-pretty leading-relaxed">
              You are signed in, but this account is not in the{" "}
              <code className="bg-muted rounded px-1 py-0.5 text-xs">
                admin_users
              </code>{" "}
              allowlist. Ask a database admin to grant access in Supabase (or
              use the service role / SQL editor).
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm leading-relaxed">
          <p>
            If you expected access, confirm you are using the correct Nomlog
            account and that a row exists in{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              admin_users
            </code>{" "}
            for your user ID.
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <SignOutButton />
        </CardFooter>
      </Card>
    </AuthScreen>
  )
}
