import { PageHeader } from "@/components/admin/page-header"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function UsersAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="User administration will live here."
      />
      <Card className="max-w-xl border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Coming soon</CardTitle>
          <CardDescription>
            Support and inspection tools for Nomlog accounts will appear in this
            section.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
