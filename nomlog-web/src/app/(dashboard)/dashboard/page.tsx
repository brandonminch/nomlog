import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Overview of Nomlog admin tools. Connect the API when you are ready.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Content</CardTitle>
            <CardDescription>
              Manage recipes, prompts, and curated data.
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              Inspect and support user accounts (coming soon).
            </CardDescription>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>API</CardTitle>
            <CardDescription>
              Point <code className="text-xs">NEXT_PUBLIC_API_URL</code> at
              your nomlog-api deployment.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
