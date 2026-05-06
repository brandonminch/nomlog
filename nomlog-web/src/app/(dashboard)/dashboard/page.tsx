import Link from "next/link"
import { ChefHat, FileText, Plug, Users } from "lucide-react"

import { PageHeader } from "@/components/admin/page-header"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const tiles = [
  {
    href: "/dashboard/recipes",
    title: "Recipes",
    description: "Browse and edit recipe records synced from Supabase.",
    icon: ChefHat,
  },
  {
    href: "/dashboard/content",
    title: "Content",
    description: "Prompts, curation, and editorial workflows (expanding).",
    icon: FileText,
  },
  {
    href: "/dashboard/users",
    title: "Users",
    description: "Inspect and support accounts (coming soon).",
    icon: Users,
  },
] as const

export default function DashboardPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Dashboard"
        description="Overview of Nomlog admin tools. Connect the API when you are ready."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiles.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group block outline-none">
            <Card className="h-full transition-[box-shadow,transform,border-color] duration-200 group-hover:-translate-y-0.5 group-hover:border-primary/25 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
              <CardHeader className="gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                  <Icon className="size-5" aria-hidden />
                </div>
                <div className="space-y-1">
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription className="leading-relaxed">
                    {description}
                  </CardDescription>
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
        <Card className="border-dashed md:max-xl:col-span-2 xl:col-span-1">
          <CardHeader className="gap-3">
            <div className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
              <Plug className="size-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-lg">API</CardTitle>
              <CardDescription className="leading-relaxed">
                Point{" "}
                <code className="bg-background rounded px-1 py-0.5 text-xs ring-1 ring-border/80">
                  NEXT_PUBLIC_API_URL
                </code>{" "}
                at your nomlog-api deployment for live data in tools that need
                it.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
