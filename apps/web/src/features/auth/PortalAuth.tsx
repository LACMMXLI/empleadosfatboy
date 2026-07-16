import { useEffect, useState, type ReactNode } from "react"
import { useMutation } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import { Download, KeyRound, Phone, UsersRound } from "lucide-react"
import { api, employeeSession, session } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { PortalRoute } from "@/lib/ledger-ui"
import fatboyLogo from "@/assets/logo.png"

function LoginLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`login-logo relative mx-auto w-full ${className}`}>
      <img className="relative z-10 h-28 w-full object-contain" src={fatboyLogo} alt="Fatboy" />
    </div>
  )
}

function LoginFrame({ children, variant }: { children: ReactNode; variant: "admin" | "employee" }) {
  return (
    <main className={`login-scene login-scene-${variant}`}>
      <div className="login-grid" />
      <div className="relative z-10 flex min-h-screen w-full items-center justify-center p-4">{children}</div>
    </main>
  )
}

function usePWAInstall() {
  const [promptEvent, setPromptEvent] = useState<any>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e)
    }

    const handleAppInstalled = () => {
      setPromptEvent(null)
      setIsInstalled(true)
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
    window.addEventListener("appinstalled", handleAppInstalled)

    // Check display mode
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsInstalled(true)
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt)
      window.removeEventListener("appinstalled", handleAppInstalled)
    }
  }, [])

  const install = async () => {
    if (promptEvent) {
      promptEvent.prompt()
      const { outcome } = await promptEvent.userChoice
      if (outcome === "accepted") {
        setPromptEvent(null)
      }
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
      if (isIOS) {
        setShowIOSInstructions(true)
      } else {
        alert("Para instalar esta aplicación, haz clic en el icono de instalación (pantalla con flecha hacia abajo) en la barra de direcciones de tu navegador (Chrome/Edge).")
      }
    }
  }

  return {
    isInstallable: !!promptEvent,
    isInstalled,
    install,
    showIOSInstructions,
    setShowIOSInstructions
  }
}

function goToPortal(route: PortalRoute, onNavigate: (route: PortalRoute) => void) {
  const path = route === "home" ? "/" : `/${route}`
  window.history.pushState(null, "", path)
  onNavigate(route)
}

