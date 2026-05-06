/** Same-origin relative path only; avoids open redirects. */
export function safeReturnPath(param: string | null | undefined): string {
  if (!param || !param.startsWith("/") || param.startsWith("//")) {
    return "/dashboard"
  }
  if (param === "/login" || param.startsWith("/login/")) {
    return "/dashboard"
  }
  return param
}
