import { DashboardShell } from "@/components/admin/dashboard-shell"
import { assertAdmin } from "@/lib/auth/assert-admin"

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user } = await assertAdmin()

  return (
    <DashboardShell userEmail={user.email ?? null}>
      {children}
    </DashboardShell>
  )
}

