function Bone({ className }: { className?: string }) {
  return <div className={['animate-pulse rounded-lg bg-line/80', className].filter(Boolean).join(' ')} />
}

/** Placeholder while Clerk hooks load — mirrors the sign-in card layout. */
export function AuthFormSkeleton() {
  return (
    <div
      className="rounded-2xl border border-line bg-panel/95 p-6 shadow-panel backdrop-blur-md sm:p-8"
      aria-busy="true"
      aria-label="Loading sign-in form"
    >
      <Bone className="h-8 w-28" />

      <div className="mt-6 space-y-4">
        <Bone className="h-11 w-full rounded-lg" />

        <div className="flex items-center gap-3 py-1">
          <Bone className="h-px flex-1 rounded-none" />
          <Bone className="h-3 w-6 rounded" />
          <Bone className="h-px flex-1 rounded-none" />
        </div>

        <div>
          <Bone className="mb-2 h-3.5 w-14" />
          <Bone className="h-11 w-full rounded-lg" />
        </div>

        <Bone className="h-11 w-full rounded-lg bg-teal/20" />
        <Bone className="h-11 w-full rounded-lg" />
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <Bone className="mx-auto h-4 w-48" />
      </div>
    </div>
  )
}
