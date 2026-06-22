import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, Banknote, CheckCircle2, Clock3, Coffee, Copy, KeyRound, LogIn, LogOut, Maximize, Minimize, RefreshCw, ShieldAlert, ShieldCheck, Utensils, UserRound, X } from "lucide-react"
import { api, timeClockDeviceRequestSession, timeClockDeviceSession } from "@/lib/api"
import { movementLabels, statusLabels } from "@/lib/ledger-ui"
import type { TimeClockEmployeeVerification, TimeClockEventType } from "@/types/domain"
import fatboyLogo from "@/assets/logo.png"
import "./TimeClockKiosk.css"

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/$/, "")
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" })
const KIOSK_PIN_LENGTH = 6
const KIOSK_SESSION_TIMEOUT_MS = 20_000

type KioskStatus = "idle" | "validating_pin" | "capturing_photo" | "registering" | "success" | "error"
type VerifiedEmployee = TimeClockEmployeeVerification["employee"] & {
  attendance: TimeClockEmployeeVerification["attendance"]
  recentMovements: TimeClockEmployeeVerification["recentMovements"]
}
type LastKioskSuccess = {
  employeeName: string
  type: TimeClockEventType | "DRINK" | "ADVANCE"
  time: string
  amount?: number
}

type BrowserAudioContext = typeof AudioContext

