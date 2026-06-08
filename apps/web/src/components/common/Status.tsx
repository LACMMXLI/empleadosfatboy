export function StatusText({ text }: { text: string }) {
  return <div className="rounded-md border bg-card p-4 text-sm text-muted-foreground">{text}</div>
}

export function StatusEmpty({ text }: { text: string }) {
  return <div className="status-empty">{text}</div>
}
