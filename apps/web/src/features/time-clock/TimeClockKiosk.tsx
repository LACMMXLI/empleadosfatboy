import { useEffect, useMemo, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Camera, CheckCircle2, Clock3, Copy, LogIn, LogOut, RefreshCw, ShieldAlert } from "lucide-react"
import { api, timeClockDeviceRequestSession, timeClockDeviceSession } from "@/lib/api"
import type { TimeClockEventType } from "@/types/domain"

export function TimeClockKiosk() {
  const queryClient = useQueryClient()
  const setupToken = useMemo(() => new URLSearchParams(window.location.search).get("token"), [])
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [deviceToken, setDeviceToken] = useState(timeClockDeviceSession.token)
  const [requestToken, setRequestToken] = useState(() => {
    const current = timeClockDeviceRequestSession.token
    if (current) return current
    const created = createLocalDeviceRequestToken()
    timeClockDeviceRequestSession.token = created
    return created
  })
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("")
  const [type, setType] = useState<TimeClockEventType>("ENTRY")
  const [pin, setPin] = useState("")
  const [photo, setPhoto] = useState<Blob | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    if (setupToken) {
      timeClockDeviceSession.token = setupToken
      setDeviceToken(setupToken)
      window.history.replaceState({}, "", "/checador")
    }
  }, [setupToken])

  const hasToken = Boolean(deviceToken)
  const device = useQuery({ queryKey: ["timeClock", "device", deviceToken], queryFn: api.timeClock.device, enabled: hasToken, retry: false })
  const needsAuthorization = !hasToken || Boolean(device.error)
  const deviceRequest = useQuery({
    queryKey: ["timeClock", "device-request", requestToken],
    queryFn: () => api.timeClock.requestDeviceAuthorization(requestToken),
    enabled: needsAuthorization,
    refetchInterval: (query) => query.state.data?.status === "AUTHORIZED" ? false : 5000
  })
  const employees = useQuery({ queryKey: ["timeClock", "employees", deviceToken], queryFn: api.timeClock.employees, enabled: hasToken && !device.error })

  useEffect(() => {
    if (deviceRequest.data?.status !== "AUTHORIZED") return
    timeClockDeviceSession.token = requestToken
    timeClockDeviceRequestSession.token = null
    setDeviceToken(requestToken)
    void queryClient.invalidateQueries({ queryKey: ["timeClock"] })
  }, [deviceRequest.data?.status, queryClient, requestToken])

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

    if (hasToken && !device.error) void startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [hasToken, device.error])

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

  function regenerateRequestCode() {
    const created = createLocalDeviceRequestToken()
    timeClockDeviceRequestSession.token = created
    setRequestToken(created)
  }

  async function copyCode() {
    const code = deviceRequest.data?.code
    if (!code) return
    await navigator.clipboard?.writeText(code).catch(() => undefined)
    setMessage("Codigo copiado")
    window.setTimeout(() => setMessage(null), 1800)
  }

  if (needsAuthorization) {
    return (
      <main className="timeclock-shell">
        <section className="timeclock-panel narrow">
          <ShieldAlert className="timeclock-main-icon" />
          <h1>Dispositivo no registrado</h1>
          <p>Entrega este codigo al administrador para autorizar esta tablet desde Asistencia.</p>
          <div className="timeclock-registration-code">
            {deviceRequest.isLoading ? "Generando..." : deviceRequest.data?.code ?? "Sin codigo"}
          </div>
          <div className="timeclock-registration-meta">
            {deviceRequest.data?.expiresAt ? `Expira: ${formatLocalTime(deviceRequest.data.expiresAt)}` : "Pendiente de autorizacion"}
          </div>
          <div className="timeclock-actions single">
            <button className="timeclock-secondary" type="button" onClick={copyCode} disabled={!deviceRequest.data?.code}>
              <Copy />
              Copiar codigo
            </button>
            <button className="timeclock-secondary" type="button" onClick={regenerateRequestCode}>
              <RefreshCw />
              Nuevo codigo
            </button>
          </div>
          <div className="timeclock-selected">
            {deviceRequest.data?.status === "AUTHORIZED" ? "Dispositivo autorizado. Cargando..." : "Esperando autorizacion del administrador"}
          </div>
          {deviceRequest.error && <div className="timeclock-alert">{deviceRequest.error.message}</div>}
          {message && <div className="timeclock-message">{message}</div>}
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

function createLocalDeviceRequestToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

function formatLocalTime(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(value))
}
