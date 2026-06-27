'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Zap, Mail, Lock, User, Building2, Eye, EyeOff, ArrowRight, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { slugify } from '@/lib/utils/format'
import toast from 'react-hot-toast'

const benefits = [
  '14 días gratis en plan Pro',
  'Sin tarjeta de crédito',
  'Configuración en 2 minutos',
  'Cancela cuando quieras',
]

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    nombre_empresa: '',
    nombre: '',
    email: '',
    password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const update = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (form.password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const orgSlug = slugify(form.nombre_empresa) + '-' + Math.random().toString(36).slice(2, 6)

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          name: form.nombre,
          org_name: form.nombre_empresa,
          org_slug: orgSlug,
        },
        emailRedirectTo: `${window.location.origin}/api/auth/callback`,
      },
    })

    if (error) {
      toast.error(
        error.message.includes('already registered')
          ? 'Este correo ya está registrado'
          : error.message
      )
      setLoading(false)
      return
    }

    toast.success('¡Cuenta creada! Revisa tu correo para confirmar.')
    router.push('/dashboard')
  }

  const passwordStrength = (() => {
    const p = form.password
    if (p.length === 0) return null
    if (p.length < 6) return { label: 'Débil', color: 'bg-destructive', width: '30%' }
    if (p.length < 10 || !/[A-Z]/.test(p)) return { label: 'Media', color: 'bg-warning', width: '60%' }
    return { label: 'Fuerte', color: 'bg-success', width: '100%' }
  })()

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left panel — Benefits */}
      <div className="hidden lg:flex w-1/2 flex-col justify-center px-16 border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent" />
        <div className="relative">
          <Link href="/" className="flex items-center gap-2 mb-12">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
              <Zap className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="font-bold text-lg text-foreground">GestorPro</span>
          </Link>

          <h2 className="text-4xl font-bold text-foreground mb-4 leading-tight">
            Empieza a gestionar<br />
            <span className="gradient-text">mejor hoy</span>
          </h2>
          <p className="text-muted-foreground mb-10 text-lg leading-relaxed">
            El sistema que usan cientos de distribuidores exitosos en México.
          </p>

          <ul className="space-y-3">
            {benefits.map((b) => (
              <li key={b} className="flex items-center gap-3 text-sm text-muted-foreground">
                <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-success" />
                </div>
                {b}
              </li>
            ))}
          </ul>

          {/* Decorative card */}
          <div className="mt-12 p-4 rounded-xl border border-border bg-surface">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent">CG</div>
              <div>
                <div className="text-sm font-medium text-foreground">Carlos García</div>
                <div className="text-xs text-muted-foreground">Distribuidora García, Monterrey</div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground italic">
              "En una semana ya teníamos todo migrado. Increíble lo rápido que se configura."
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — Form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8">
            <Link href="/" className="flex items-center gap-2 justify-center mb-6">
              <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
                <Zap className="w-4 h-4 text-accent-foreground" />
              </div>
              <span className="font-bold text-lg text-foreground">GestorPro</span>
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-foreground mb-1">Crear cuenta</h1>
          <p className="text-muted-foreground text-sm mb-8">
            14 días de prueba gratis, sin tarjeta
          </p>

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Company */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Nombre del negocio</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={form.nombre_empresa}
                  onChange={e => update('nombre_empresa', e.target.value)}
                  placeholder="Mi Distribuidora S.A."
                  required
                  className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Tu nombre</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={form.nombre}
                  onChange={e => update('nombre', e.target.value)}
                  placeholder="Juan Pérez"
                  required
                  className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Correo electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={form.email}
                  onChange={e => update('email', e.target.value)}
                  placeholder="tu@empresa.com"
                  required
                  autoComplete="email"
                  className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Contraseña</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => update('password', e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full bg-surface border border-border rounded-lg pl-10 pr-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {passwordStrength && (
                <div className="space-y-1">
                  <div className="h-1 bg-surface-raised rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${passwordStrength.color}`}
                      style={{ width: passwordStrength.width }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Contraseña {passwordStrength.label.toLowerCase()}</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-accent text-accent-foreground py-2.5 rounded-lg text-sm font-semibold hover:bg-accent/90 transition-all hover:shadow-glow-accent disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-accent-foreground/30 border-t-accent-foreground rounded-full animate-spin" />
                  Creando cuenta...
                </>
              ) : (
                <>
                  Crear cuenta gratis
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <p className="text-xs text-muted-foreground text-center">
              Al registrarte aceptas nuestros{' '}
              <a href="#" className="text-accent hover:underline">Términos de uso</a>
              {' '}y{' '}
              <a href="#" className="text-accent hover:underline">Política de privacidad</a>
            </p>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            ¿Ya tienes cuenta?{' '}
            <Link href="/login" className="text-accent hover:text-accent/80 font-medium transition-colors">
              Iniciar sesión
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
