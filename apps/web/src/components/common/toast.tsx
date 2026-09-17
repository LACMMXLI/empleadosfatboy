import { useSyncExternalStore } from "react"
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react"

type ToastKind = "success" | "error" | "info"
type Toast = { id: number; kind: ToastKind; message: string }

const DURATIONS_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 4000,
  error: 6000
}

let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return toasts
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function push(kind: ToastKind, message: string) {
  const id = nextId++
  toasts = [...toasts, { id, kind, message }]
  emit()
  window.setTimeout(() => dismiss(id), DURATIONS_MS[kind])
  return id
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
  info: (message: string) => push("info", message),
  dismiss
}

const ICONS: Record<ToastKind, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info
}

const KIND_CLASSES: Record<ToastKind, string> = {
  success: "border-emerald-500/30 bg-slate-900/95 text-emerald-100 [&_svg]:text-emerald-400",
  error: "border-red-500/30 bg-slate-900/95 text-red-100 [&_svg]:text-red-400",
  info: "border-cyan-500/30 bg-slate-900/95 text-slate-100 [&_svg]:text-cyan-400"
}

export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot)
  if (!items.length) return null

  return (
    <div
      className="fixed inset-x-4 bottom-4 z-[200] mx-auto flex w-full max-w-sm flex-col gap-2 sm:bottom-6"
      aria-live="polite"
      aria-atomic="false"
    >
      {items.map((item) => {
        const Icon = ICONS[item.kind]
        return (
          <div
            key={item.id}
            role={item.kind === "error" ? "alert" : "status"}
            className={`flex items-start gap-3 rounded-xl border p-3 shadow-2xl shadow-black/30 backdrop-blur-md transition-all duration-300 ease-out ${KIND_CLASSES[item.kind]}`}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm font-medium">{item.message}</p>
            <button
              type="button"
              className="rounded-md p-0.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2"
              onClick={() => dismiss(item.id)}
              aria-label="Cerrar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
