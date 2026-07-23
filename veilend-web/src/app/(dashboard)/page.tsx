'use client'

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// This route was an alternate dashboard surface. Redirect users to the canonical
// `/dashboard` route to avoid duplicate experiences and keep a single active dashboard.
export default function RedirectToCanonicalDashboard() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/dashboard')
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Redirecting to dashboard...</h2>
        <p className="mt-2 text-sm text-slate-400">You will be forwarded to the primary VeilLend dashboard.</p>
      </div>
    </div>
  )
}