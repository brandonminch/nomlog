import { PageHeader } from "@/components/admin/page-header"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function ContentAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Content"
        description="Recipe and content management will live here."
      />
      <Card className="max-w-xl border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Nothing to configure yet</CardTitle>
          <CardDescription>
            When editorial workflows are ready, this area will host prompts,
            featured sets, and related tools.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
