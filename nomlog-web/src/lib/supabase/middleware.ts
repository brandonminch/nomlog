import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

import { checkUserIsAdmin } from "@/lib/auth/admin-guards"
import { safeReturnPath } from "@/lib/auth/safe-return-path"

function isProtectedPath(pathname: string) {
  return (
    pathname.startsWith("/dashboard") || pathname.startsWith("/api/admin")
  )
}

function isAuthPage(pathname: string) {
  return pathname === "/login" || pathname.startsWith("/login/")
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error("Supabase env vars missing in middleware")
    return supabaseResponse
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  if (isProtectedPath(pathname)) {
    if (!user) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("return", pathname)
      return NextResponse.redirect(loginUrl)
    }

    if (!(await checkUserIsAdmin(supabase, user.id))) {
      return NextResponse.redirect(new URL("/unauthorized", request.url))
    }
  }

  if (isAuthPage(pathname) && user) {
    if (await checkUserIsAdmin(supabase, user.id)) {
      const returnTo = request.nextUrl.searchParams.get("return")
      const target = safeReturnPath(returnTo)
      return NextResponse.redirect(new URL(target, request.url))
    }
  }

  return supabaseResponse
}