function useKioskSounds() {
  const contextRef = useRef<AudioContext | null>(null)

  const getContext = useCallback(() => {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: BrowserAudioContext }).webkitAudioContext
    if (!AudioContextCtor) return null
    if (!contextRef.current) {
      contextRef.current = new AudioContextCtor()
    }
    if (contextRef.current.state === "suspended") {
      void contextRef.current.resume()
    }
    return contextRef.current
  }, [])

  const playTone = useCallback((frequency: number, duration: number, volume = 0.12, delay = 0) => {
    const context = getContext()
    if (!context) return

    const startAt = context.currentTime + delay
    const oscillator = context.createOscillator()
    const gain = context.createGain()

    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(frequency, startAt)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration)

    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(startAt)
    oscillator.stop(startAt + duration + 0.03)
  }, [getContext])

  const playClick = useCallback(() => {
    playTone(820, 0.045, 0.055)
  }, [playTone])

  const playSuccess = useCallback(() => {
    playTone(660, 0.09, 0.12)
    playTone(920, 0.12, 0.11, 0.095)
  }, [playTone])

  const playError = useCallback(() => {
    playTone(220, 0.12, 0.13)
    playTone(165, 0.16, 0.11, 0.12)
  }, [playTone])

  useEffect(() => {
    return () => {
      void contextRef.current?.close()
      contextRef.current = null
    }
  }, [])

  return { playClick, playError, playSuccess }
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
  const [sessionActivityAt, setSessionActivityAt] = useState<number>(0)
  const [advanceOpen, setAdvanceOpen] = useState(false)
  const [advanceAmount, setAdvanceAmount] = useState("")
  const [approverCode, setApproverCode] = useState("")
  const [exitApprovalOpen, setExitApprovalOpen] = useState(false)
  const [exitApproverCode, setExitApproverCode] = useState("")
  const isProcessing = status === "validating_pin" || status === "capturing_photo" || status === "registering"
  const canUseActions = Boolean(verifiedEmployee) && !isProcessing
  const allowedActions = verifiedEmployee?.attendance.allowedActions ?? (verifiedEmployee ? [verifiedEmployee.attendance.nextAction] : [])
  const canRegisterEntry = Boolean(canUseActions && allowedActions.includes("ENTRY"))
  const canRegisterExit = Boolean(canUseActions && allowedActions.includes("EXIT"))
  const canStartBreak = Boolean(canUseActions && allowedActions.includes("BREAK_START"))
  const canEndBreak = Boolean(canUseActions && allowedActions.includes("BREAK_END"))
  const canRegisterDrink = Boolean(canUseActions && verifiedEmployee?.attendance.state === "IN_SHIFT")
  const canRequestAdvance = canRegisterDrink
  const { playClick, playError, playSuccess } = useKioskSounds()

  const markSessionActivity = useCallback(() => {
    setSessionActivityAt(Date.now())
  }, [])

  const clearEmployeeSession = useCallback((nextMessage = "Ingresa tu PIN para comenzar") => {
    setEmployeeCode("")
    setVerifiedEmployee(null)
    setStatus("idle")
    setStatusMessage(nextMessage)
    setAdvanceOpen(false)
    setAdvanceAmount("")
    setApproverCode("")
    setExitApprovalOpen(false)
    setExitApproverCode("")
  }, [])

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
        setVerifiedEmployee({
          ...result.employee,
          attendance: result.attendance,
          recentMovements: result.recentMovements
        })
        setSessionActivityAt(Date.now())
        setStatus("idle")
        setStatusMessage(`PIN confirmado: ${result.employee.fullName}`)
        playSuccess()
      })
      .catch((error: Error) => {
        if (cancelled) return
        setVerifiedEmployee(null)
        setStatus("error")
        setStatusMessage(error.message || "PIN inválido")
        playError()
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
  }, [employeeCode, needsAuthorization, playError, playSuccess])

  useEffect(() => {
    if (!verifiedEmployee || isProcessing) return
    const timeout = window.setTimeout(() => {
      clearEmployeeSession("Sesión cerrada por inactividad. Ingresa tu PIN.")
    }, KIOSK_SESSION_TIMEOUT_MS)
    return () => window.clearTimeout(timeout)
  }, [clearEmployeeSession, isProcessing, sessionActivityAt, verifiedEmployee])

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
    playClick()
    markSessionActivity()

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

  const handleRegister = async (type: TimeClockEventType, managerCode?: string) => {
    playClick()
    markSessionActivity()
    if (!verifiedEmployee || employeeCode.length !== KIOSK_PIN_LENGTH) {
      setStatus('error')
      setStatusMessage("Ingresa un PIN válido para habilitar el registro.")
      playError()
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

      await api.timeClock.registerEntry({ employeeCode, type, photo, approverCode: managerCode })

      // 4. Handle success
      setStatus('success')
      const successMsg = `${entryTypeLabel(type)} registrada - ${verifiedEmployee.fullName}`
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
      playSuccess()

      // Clean input automatically
      setEmployeeCode("")
      setVerifiedEmployee(null)
      setExitApprovalOpen(false)
      setExitApproverCode("")

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
      playError()
      setExitApproverCode("")
    }
  }

  const handleRegisterDrink = async () => {
    playClick()
    markSessionActivity()
    if (!verifiedEmployee || employeeCode.length !== KIOSK_PIN_LENGTH) {
      setStatus("error")
      setStatusMessage("Ingresa un PIN válido para habilitar bebida.")
      playError()
      window.setTimeout(() => {
        setStatus("idle")
        setStatusMessage("Ingresa tu PIN para comenzar")
      }, 4000)
      return
    }

    try {
      setStatus("capturing_photo")
      setStatusMessage(`Capturando evidencia para ${verifiedEmployee.fullName}...`)
      await new Promise((resolve) => setTimeout(resolve, 300))

      if (cameraError) {
        throw new Error("Cámara sin permiso o no disponible. No se puede registrar bebida.")
      }

      const photo = await capturePhotoOnce()

      setStatus("registering")
      setStatusMessage("Guardando bebida...")

      const result = await api.timeClock.registerDrink({ employeeCode, photo })
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
      playSuccess()
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
      playError()
      setEmployeeCode("")
      setVerifiedEmployee(null)
      window.setTimeout(() => {
        setStatus("idle")
        setStatusMessage("Ingresa tu PIN para comenzar")
      }, 5000)
    }
  }

  const handleSalaryAdvance = async () => {
    playClick()
    markSessionActivity()
    const amount = Number(advanceAmount)
    if (!verifiedEmployee || employeeCode.length !== KIOSK_PIN_LENGTH) {
      setStatus("error")
      setStatusMessage("La sesión del empleado ya no es válida.")
      playError()
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setStatus("error")
      setStatusMessage("Ingresa una cantidad válida para el adelanto.")
      playError()
      return
    }
    if (approverCode.length !== KIOSK_PIN_LENGTH) {
      setStatus("error")
      setStatusMessage("El encargado debe ingresar su código de 6 dígitos.")
      playError()
      return
    }

    try {
      setStatus("registering")
      setStatusMessage("Validando encargado y registrando adelanto...")
      const movement = await api.timeClock.registerSalaryAdvance({ employeeCode, approverCode, amount })
      const registeredAmount = Number(movement.amount)
      const timeStr = new Intl.DateTimeFormat("es-MX", {
        timeZone: "America/Tijuana",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      }).format(new Date())

      setStatus("success")
      setStatusMessage(`Adelanto autorizado y registrado - ${money.format(registeredAmount)}`)
      setLastSuccess({ employeeName: verifiedEmployee.fullName, type: "ADVANCE", amount: registeredAmount, time: timeStr })
      setAdvanceOpen(false)
      setAdvanceAmount("")
      setApproverCode("")
      playSuccess()
      setEmployeeCode("")
      setVerifiedEmployee(null)
      window.setTimeout(() => {
        setStatus("idle")
        setStatusMessage("Ingresa tu PIN para comenzar")
      }, 6000)
      window.setTimeout(() => setLastSuccess(null), 10000)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "No se pudo registrar el adelanto"
      setStatus("error")
      setStatusMessage(errorMessage)
      setApproverCode("")
      playError()
    }
  }

  function regenerateRequestCode() {
    playClick()
    const created = createLocalDeviceRequestToken()
    timeClockDeviceRequestSession.token = created
    setRequestToken(created)
  }

  async function copyCode() {
    const code = deviceRequest.data?.code
    if (!code) return
    playClick()
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
    <main
      className={`timeclock-shell-kiosk ${verifiedEmployee ? "employee-session" : "access-session"}`}
      onPointerDownCapture={() => {
        if (verifiedEmployee && !isProcessing) markSessionActivity()
      }}
    >
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

          {verifiedEmployee ? (
            <div className="timeclock-kiosk-time-block">
              <div className="timeclock-kiosk-time">{timeString}</div>
              <div className="timeclock-kiosk-date">{dateString}</div>
            </div>
          ) : <div />}

          <div className="timeclock-kiosk-device-block">
            <div className="timeclock-kiosk-authorized">
              <CheckCircle2 />
              <span>Dispositivo autorizado</span>
            </div>
            <button
              type="button"
              className="timeclock-kiosk-fullscreen-btn"
              onClick={() => {
                playClick()
                toggleFullscreen()
              }}
              title={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
            <div className="timeclock-kiosk-device-name">Dispositivo: {device.data?.name ?? "Tablet"}</div>
          </div>
        </header>

        {device.error && <div className="timeclock-alert">{device.error.message}</div>}

        {!verifiedEmployee ? (
          <div className="timeclock-access-view">
            <section className="timeclock-access-intro">
              <img className="timeclock-access-logo" src={fatboyLogo} alt="Fatboy" />
              <span className="timeclock-access-eyebrow">Control de asistencia</span>
              <div className="timeclock-access-clock">{timeString}</div>
              <div className="timeclock-access-date">{dateString}</div>
              <p>Ingresa tu código personal para ver tus opciones.</p>
            </section>

            <section className="timeclock-access-card">
              <div className="timeclock-access-user"><UserRound /></div>
              <div className="timeclock-kiosk-pin-title">
                <h2>Código de empleado</h2>
                <p>6 dígitos</p>
              </div>
              <div className="timeclock-kiosk-pin-dots" aria-label={`${employeeCode.length} de 6 dígitos ingresados`}>
                {Array.from({ length: KIOSK_PIN_LENGTH }).map((_, i) => (
                  <span key={i} className={i < employeeCode.length ? "filled" : ""} />
                ))}
              </div>
              <div className="timeclock-kiosk-keypad">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((key) => (
                  <button key={key} type="button" className="timeclock-kiosk-key" onClick={() => handleKeyPress(key)} disabled={isProcessing || employeeCode.length >= KIOSK_PIN_LENGTH}>
                    {key}
                  </button>
                ))}
                <button type="button" className="timeclock-kiosk-key action-key" onClick={() => handleKeyPress("Limpiar")} disabled={isProcessing} aria-label="Limpiar código">×</button>
                <button type="button" className="timeclock-kiosk-key" onClick={() => handleKeyPress("0")} disabled={isProcessing || employeeCode.length >= KIOSK_PIN_LENGTH}>0</button>
                <button type="button" className="timeclock-kiosk-key action-key" onClick={() => handleKeyPress("Borrar")} disabled={isProcessing} aria-label="Borrar último dígito">⌫</button>
              </div>
              <div className={`timeclock-kiosk-status-card ${status}`}><span className="timeclock-kiosk-status-text">{statusMessage}</span></div>
            </section>
          </div>
        ) : (
          <div className="timeclock-employee-view">
            <section className="timeclock-employee-heading">
              <div className="timeclock-employee-identity">
                <div className="timeclock-employee-avatar"><UserRound /></div>
                <div>
                  <span className="timeclock-access-eyebrow">Empleado verificado</span>
                  <h2>{verifiedEmployee.fullName}</h2>
                  <p>{verifiedEmployee.position} · {verifiedEmployee.branch.name}</p>
                </div>
              </div>
              <div className="timeclock-employee-heading-actions">
                <div className={`timeclock-employee-state ${verifiedEmployee.attendance.state.toLowerCase()}`}>
                  <span />{verifiedEmployee.attendance.statusLabel}
                </div>
                <button type="button" className="timeclock-employee-back" onClick={() => { playClick(); clearEmployeeSession() }}>
                  <ArrowLeft /> Salir
                </button>
              </div>
            </section>

            <div className="timeclock-employee-dashboard">
              <section className="timeclock-shift-flow">
                <div className="timeclock-section-heading">
                  <span>Secuencia del turno</span>
                  <strong>Sigue el orden indicado</strong>
                </div>
                <ShiftSequence attendance={verifiedEmployee.attendance} />

                <div className="timeclock-primary-zone">
                  {!verifiedEmployee.attendance.activeSession && (
                    <PrimaryShiftAction icon={<LogIn />} title="Registrar entrada" detail="Inicia tu jornada laboral" tone="entry" disabled={!canRegisterEntry} onClick={() => handleRegister("ENTRY")} />
                  )}
                  {verifiedEmployee.attendance.activeSession && verifiedEmployee.attendance.mealBreak.status === "NOT_STARTED" && (
                    <>
                      <PrimaryShiftAction icon={<Utensils />} title="Salir a comida" detail="Siguiente paso de tu jornada" tone="meal-out" disabled={!canStartBreak} onClick={() => handleRegister("BREAK_START")} />
                      <button className="timeclock-exception-exit" type="button" disabled={!canRegisterExit} onClick={() => { playClick(); markSessionActivity(); setExitApproverCode(""); setExitApprovalOpen(true) }}>
                        <KeyRound />
                        <span><strong>Finalizar sin registrar comida</strong><small>Requiere código de encargado</small></span>
                      </button>
                    </>
                  )}
                  {verifiedEmployee.attendance.mealBreak.status === "ON_BREAK" && (
                    <PrimaryShiftAction icon={<Utensils />} title="Regresar de comida" detail="Continúa con tu jornada" tone="meal-in" disabled={!canEndBreak} onClick={() => handleRegister("BREAK_END")} />
                  )}
                  {verifiedEmployee.attendance.activeSession && verifiedEmployee.attendance.mealBreak.status === "COMPLETED" && (
                    <PrimaryShiftAction icon={<LogOut />} title="Finalizar turno" detail="La secuencia está completa" tone="exit" disabled={!canRegisterExit} onClick={() => handleRegister("EXIT")} />
                  )}
                </div>

                <div className={`timeclock-kiosk-status-card ${status}`}><span className="timeclock-kiosk-status-text">{statusMessage}</span></div>
                <div className="timeclock-kiosk-photo-note"><ShieldCheck /><span>La asistencia se registra con evidencia fotográfica.</span></div>
              </section>

              <aside className="timeclock-financial-panel">
                <div className="timeclock-section-heading">
                  <span>Movimientos financieros</span>
                  <strong>Últimos {verifiedEmployee.recentMovements.length}</strong>
                </div>

                <div className="timeclock-secondary-actions">
                  <button type="button" className="timeclock-utility-action drink" disabled={!canRegisterDrink} onClick={handleRegisterDrink}>
                    <span className="timeclock-utility-icon"><Coffee /></span>
                    <span><strong>Registrar bebida</strong><small>Consumo interno · {money.format(beveragePrice)}</small></span>
                  </button>
                  <button
                    type="button"
                    className="timeclock-utility-action advance"
                    disabled={!canRequestAdvance}
                    onClick={() => { playClick(); markSessionActivity(); setAdvanceAmount(""); setApproverCode(""); setAdvanceOpen(true) }}
                  >
                    <span className="timeclock-utility-icon"><Banknote /></span>
                    <span><strong>Adelanto de sueldo</strong><small>Ingresa una cantidad personalizada</small></span>
                  </button>
                </div>

                <FinancialMovementHistory movements={verifiedEmployee.recentMovements} />
              </aside>
            </div>
          </div>
        )}

        {exitApprovalOpen && verifiedEmployee && (
          <div className="timeclock-advance-overlay" role="dialog" aria-modal="true" aria-labelledby="exit-approval-title">
            <div className="timeclock-advance-modal timeclock-exit-approval-modal">
              <button className="timeclock-advance-close" type="button" onClick={() => { setExitApprovalOpen(false); setExitApproverCode("") }} disabled={isProcessing} aria-label="Cerrar"><X /></button>
              <div className="timeclock-advance-icon"><KeyRound /></div>
              <div>
                <h2 id="exit-approval-title">Autorizar salida sin comida</h2>
                <p>{verifiedEmployee.fullName} no completó la secuencia de comida.</p>
              </div>
              <label>
                <span>Código del encargado de sucursal</span>
                <input
                  className="timeclock-advance-code"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={exitApproverCode}
                  onChange={(event) => { setExitApproverCode(event.target.value.replace(/\D/g, "").slice(0, 6)); markSessionActivity() }}
                  autoFocus
                />
              </label>
              <div className="timeclock-advance-note"><ShieldCheck /><span>Esta excepción quedará registrada con el encargado responsable.</span></div>
              {status === "error" && <div className="timeclock-modal-error">{statusMessage}</div>}
              <button className="timeclock-advance-submit" type="button" disabled={isProcessing || exitApproverCode.length !== 6} onClick={() => handleRegister("EXIT", exitApproverCode)}>
                {isProcessing ? "Registrando..." : "Autorizar y finalizar turno"}
              </button>
            </div>
          </div>
        )}

        {advanceOpen && verifiedEmployee && (
          <div className="timeclock-advance-overlay" role="dialog" aria-modal="true" aria-labelledby="advance-title">
            <div className="timeclock-advance-modal">
              <button className="timeclock-advance-close" type="button" onClick={() => setAdvanceOpen(false)} disabled={isProcessing} aria-label="Cerrar">
                <X />
              </button>
              <div className="timeclock-advance-icon"><Banknote /></div>
              <div>
                <h2 id="advance-title">Adelanto de sueldo</h2>
                <p>{verifiedEmployee.fullName} · {verifiedEmployee.branch.name}</p>
              </div>
              <label>
                <span>Cantidad solicitada</span>
                <div className="timeclock-advance-amount">
                  <b>$</b>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={advanceAmount}
                    onChange={(event) => {
                      setAdvanceAmount(event.target.value)
                      markSessionActivity()
                    }}
                    autoFocus
                  />
                </div>
              </label>
              <label>
                <span>Código del encargado de sucursal</span>
                <input
                  className="timeclock-advance-code"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="••••••"
                  value={approverCode}
                  onChange={(event) => {
                    setApproverCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                    markSessionActivity()
                  }}
                />
              </label>
              <div className="timeclock-advance-note">
                <ShieldCheck />
                <span>El adelanto se registrará autorizado, con folio y responsable.</span>
              </div>
              <button className="timeclock-advance-submit" type="button" disabled={isProcessing || !advanceAmount || approverCode.length !== 6} onClick={handleSalaryAdvance}>
                {isProcessing ? "Registrando..." : "Autorizar y registrar adelanto"}
              </button>
            </div>
          </div>
        )}

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

function PrimaryShiftAction({ icon, title, detail, tone, disabled, onClick }: {
  icon: ReactNode
  title: string
  detail: string
  tone: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className={`timeclock-primary-action ${tone}`} disabled={disabled} onClick={onClick}>
      <span className="timeclock-primary-action-icon">{icon}</span>
      <span><strong>{title}</strong><small>{detail}</small></span>
    </button>
  )
}

function ShiftSequence({ attendance }: { attendance: TimeClockEmployeeVerification["attendance"] }) {
  const currentStep = !attendance.activeSession
    ? 0
    : attendance.mealBreak.status === "NOT_STARTED"
      ? 1
      : attendance.mealBreak.status === "ON_BREAK"
        ? 2
        : 3
  const steps = [
    { label: "Entrada", icon: <LogIn /> },
    { label: "Salir a comida", icon: <Utensils /> },
    { label: "Regresar", icon: <Utensils /> },
    { label: "Salida", icon: <LogOut /> }
  ]

  return (
    <div className="timeclock-shift-sequence">
      {steps.map((step, index) => (
        <div className={`timeclock-sequence-step ${index < currentStep ? "complete" : index === currentStep ? "current" : "pending"}`} key={step.label}>
          <span className="timeclock-sequence-icon">{index < currentStep ? <CheckCircle2 /> : step.icon}</span>
          <strong>{step.label}</strong>
          {index < steps.length - 1 && <span className="timeclock-sequence-line" />}
        </div>
      ))}
    </div>
  )
}

function FinancialMovementHistory({ movements }: { movements: VerifiedEmployee["recentMovements"] }) {
  return (
    <div className="timeclock-financial-history">
      <div className="timeclock-financial-history-head">
        <span>Concepto</span><span>Cargo</span>
      </div>
      <div className="timeclock-financial-list">
        {movements.length ? movements.map((movement) => {
          const isConsumption = movement.kind === "DRINK" || movement.kind === "FOOD" || movement.kind === "INTERNAL_CONSUMPTION"
          const isCanceled = movement.status === "CANCELED" || movement.status === "REJECTED"
          return (
            <div className={`timeclock-financial-row ${isConsumption ? "consumption" : "cash"} ${isCanceled ? "canceled" : ""}`} key={movement.id}>
              <span className="timeclock-financial-icon">{isConsumption ? <Coffee /> : <Banknote />}</span>
              <span className="timeclock-financial-detail">
                <strong>{movement.productName || movementLabels[movement.kind]}</strong>
                <small>{formatFinancialDate(movement.createdAt)} · {statusLabels[movement.status]}</small>
                <small className="folio">{movement.folio}</small>
              </span>
              <strong className="timeclock-financial-amount">{isCanceled ? "" : "−"}{money.format(movement.amount)}</strong>
            </div>
          )
        }) : (
          <div className="timeclock-financial-empty">
            <Banknote />
            <strong>Sin movimientos financieros</strong>
            <span>Los consumos y adelantos aparecerán aquí.</span>
          </div>
        )}
      </div>
    </div>
  )
}

function formatFinancialDate(value: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Tijuana",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value))
}

function entryTypeLabel(type: TimeClockEventType) {
  const labels: Record<TimeClockEventType, string> = {
    ENTRY: "Entrada",
    EXIT: "Salida",
    BREAK_START: "Salida de comida",
    BREAK_END: "Entrada de comida"
  }
  return labels[type]
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