export function PortalSelector({ onNavigate }: { onNavigate: (route: PortalRoute) => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-3xl space-y-4">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold">Fatboy RH</h1>
          <p className="text-sm text-muted-foreground">Selecciona el portal que quieres abrir</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="transition-all duration-200 hover:shadow-lg hover:border-cyan-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <UsersRound className="h-5 w-5 text-cyan-400" />
                Portal del Empleado
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Solicitudes, saldo e historial personal.</p>
            </CardHeader>
            <CardContent>
              <Button 
                className="h-12 w-full transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background" 
                onClick={() => goToPortal("employee", onNavigate)}
              >
                Abrir empleado
              </Button>
            </CardContent>
          </Card>
          <Card className="transition-all duration-200 hover:shadow-lg hover:border-violet-500/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-foreground">
                <KeyRound className="h-5 w-5 text-violet-400" />
                Administración RH
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Adelantos, empleados y control interno de recursos humanos.</p>
            </CardHeader>
            <CardContent>
              <Button 
                className="h-12 w-full transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background" 
                onClick={() => goToPortal("admin", onNavigate)}
              >
                Abrir administración
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

export function AdminLogin({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({ defaultValues: { email: "", password: "" } })
  const login = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.login(email, password),
    onSuccess: (data) => {
      session.token = data.token
      employeeSession.token = null
      onLoggedIn(data.token)
    },
    onError: (err: Error) => setError(err.message)
  })

  const { isInstalled, install, showIOSInstructions, setShowIOSInstructions } = usePWAInstall()

  return (
    <LoginFrame variant="admin">
      <Card className="login-card w-full max-w-sm">
        <CardHeader className="space-y-4 p-5 pb-3">
          <LoginLogo />
          <div>
            <CardTitle className="text-xl">Fatboy RH</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Correo electrónico y contraseña</p>
          </div>
        </CardHeader>
        <CardContent className="p-5 pt-2">
          <form className="space-y-4" onSubmit={form.handleSubmit((values) => login.mutate(values))}>
            <div className="space-y-3">
              <Input 
                className="login-input h-12 transition-all focus-visible:ring-2 focus-visible:ring-blue-500" 
                placeholder="Email" 
                aria-invalid={!!error}
                {...form.register("email")} 
              />
              <Input 
                className="login-input h-12 transition-all focus-visible:ring-2 focus-visible:ring-blue-500" 
                placeholder="Password" 
                type="password" 
                aria-invalid={!!error}
                {...form.register("password")} 
              />
              {error && (
                <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive-foreground animate-in fade-in slide-in-from-top-1">
                  {error}
                </div>
              )}
            </div>
            <Button 
              className="login-primary h-12 w-full text-base font-semibold transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background" 
              disabled={login.isPending} 
              type="submit"
            >
              Entrar a administración
            </Button>
            
            {!isInstalled && (
              <Button 
                className="w-full h-11 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center gap-2 mt-2 transition-all font-semibold"
                onClick={install}
                type="button"
              >
                <Download className="h-4 w-4" />
                Instalar Fatboy RH
              </Button>
            )}

            {showIOSInstructions && (
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-300 mt-2 space-y-1 text-left">
                <p className="font-semibold">Instrucciones para iOS:</p>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>Pulsa el botón <strong>Compartir</strong> en Safari (abajo en el centro).</li>
                  <li>Selecciona <strong>Agregar a inicio</strong> en la lista de opciones.</li>
                </ol>
                <button className="text-blue-400 font-bold block pt-1 hover:underline text-left" onClick={() => setShowIOSInstructions(false)} type="button">
                  Entendido, cerrar
                </button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </LoginFrame>
  )
}

export function EmployeeLogin({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [employeeError, setEmployeeError] = useState<string | null>(null)
  const employeeForm = useForm({ defaultValues: { phone: "", pin: "" } })
  const employeeLogin = useMutation({
    mutationFn: ({ phone, pin }: { phone: string; pin: string }) => api.employeePortal.login(phone, pin),
    onSuccess: (data) => {
      employeeSession.token = data.token
      session.token = null
      onLoggedIn(data.token)
    },
    onError: (err: Error) => setEmployeeError(err.message)
  })

  const { isInstalled, install, showIOSInstructions, setShowIOSInstructions } = usePWAInstall()

  return (
    <LoginFrame variant="employee">
      <Card className="login-card w-full max-w-sm text-[#e2e8f0]">
        <CardHeader className="space-y-4 p-6 pb-3">
          <LoginLogo />
          <div className="text-center">
            <CardTitle className="text-xl" style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, letterSpacing: '-0.01em' }}>Portal Empleado</CardTitle>
            <p className="mt-1.5 text-sm text-muted-foreground">Ingresa con tu teléfono y código PIN</p>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-2">
          <form className="space-y-5" onSubmit={employeeForm.handleSubmit((values) => employeeLogin.mutate(values))}>
            <div className="space-y-3.5">
              <div className="relative">
                <Phone className="absolute left-4 top-3.5 h-5 w-5" style={{ color: 'rgba(0, 229, 255, 0.6)' }} />
                <input 
                  className="form-input login-input h-12 pl-12 w-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40" 
                  placeholder="Teléfono" 
                  inputMode="tel" 
                  aria-invalid={!!employeeError}
                  {...employeeForm.register("phone")} 
                />
              </div>
              <div className="relative">
                <KeyRound className="absolute left-4 top-3.5 h-5 w-5" style={{ color: 'rgba(0, 229, 255, 0.6)' }} />
                <input 
                  className="form-input login-input h-12 pl-12 w-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40" 
                  placeholder="PIN de 6 dígitos" 
                  type="password" 
                  inputMode="numeric" 
                  maxLength={6} 
                  aria-invalid={!!employeeError}
                  {...employeeForm.register("pin")} 
                />
              </div>
              {employeeError && (
                <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/8 p-3 text-sm text-center text-red-300 animate-in fade-in slide-in-from-top-1">
                  {employeeError}
                </div>
              )}
            </div>
            <button 
              className="employee-request-submit h-12 w-full text-base rounded-xl" 
              disabled={employeeLogin.isPending} 
              type="submit"
            >
              {employeeLogin.isPending ? "Ingresando..." : "Ingresar"}
            </button>

            {!isInstalled && (
              <button
                className="w-full mt-1 rounded-xl h-11 flex items-center justify-center gap-2 font-bold text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background border cursor-pointer"
                style={{ 
                  background: 'rgba(0, 229, 255, 0.06)', 
                  borderColor: 'rgba(0, 229, 255, 0.2)', 
                  color: 'rgba(0, 229, 255, 0.8)' 
                }}
                onClick={install}
                type="button"
              >
                <Download className="h-4 w-4" />
                Instalar App Empleado
              </button>
            )}

            {showIOSInstructions && (
              <div className="rounded-xl p-4 text-xs mt-1 space-y-2 text-left animate-in fade-in slide-in-from-top-2" style={{ borderColor: 'rgba(0, 229, 255, 0.2)', border: '1px solid rgba(0, 229, 255, 0.2)', background: 'rgba(0, 229, 255, 0.04)', color: 'rgba(0, 229, 255, 0.7)' }}>
                <p className="font-bold text-sm" style={{ color: 'rgba(0, 229, 255, 0.85)' }}>Instrucciones para iOS:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Pulsa el botón <strong>Compartir</strong> en Safari (abajo en el centro).</li>
                  <li>Selecciona <strong>Agregar a inicio</strong> en la lista de opciones.</li>
                </ol>
                <button 
                  className="font-bold block pt-2 hover:underline text-left focus-visible:outline-none focus-visible:ring-2 rounded px-1 -mx-1 cursor-pointer border-none bg-transparent" 
                  style={{ color: 'rgba(0, 229, 255, 0.85)' }}
                  onClick={() => setShowIOSInstructions(false)} 
                  type="button"
                >
                  Entendido, cerrar
                </button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </LoginFrame>
  )
}
