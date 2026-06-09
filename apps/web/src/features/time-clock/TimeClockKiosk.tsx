import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Camera, CheckCircle2, Clock3, LogIn, LogOut, RefreshCw, ShieldAlert } from "lucide-react"
import { api, timeClockDeviceSession } from "@/lib/api"
import type { TimeClockEventType } from "@/types/domain"

export function TimeClockKiosk() {
  const queryClient = useQueryClient()
  const setupToken = useMemo(() => new URLSearchParams(window.location.search).get("token"), [])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")
  const [type, setType] = useState<TimeClockEventType>("ENTRY")
  const [pin, setPin] = useState("")
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    if (setupToken) {
      timeClockDeviceSession.token = setupToken
      window.history.replaceState({}, "", "/checador")
    }
  }, [setupToken])

  const hasToken = Boolean(timeClockDeviceSession.token)
  const device = useQuery({ queryKey: ["timeClock", "device"], queryFn: api.timeClock.device, enabled: hasToken })
  const employees = useQuery({ queryKey: ["timeClock", "employees"], queryFn: api.timeClock.employees, enabled: hasToken })

  useEffect(() => {
    let cancelled = false
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraError(null)
      } catch {
        setCameraError("Camara no disponible. Revisa permisos del navegador.")
      }
    }

    if (hasToken) void startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [hasToken])

  const register = useMutation({
    mutationFn: () => {
      if (!photo) throw new Error("Toma la foto para continuar")
      return api.timeClock.registerEntry({ employeeId: selectedEmployeeId, type, pin, photo })
    },
    onSuccess: async (result) => {
      setMessage(result.message)
      setSelectedEmployeeId("")
      setPin("")
      setPhoto(null)
      await queryClient.invalidateQueries({ queryKey: ["timeClock", "employees"] })
      window.setTimeout(() => setMessage(null), 3500)
    },
    onError: (error: Error) => setMessage(error.message)
  })

  const selectedEmployee = employees.data?.find((employee) => employee.id === selectedEmployeeId)
  const canSubmit = Boolean(selectedEmployeeId && pin.length === 6 && photo && !register.isPending)

  async function capturePhoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82))
    if (blob) setPhoto(blob)
  }

  if (!hasToken) {
    return (
      <main className="timeclock-shell">
        <section className="timeclock-panel narrow">
          <ShieldAlert className="timeclock-main-icon" />
          <h1>Dispositivo no registrado</h1>
          <p>Solicita al administrador configurar esta tablet desde el panel de asistencia.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="timeclock-shell">
      <section className="timeclock-panel">
        <header className="timeclock-header">
          <div>
            <div className="timeclock-kicker">Reloj checador</div>
            <h1>{device.data?.branch.name ?? "Sucursal"}</h1>
          </div>
          <div className="timeclock-device">
            <Clock3 />
            <span>{device.data?.name ?? "Tablet"}</span>
          </div>
        </header>

        {device.error && <div className="timeclock-alert">{device.error.message}</div>}

        <div className="timeclock-grid">
          <div className="timeclock-section">
            <div className="timeclock-section-title">Empleado</div>
            <div className="timeclock-employee-grid">
              {employees.data?.map((employee) => (
                <button
                  key={employee.id}
                  className={`timeclock-employee ${selectedEmployeeId === employee.id ? "active" : ""}`}
                  type="button"
                  onClick={() => setSelectedEmployeeId(employee.id)}
                >
                  <strong>{employee.fullName}</strong>
                  <span>{employee.position}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="timeclock-section">
            <div className="timeclock-section-title">Checada</div>
            <div className="timeclock-toggle">
              <button className={type === "ENTRY" ? "active" : ""} type="button" onClick={() => setType("ENTRY")}>
                <LogIn />
                Entrada
              </button>
              <button className={type === "EXIT" ? "active" : ""} type="button" onClick={() => setType("EXIT")}>
                <LogOut />
                Salida
              </button>
            </div>

            <input
              className="timeclock-pin"
              inputMode="numeric"
              maxLength={6}
              placeholder="PIN"
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
            />

            <div className="timeclock-camera">
              <video ref={videoRef} muted playsInline />
              {photo && (
                <div className="timeclock-photo-ready">
                  <CheckCircle2 />
                  Foto lista
                </div>
              )}
              {cameraError && <div className="timeclock-camera-error">{cameraError}</div>}
            </div>
            <canvas ref={canvasRef} className="hidden" />

            <div className="timeclock-actions">
              <button className="timeclock-secondary" type="button" onClick={capturePhoto}>
                <Camera />
                Tomar foto
              </button>
              <button
                className="timeclock-primary"
                disabled={!canSubmit}
                type="button"
                onClick={() => register.mutate()}
              >
                {register.isPending ? <RefreshCw className="spin" /> : <CheckCircle2 />}
                Registrar
              </button>
            </div>

            <div className="timeclock-selected">
              {selectedEmployee ? `${selectedEmployee.fullName} · ${type === "ENTRY" ? "Entrada" : "Salida"}` : "Selecciona empleado"}
            </div>
            {message && <div className="timeclock-message">{message}</div>}
          </div>
        </div>
      </section>
    </main>
  )
}
