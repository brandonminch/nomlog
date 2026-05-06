import type { ReactNode } from "react"

type AuthScreenProps = {
  children: ReactNode
}

/**
 * Centered auth layout with a soft warm gradient backdrop (login, unauthorized, etc.).
 */
export function AuthScreen({ children }: AuthScreenProps) {
  return (
    <div className="relative flex min-h-full flex-1 flex-col items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_90%_at_50%_-30%,oklch(0.93_0.07_55_/_0.9),transparent_55%),radial-gradient(ellipse_90%_70%_at_100%_20%,oklch(0.94_0.05_85_/_0.75),transparent_50%),radial-gradient(ellipse_80%_60%_at_0%_100%,oklch(0.92_0.06_40_/_0.65),transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.22] mix-blend-multiply dark:opacity-[0.12] dark:mix-blend-soft-light"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />
      <div className="relative z-10 flex w-full max-w-lg flex-col items-stretch">
        {children}
      </div>
    </div>
  )
}
