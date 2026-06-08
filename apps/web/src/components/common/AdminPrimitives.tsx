import type { ReactNode } from "react"
import { X } from "lucide-react"
import { insetPanelStyle } from "@/lib/ledger-ui"

export function GuidedBlock({
  step,
  title,
  detail,
  children
}: {
  step: string
  title: string
  detail: string
  children: ReactNode
}) {
  return (
    <section className="guided-block">
      <div className="mb-3 flex items-center gap-2.5">
        <div className="guided-block-step">{step}</div>
        <div className="min-w-0">
          <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'hsl(var(--foreground))' }}>{title}</div>
          <div style={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</div>
        </div>
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

export function AdminModal({
  title,
  subtitle,
  children,
  onClose
}: {
  title: string
  subtitle?: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="admin-modal" onClick={(event) => event.stopPropagation()}>
        <header className="admin-modal-header">
          <div className="min-w-0">
            <div className="admin-modal-title">{title}</div>
            {subtitle && <div className="admin-modal-subtitle">{subtitle}</div>}
          </div>
          <button className="btn-icon" onClick={onClose} type="button" aria-label="Cerrar">
            <X style={{ width: 16, height: 16 }} />
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
      </section>
    </div>
  )
}

export function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...insetPanelStyle, padding: '0.625rem', borderRadius: '0.5rem' }}>
      <div className="stat-label" style={{ marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}
