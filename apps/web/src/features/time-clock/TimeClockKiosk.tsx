import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckCircle2, CircleHelp, Clock3, Coffee, Copy, LogIn, LogOut, Maximize, Minimize, RefreshCw, Settings, ShieldAlert, ShieldCheck, Tag, UserRound } from "lucide-react"
import { api, timeClockDeviceRequestSession, timeClockDeviceSession } from "@/lib/api"
import type { TimeClockEventType } from "@/types/domain"

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "")
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })
const KIOSK_PIN_LENGTH = 6

type KioskStatus = "idle" | "validating_pin" | "capturing_photo" | "registering" | "success" | "error"
type VerifiedEmployee = {
  id: string
  fullName: string
  position: string
}
type LastKioskSuccess = {
  employeeName: string
  type: TimeClockEventType | "DRINK"
  time: string
  amount?: number
}

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

  const [employeeCode, setEmployeeCode] = useState("")
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [serverTimeOffset, setServerTimeOffset] = useState<number>(0)
  const [now, setNow] = useState<Date>(() => new Date())

  // States for the registration flow
  const [status, setStatus] = useState<KioskStatus>("idle")
  const [statusMessage, setStatusMessage] = useState<string>("Ingresa tu PIN para comenzar")
  const [lastSuccess, setLastSuccess] = useState<LastKioskSuccess | null>(null)
  const [verifiedEmployee, setVerifiedEmployee] = useState<VerifiedEmployee | null>(null)
  const isProcessing = status === "validating_pin" || status === "capturing_photo" || status === "registering"
  const canUseActions = Boolean(verifiedEmployee) && !isProcessing

  // Fullscreen event listener
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => undefined)
    } else {
      document.exitFullscreen().catch(() => undefined)
    }
  }

  // Setup setupToken from URL if present
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

  // Synchronize with server time via health check endpoint
  useEffect(() => {
    async function syncTime() {
      try {
        const start = Date.now()
        const res = await fetch(`${API_URL}/health`)
        if (res.ok) {
          const data = await res.json()
          const serverTime = new Date(data.timestamp).getTime()
          const end = Date.now()
          const latency = (end - start) / 2
          const offset = serverTime - (Date.now() - latency)
          setServerTimeOffset(offset)
        }
      } catch (err) {
        console.error("Error syncing time with server:", err)
      }
    }
    void syncTime()
    const interval = setInterval(syncTime, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Real-time clock tick
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const serverNow = useMemo(() => new Date(now.getTime() + serverTimeOffset), [now, serverTimeOffset])

  const timeString = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Tijuana",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(serverNow)
    } catch {
      return serverNow.toTimeString().split(" ")[0]
    }
  }, [serverNow])

  const dateString = useMemo(() => {
    try {
      const formatted = new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Tijuana",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(serverNow)
      return formatted.charAt(0).toUpperCase() + formatted.slice(1)
    } catch {
      return serverNow.toLocaleDateString("es-MX")
    }
  }, [serverNow])

  const beveragePrice = 30

  // Device authorization status listener
  useEffect(() => {
    if (deviceRequest.data?.status !== "AUTHORIZED") return
    timeClockDeviceSession.token = requestToken
    timeClockDeviceRequestSession.token = null
    setDeviceToken(requestToken)
    void queryClient.invalidateQueries({ queryKey: ["timeClock"] })
  }, [deviceRequest.data?.status, queryClient, requestToken])

  useEffect(() => {
    if (needsAuthorization) return
    if (employeeCode.length !== KIOSK_PIN_LENGTH) {
      setVerifiedEmployee(null)
      if (status === "validating_pin") {
        setStatus("idle")
        setStatusMessage("Ingresa tu PIN para comenzar")
      }
      return
    }

    let cancelled = false
    setVerifiedEmployee(null)
    setStatus("validating_pin")
    setStatusMessage("Validando PIN...")

    api.timeClock.verifyEmployeeCode(employeeCode)
      .then((result) => {
        if (cancelled) return
        setVerifiedEmployee(result.employee)
        setStatus("idle")
        setStatusMessage(`PIN confirmado: ${result.employee.fullName}`)
      })
      .catch((error: Error) => {
        if (cancelled) return
        setVerifiedEmployee(null)
        setStatus("error")
        setStatusMessage(error.message || "PIN inválido")
        window.setTimeout(() => {
          if (cancelled) return
          setEmployeeCode("")
          setStatus("idle")
          setStatusMessage("Ingresa tu PIN para comenzar")
        }, 1600)
      })

    return () => {
      cancelled = true
    }
  }, [employeeCode, needsAuthorization])

  // Initialize and run the camera stream in background (hidden video element)
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
        setCameraError("Cámara no disponible. Revisa permisos del navegador.")
      }
    }

    if (hasToken && !device.error) void startCamera()
    return () => {
      cancelled = true
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [hasToken, device.error])

  async function capturePhotoOnce() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || video.readyState < 2) {
      throw new Error("La cámara no está lista para capturar evidencia.")
    }
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82))
    if (!blob) throw new Error("No se pudo procesar la fotografía de evidencia.")
    return blob
  }

  const handleKeyPress = (key: string) => {
    if (isProcessing) return

    if (status === 'success' || status === 'error') {
      setStatus('idle')
      setStatusMessage("Ingresa tu PIN para comenzar")
    }

    if (key === "Limpiar") {
      setEmployeeCode("")
      setVerifiedEmployee(null)
    } else if (key === "Borrar") {
      setEmployeeCode((prev) => prev.slice(0, -1))
      setVerifiedEmployee(null)
    } else {
      if (employeeCode.length < KIOSK_PIN_LENGTH) {
        setEmployeeCode((prev) => prev + key)
      }
    }
  }

  const handleRegister = async (type: TimeClockEventType) => {
    if (!verifiedEmployee || employeeCode.length !== KIOSK_PIN_LENGTH) {
      setStatus('error')
      setStatusMessage("Ingresa un PIN válido para habilitar el registro.")
      window.setTimeout(() => {
        setStatus('idle')
        setStatusMessage("Ingresa tu PIN para comenzar")
      }, 4000)
      return
    }

    setStatus('validating_pin')
    setStatusMessage("Preparando registro...")

    try {
      // 2. Prepare capturing photo state
      setStatus('capturing_photo')
      setStatusMessage(`Capturando evidencia para ${verifiedEmployee.fullName}...`)

      // Brief delay to ensure camera stream frame is completely synced
      await new Promise((resolve) => setTimeout(resolve, 300))

      if (cameraError) {
        throw new Error("Cámara sin permiso o no disponible. No se puede registrar asistencia.")
      }

      const photo = await capturePhotoOnce()

      // 3. Register assistant check-in/out
      setStatus('registering')
      setStatusMessage("Guardando registro de asistencia...")

      await api.timeClock.registerEntry({ employeeCode, type, photo })

      // 4. Handle success
      setStatus('success')
      const successMsg = type === "ENTRY"
        ? `Entrada registrada - ${verifiedEmployee.fullName}`
        : `Salida registrada - ${verifiedEmployee.fullName}`
      setStatusMessage(successMsg)

      // Time formatting for Mexican border
      const timeStr = new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Tijuana",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }).format(new Date())

      setLastSuccess({
        employeeName: verifiedEmployee.fullName,
        type,
        time: timeStr
      })

      // Clean input automatically
      setEmployeeCode("")
      setVerifiedEmployee(null)

      // Reset status to idle after 6 seconds
      window.setTimeout(() => {
        setStatus('idle')
        setStatusMessage("Ingresa tu PIN para comenzar")
      }, 6000)

      // Fade out last success after 10 seconds
      window.setTimeout(() => {
        setLastSuccess(null)
      }, 10000)

    } catch (error: any) {
      setStatus('error')
      setStatusMessage(error.message || "Error al registrar asistencia")
      setEmployeeCode("")
      setVerifiedEmployee(null)
      window.setTimeout(() => {
        setStatus('idle')
        setStatusMessage("Ingresa tu PIN para comenzar")
      }, 5000)
    }
  }

  const handleRegisterDrink = async () => {
    if (!verifiedEmployee || employeeCode.length !== KIOSK_PIN_LENGTH) {
      setStatus("error")
      setStatusMessage("Ingresa un PIN válido para habilitar bebida.")
      window.setTimeout(() => {
        setStatus("idle")
        setStatusMessage("Ingresa tu PIN para comenzar")
      }, 4000)
      return
    }

    setStatus("registering")
    setStatusMessage("Registrando bebida...")

    try {
      const result = await api.timeClock.registerDrink(employeeCode)
      const amount = Number(result.amount)
      const formattedAmount = money.format(Number.isFinite(amount) ? amount : 0)
      const timeStr = new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Tijuana",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }).format(new Date())

      setStatus("success")
      setStatusMessage(`Bebida registrada - ${formattedAmount}`)
      setLastSuccess({
        employeeName: result.employee.fullName,
        type: "DRINK",
        amount,
        time: timeStr
      })
      setEmployeeCode("")
      setVerifiedEmployee(null)

      window.setTimeout(() => {
        setStatus("idle")
        setStatusMessage("Ingresa tu PIN para comenzar")
      }, 6000)

      window.setTimeout(() => {
        setLastSuccess(null)
      }, 10000)
    } catch (error: any) {
      setStatus("error")
      setStatusMessage(error.message || "Error al registrar bebida")
      setEmployeeCode("")
      setVerifiedEmployee(null)
      window.setTimeout(() => {
        setStatus("idle")
        setStatusMessage("Ingresa tu PIN para comenzar")
      }, 5000)
    }
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
    setMessage("Código copiado")
    window.setTimeout(() => setMessage(null), 1800)
  }

  if (needsAuthorization) {
    return (
      <main className="timeclock-shell">
        <section className="timeclock-panel narrow">
          <ShieldAlert className="timeclock-main-icon" />
          <h1>Dispositivo no registrado</h1>
          <p>Entrega este código al administrador para autorizar esta tablet desde Asistencia.</p>
          <div className="timeclock-registration-code">
            {deviceRequest.isLoading ? "Generando..." : deviceRequest.data?.code ?? "Sin código"}
          </div>
          <div className="timeclock-registration-meta">
            {deviceRequest.data?.expiresAt ? `Expira: ${formatLocalTime(deviceRequest.data.expiresAt)}` : "Pendiente de autorización"}
          </div>
          <div className="timeclock-actions single">
            <button className="timeclock-secondary" type="button" onClick={copyCode} disabled={!deviceRequest.data?.code}>
              <Copy />
              Copiar código
            </button>
            <button className="timeclock-secondary" type="button" onClick={regenerateRequestCode}>
              <RefreshCw />
              Nuevo código
            </button>
          </div>
          <div className="timeclock-selected">
            {deviceRequest.data?.status === "AUTHORIZED" ? "Dispositivo autorizado. Cargando..." : "Esperando autorización del administrador"}
          </div>
          {deviceRequest.error && <div className="timeclock-alert">{deviceRequest.error.message}</div>}
          {message && <div className="timeclock-message">{message}</div>}
        </section>
      </main>
    )
  }

  return (
    <main className="timeclock-shell-kiosk">
      <section className="timeclock-panel-kiosk">
        <header className="timeclock-kiosk-header">
          <div className="timeclock-kiosk-brand-block">
            <div className="timeclock-kiosk-clock-mark">
              <Clock3 />
            </div>
            <div>
              <h1>Reloj Checador</h1>
              <span>{device.data?.branch.name ?? "Sucursal"}</span>
            </div>
          </div>

          <div className="timeclock-kiosk-time-block">
            <div className="timeclock-kiosk-time">{timeString}</div>
            <div className="timeclock-kiosk-date">{dateString}</div>
          </div>

          <div className="timeclock-kiosk-device-block">
            <div className="timeclock-kiosk-authorized">
              <CheckCircle2 />
              <span>Dispositivo autorizado</span>
            </div>
            <button
              type="button"
              className="timeclock-kiosk-fullscreen-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
            <div className="timeclock-kiosk-device-name">Dispositivo: {device.data?.name ?? "Tablet"}</div>
          </div>
        </header>

        {device.error && <div className="timeclock-alert">{device.error.message}</div>}

        <div className="timeclock-kiosk-body">
          <div className="timeclock-kiosk-left-actions">
            <button
              type="button"
              className="timeclock-kiosk-action-card entry"
              onClick={() => handleRegister("ENTRY")}
              disabled={!canUseActions}
            >
              <span className="timeclock-kiosk-action-icon">
                <LogIn />
              </span>
              <strong>Registrar<br />Entrada</strong>
              <small>Iniciar jornada</small>
            </button>

            <button
              type="button"
              className="timeclock-kiosk-action-card exit"
              onClick={() => handleRegister("EXIT")}
              disabled={!canUseActions}
            >
              <span className="timeclock-kiosk-action-icon">
                <LogOut />
              </span>
              <strong>Registrar<br />Salida</strong>
              <small>Finalizar jornada</small>
            </button>
          </div>

          <div className="timeclock-kiosk-pin-panel">
            <div className={`timeclock-kiosk-employee-icon ${verifiedEmployee ? "active" : ""}`}>
              <UserRound />
            </div>
            <div className="timeclock-kiosk-pin-title">
              <h2>{verifiedEmployee ? verifiedEmployee.fullName : "Ingresa tu PIN"}</h2>
              <p>{verifiedEmployee ? "Opciones habilitadas" : "para continuar"}</p>
            </div>

            <div className={`timeclock-kiosk-pin-dots ${verifiedEmployee ? "verified" : ""}`}>
              {Array.from({ length: KIOSK_PIN_LENGTH }).map((_, i) => (
                <span key={i} className={i < employeeCode.length ? "filled" : ""} />
              ))}
            </div>

            <div className="timeclock-kiosk-keypad">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((key) => (
                <button
                  key={key}
                  type="button"
                  className="timeclock-kiosk-key"
                  onClick={() => handleKeyPress(key)}
                  disabled={isProcessing || employeeCode.length >= KIOSK_PIN_LENGTH}
                >
                  {key}
                </button>
              ))}
              <button
                type="button"
                className="timeclock-kiosk-key action-key"
                onClick={() => handleKeyPress("Limpiar")}
                disabled={isProcessing}
                aria-label="Limpiar PIN"
              >
                ×
              </button>
              <button
                type="button"
                className="timeclock-kiosk-key"
                onClick={() => handleKeyPress("0")}
                disabled={isProcessing || employeeCode.length >= KIOSK_PIN_LENGTH}
              >
                0
              </button>
              <button
                type="button"
                className="timeclock-kiosk-key action-key"
                onClick={() => handleKeyPress("Borrar")}
                disabled={isProcessing}
                aria-label="Borrar último dígito"
              >
                ⌫
              </button>
            </div>

            <div className={`timeclock-kiosk-status-card ${status}`}>
              <span className="timeclock-kiosk-status-text">{statusMessage}</span>
            </div>

            <div className="timeclock-kiosk-photo-note">
              <ShieldCheck />
              <span>Tu foto será tomada al registrar entrada o salida.</span>
            </div>
          </div>

          <div className="timeclock-kiosk-right-panel">
            <button
              type="button"
              className="timeclock-kiosk-drink-card"
              onClick={handleRegisterDrink}
              disabled={!canUseActions}
            >
              <span className="timeclock-kiosk-drink-icon">
                <Coffee />
              </span>
              <strong>Registrar<br />Bebida</strong>
              <small>Consumo interno</small>
              <span className="timeclock-kiosk-drink-divider" />
              <span className="timeclock-kiosk-price-box">
                <Tag />
                <span>
                  <small>Precio por bebida</small>
                  <b>{money.format(lastSuccess?.type === "DRINK" ? lastSuccess.amount ?? beveragePrice : beveragePrice)}</b>
                </span>
              </span>
            </button>

            <div className="timeclock-kiosk-last-consumption">
              <h3>Último consumo</h3>
              {lastSuccess?.type === "DRINK" ? (
                <div className="timeclock-kiosk-consumption-row">
                  <span className="timeclock-kiosk-consumption-icon">
                    <Coffee />
                  </span>
                  <div>
                    <strong>{lastSuccess.time}</strong>
                    <span>Bebida registrada</span>
                    <small>{lastSuccess.employeeName}</small>
                  </div>
                  <b>{money.format(lastSuccess.amount ?? 0)}</b>
                </div>
              ) : (
                <div className="timeclock-kiosk-empty-consumption">Sin consumo reciente en esta sesión</div>
              )}
            </div>
          </div>
        </div>

        <footer className="timeclock-kiosk-footer">
          <div>
            <CircleHelp />
            <span>
              <strong>¿Problemas con tu registro?</strong>
              <small>Notifica a tu administrador.</small>
            </span>
          </div>
          <div>
            <ShieldCheck />
            <span>
              <strong>Fatboy®</strong>
              <small>Sistema interno de control</small>
            </span>
          </div>
          <div>
            <Settings />
            <span>
              <strong>Soporte técnico</strong>
              <small>Ext. 1000</small>
            </span>
          </div>
        </footer>

        {/* Hidden Camera Elements */}
        <video
          ref={videoRef}
          muted
          playsInline
          style={{ position: "absolute", width: "1px", height: "1px", opacity: 0, pointerEvents: "none" }}
        />
        <canvas ref={canvasRef} style={{ display: "none" }} />
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
