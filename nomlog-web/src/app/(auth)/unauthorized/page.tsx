import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SignOutButton } from "@/components/auth/sign-out-button"

export default function UnauthorizedPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>
            You are signed in, but this account is not in the{" "}
            <code className="text-xs">admin_users</code> allowlist. Ask a database
            admin to grant access in Supabase (or use the service role / SQL
            editor).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          <p>
            If you expected access, confirm you are using the correct Nomlog
            account and that a row exists in{" "}
            <code className="text-xs">admin_users</code> for your user ID.
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <SignOutButton />
        </CardFooter>
      </Card>
    </div>
  )
}
