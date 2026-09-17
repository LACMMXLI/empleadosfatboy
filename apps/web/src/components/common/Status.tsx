export function StatusText({ text }: { text: string }) {
  return <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">{text}</div>
}

export function StatusEmpty({ text }: { text: string }) {
  return <div className="status-empty">{text}</div>
}

export function StatusError({ text }: { text: string }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive-foreground">
      {text}
    </div>
  )
}

export function StatusLoading({ text = "Cargando...", rows = 3 }: { text?: string; rows?: number }) {
  return (
    <div className="space-y-2" role="status" aria-live="polite">
      <span className="sr-only">{text}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 w-full animate-pulse rounded-md border bg-muted/40" aria-hidden="true" />
      ))}
    </div>
  )
}
