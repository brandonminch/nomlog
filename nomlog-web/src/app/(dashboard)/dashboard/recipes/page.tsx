import Link from "next/link"

import { createClient } from "@/lib/supabase/server"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export const dynamic = "force-dynamic"

export default async function RecipesListPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("recipes")
    .select("id, title, source_name, canonical_url, updated_at")
    .order("title", { ascending: true })
    .limit(1000)

  if (error) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
        <p className="text-destructive text-sm">
          Failed to load recipes: {error.message}
        </p>
      </div>
    )
  }

  const rows = data ?? []

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
        <p className="text-muted-foreground text-sm">
          {rows.length} recipe{rows.length === 1 ? "" : "s"} (max 1000 shown).
          Select a row to edit.
        </p>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">Title</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="hidden md:table-cell">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/recipes/${row.id}`}
                    className="text-primary hover:underline"
                  >
                    {row.title}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {row.source_name}
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {row.updated_at
                    ? new Date(row.updated_at).toLocaleString()
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
