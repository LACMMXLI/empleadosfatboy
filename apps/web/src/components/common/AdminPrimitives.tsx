import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, LogOut, X } from "lucide-react"
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

export function ExecutiveConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  verificationText,
  onCancel,
  onConfirm
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  verificationText?: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const [verification, setVerification] = useState("")

  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", escape)
    return () => document.removeEventListener("keydown", escape)
  }, [onCancel, open])

  useEffect(() => {
    if (!open) setVerification("")
  }, [open])

  if (!open) return null

  return (
    <div className="admin-modal-backdrop executive-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="executive-confirm-title" onClick={onCancel}>
      <section className="executive-confirm" onClick={(event) => event.stopPropagation()}>
        <div className="executive-confirm-icon"><LogOut /></div>
        <div className="executive-confirm-copy">
          <div className="executive-confirm-kicker">Sesión administrativa</div>
          <h2 id="executive-confirm-title">{title}</h2>
          <p>{description}</p>
          {verificationText && (
            <label className="executive-confirm-verification">
              <span>Escribe <strong>{verificationText}</strong> para confirmar</span>
              <input className="form-input" value={verification} onChange={(event) => setVerification(event.target.value)} autoComplete="off" />
            </label>
          )}
        </div>
        <div className="executive-confirm-actions">
          <button className="btn-secondary" type="button" onClick={onCancel} autoFocus>Permanecer</button>
          <button className="btn-reject" type="button" onClick={onConfirm} disabled={Boolean(verificationText && verification !== verificationText)}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}

export function ExecutiveDatePicker({
  value,
  onChange,
  title,
  placeholder = "Seleccionar fecha"
}: {
  value: string
  onChange: (value: string) => void
  title?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [visibleMonth, setVisibleMonth] = useState(() => monthFromValue(value))
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value) setVisibleMonth(monthFromValue(value))
  }, [value])

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", escape)
    }
  }, [open])

  const days = useMemo(() => calendarDays(visibleMonth), [visibleMonth])
  const today = toDateValue(new Date())

  return (
    <div className={`executive-date-picker ${open ? "open" : ""}`} ref={rootRef}>
      <button className="executive-date-trigger" type="button" title={title} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <CalendarDays />
        <span className={value ? "" : "placeholder"}>{value ? formatExecutiveDate(value) : placeholder}</span>
        <span className="executive-date-indicator" />
      </button>
      {open && (
        <div className="executive-calendar" role="dialog" aria-label={title ?? "Seleccionar fecha"}>
          <div className="executive-calendar-glow" />
          <div className="executive-calendar-header">
            <button type="button" aria-label="Mes anterior" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, -1))}><ChevronLeft /></button>
            <strong>{visibleMonth.toLocaleDateString("es-MX", { month: "long", year: "numeric" })}</strong>
            <button type="button" aria-label="Mes siguiente" onClick={() => setVisibleMonth(shiftMonth(visibleMonth, 1))}><ChevronRight /></button>
          </div>
          <div className="executive-calendar-weekdays">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="executive-calendar-grid">
            {days.map((day) => {
              const dayValue = toDateValue(day)
              const outside = day.getMonth() !== visibleMonth.getMonth()
              return (
                <button
                  key={dayValue}
                  className={`${outside ? "outside" : ""} ${dayValue === value ? "selected" : ""} ${dayValue === today ? "today" : ""}`}
                  type="button"
                  aria-current={dayValue === today ? "date" : undefined}
                  aria-pressed={dayValue === value}
                  onClick={() => { onChange(dayValue); setOpen(false) }}
                >
                  {day.getDate()}
                </button>
              )
            })}
          </div>
          <div className="executive-calendar-footer">
            <button type="button" onClick={() => { onChange(""); setOpen(false) }}>Limpiar</button>
            <button type="button" onClick={() => { onChange(today); setVisibleMonth(monthFromValue(today)); setOpen(false) }}>Hoy</button>
          </div>
        </div>
      )}
    </div>
  )
}

function monthFromValue(value: string) {
  const source = value ? new Date(`${value}T12:00:00`) : new Date()
  return new Date(source.getFullYear(), source.getMonth(), 1)
}

function shiftMonth(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1)
}

function calendarDays(month: Date) {
  const mondayIndex = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7
  const start = new Date(month.getFullYear(), month.getMonth(), 1 - mondayIndex)
  return Array.from({ length: 42 }, (_, index) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + index))
}

function toDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatExecutiveDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

export function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...insetPanelStyle, padding: '0.625rem', borderRadius: '0.5rem' }}>
      <div className="stat-label" style={{ marginBottom: '3px' }}>{label}</div>
      <div style={{ fontSize: '0.85rem', color: 'hsl(var(--foreground))', wordBreak: 'break-word' }}>{value}</div>
    </div>
  )
}
