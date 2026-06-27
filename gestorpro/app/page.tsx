'use client'

import Link from 'next/link'
import {
  BarChart3, Package, Users, TrendingUp, ShieldCheck, Zap,
  ArrowRight, Check, Star, ChevronRight, Globe, Lock, RefreshCw
} from 'lucide-react'

const features = [
  {
    icon: BarChart3,
    title: 'Dashboard en tiempo real',
    desc: 'Métricas de ventas, inventario y entregas actualizadas al instante. Toma decisiones con datos reales.',
  },
  {
    icon: Package,
    title: 'Inventario inteligente',
    desc: 'Control de stock con alertas automáticas, SKU, categorías y precios de costo vs venta.',
  },
  {
    icon: Users,
    title: 'CRM de clientes',
    desc: 'Historial completo de compras, cotizaciones y comunicaciones por cliente.',
  },
  {
    icon: TrendingUp,
    title: 'Reportes y análisis',
    desc: 'Exporta reportes en PDF y Excel. Ventas por vendedor, por período, por producto.',
  },
  {
    icon: ShieldCheck,
    title: 'Control de acceso por roles',
    desc: 'Admin, Vendedor y Almacén con permisos granulares. Cada quien ve solo lo que necesita.',
  },
  {
    icon: Zap,
    title: 'Multi-empresa',
    desc: 'Cada negocio tiene su espacio aislado y seguro. Ideal para revendedores y agencias.',
  },
]

const plans = [
  {
    name: 'Free',
    price: '0',
    desc: 'Para empezar',
    color: 'border-border',
    features: ['1 usuario', '50 clientes', '100 productos', 'Ventas y cotizaciones', 'Soporte por email'],
    cta: 'Empezar gratis',
    href: '/register',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '599',
    desc: 'Para negocios en crecimiento',
    color: 'border-accent',
    features: [
      '5 usuarios',
      'Clientes ilimitados',
      'Productos ilimitados',
      'Reportes PDF/Excel',
      'Entregas y envíos',
      'Finanzas y préstamos',
      'Soporte prioritario',
    ],
    cta: 'Comenzar 14 días gratis',
    href: '/register?plan=pro',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: '1,499',
    desc: 'Para operaciones grandes',
    color: 'border-border',
    features: [
      'Usuarios ilimitados',
      'Todo lo de Pro',
      'Integración Mercado Libre',
      'API acceso completo',
      'Onboarding personalizado',
      'SLA garantizado',
    ],
    cta: 'Hablar con ventas',
    href: '/register?plan=enterprise',
    highlight: false,
  },
]

const testimonials = [
  {
    name: 'Carlos Mendoza',
    role: 'Dueño, Distribuidora Norte',
    text: 'Antes manejábamos todo en Excel. Ahora sé exactamente qué tengo en stock y cuánto vendí este mes en segundos.',
    stars: 5,
  },
  {
    name: 'Ana Gutiérrez',
    role: 'Administradora, Autopartes del Sur',
    text: 'El control de roles fue lo que me convenció. Mis vendedores no ven lo que no deben ver.',
    stars: 5,
  },
  {
    name: 'Roberto Lira',
    role: 'Gerente, Ferretería Central',
    text: 'Los reportes en PDF y Excel me ahorraron horas cada semana. Increíble herramienta.',
    stars: 5,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">

      {/* ─── Navigation ───────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border-subtle bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <Zap className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="font-semibold text-foreground tracking-tight">GestorPro</span>
          </div>

          <div className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Funciones</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Precios</a>
            <a href="#testimonials" className="hover:text-foreground transition-colors">Clientes</a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-surface"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-accent text-accent-foreground px-4 py-1.5 rounded-md hover:bg-accent/90 transition-all hover:shadow-glow-accent"
            >
              Empezar gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── Hero ─────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-accent/5 rounded-full blur-[80px]" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/30 bg-accent/5 text-accent text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            Nuevo: Integración con Mercado Libre
          </div>

          <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            El ERP que tu negocio{' '}
            <span className="gradient-text">merece</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Gestiona ventas, inventario, clientes y entregas en un solo lugar.
            Rápido, seguro y diseñado para distribuidores mexicanos.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="group inline-flex items-center gap-2 bg-accent text-accent-foreground px-6 py-3 rounded-lg font-semibold text-base hover:bg-accent/90 transition-all hover:shadow-glow-accent"
            >
              Empezar gratis
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a
              href="#features"
              className="inline-flex items-center gap-2 bg-surface text-foreground px-6 py-3 rounded-lg font-medium text-base border border-border hover:border-accent/30 transition-colors"
            >
              Ver funciones
            </a>
          </div>

          <p className="mt-6 text-sm text-muted-foreground">
            Sin tarjeta de crédito · Configuración en 2 minutos · Cancela cuando quieras
          </p>
        </div>

        {/* Dashboard preview */}
        <div className="relative max-w-5xl mx-auto mt-16">
          <div className="rounded-xl border border-border bg-surface overflow-hidden shadow-modal">
            {/* Mock browser bar */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-surface-raised">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-warning/60" />
                <div className="w-3 h-3 rounded-full bg-success/60" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-surface rounded px-3 py-1 text-xs text-muted-foreground flex items-center gap-2 max-w-xs mx-auto">
                  <Lock className="w-3 h-3 text-success" />
                  app.gestorpro.mx/dashboard
                </div>
              </div>
            </div>

            {/* Mock dashboard */}
            <div className="flex h-[400px]">
              {/* Sidebar */}
              <div className="w-48 border-r border-border bg-sidebar p-3 flex flex-col gap-1">
                <div className="flex items-center gap-2 p-2 mb-2">
                  <div className="w-6 h-6 rounded bg-accent/20 flex items-center justify-center">
                    <Zap className="w-3.5 h-3.5 text-accent" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">GestorPro</span>
                </div>
                {['Dashboard', 'Ventas', 'Clientes', 'Inventario', 'Entregas', 'Reportes'].map((item, i) => (
                  <div
                    key={item}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                      i === 0
                        ? 'bg-accent/10 text-accent'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-sm ${i === 0 ? 'bg-accent/20' : 'bg-surface-raised'}`} />
                    {item}
                  </div>
                ))}
              </div>

              {/* Main content */}
              <div className="flex-1 p-4 overflow-hidden">
                <div className="grid grid-cols-4 gap-3 mb-4">
                  {[
                    { label: 'Ventas hoy', value: '$42,800', color: 'text-accent' },
                    { label: 'Clientes', value: '284', color: 'text-foreground' },
                    { label: 'Pendientes', value: '12', color: 'text-warning' },
                    { label: 'Stock bajo', value: '5', color: 'text-destructive' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-surface-raised rounded-lg p-3 border border-border">
                      <div className="text-xs text-muted-foreground mb-1">{stat.label}</div>
                      <div className={`text-lg font-bold ${stat.color}`}>{stat.value}</div>
                    </div>
                  ))}
                </div>

                {/* Chart placeholder */}
                <div className="bg-surface-raised rounded-lg border border-border p-3 h-40 flex items-end gap-1">
                  {[40, 65, 45, 80, 55, 90, 70, 85, 60, 95, 75, 88].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t"
                      style={{
                        height: `${h}%`,
                        background: `hsl(189 100% 42% / ${i === 10 ? '1' : '0.3'})`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Glow under image */}
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-accent/10 rounded-full blur-2xl" />
        </div>
      </section>

      {/* ─── Social Proof Bar ─────────────────────────────────────── */}
      <section className="border-y border-border py-8 px-6">
        <div className="max-w-4xl mx-auto flex flex-wrap gap-8 justify-center items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-accent" />
            <span><strong className="text-foreground">+500</strong> negocios activos</span>
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-accent" />
            <span>Disponible en <strong className="text-foreground">toda Latinoamérica</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-accent" />
            <span>Datos <strong className="text-foreground">100% seguros</strong> con cifrado</span>
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-accent" />
            <span>Actualizado en <strong className="text-foreground">tiempo real</strong></span>
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────────── */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Todo lo que necesitas, nada que no</h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Construido con las funciones reales que usan los distribuidores exitosos.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {features.map((f) => (
              <div
                key={f.title}
                className="group p-6 rounded-xl border border-border bg-surface hover:border-accent/30 hover:bg-surface-raised transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
                  <f.icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ─────────────────────────────────────────── */}
      <section id="testimonials" className="py-24 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Lo que dicen nuestros clientes</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="p-6 rounded-xl border border-border bg-surface">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-warning text-warning" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">"{t.text}"</p>
                <div>
                  <div className="text-sm font-semibold text-foreground">{t.name}</div>
                  <div className="text-xs text-muted-foreground">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Pricing ──────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Precios simples y transparentes</h2>
            <p className="text-muted-foreground text-lg">Precios en MXN. Sin comisiones ocultas.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative p-6 rounded-xl border ${plan.color} bg-surface ${
                  plan.highlight ? 'shadow-glow-accent scale-[1.02]' : ''
                }`}
              >
                {plan.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold">
                    Más popular
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-semibold text-foreground mb-1">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{plan.desc}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold text-foreground">${plan.price}</span>
                    {plan.price !== '0' && <span className="text-muted-foreground text-sm">/mes</span>}
                  </div>
                </div>

                <ul className="space-y-2.5 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-success flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.href}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    plan.highlight
                      ? 'bg-accent text-accent-foreground hover:bg-accent/90 hover:shadow-glow-accent'
                      : 'bg-surface-raised text-foreground border border-border hover:border-accent/30'
                  }`}
                >
                  {plan.cta}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA Final ────────────────────────────────────────────── */}
      <section className="py-24 px-6 border-t border-border">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Empieza a gestionar mejor <span className="gradient-text">hoy mismo</span>
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            14 días gratis en el plan Pro. Sin tarjeta de crédito requerida.
          </p>
          <Link
            href="/register"
            className="group inline-flex items-center gap-2 bg-accent text-accent-foreground px-8 py-4 rounded-lg font-semibold text-lg hover:bg-accent/90 transition-all hover:shadow-glow-accent"
          >
            Crear cuenta gratis
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>
      </section>

      {/* ─── Footer ───────────────────────────────────────────────── */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-accent-foreground" />
              </div>
              <span className="font-semibold text-foreground">GestorPro</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              ERP moderno para distribuidores y comercios en México y Latinoamérica.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 text-sm">
            <div>
              <h4 className="font-medium text-foreground mb-3">Producto</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#features" className="hover:text-foreground transition-colors">Funciones</a></li>
                <li><a href="#pricing" className="hover:text-foreground transition-colors">Precios</a></li>
                <li><Link href="/register" className="hover:text-foreground transition-colors">Empezar</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-3">Legal</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="#" className="hover:text-foreground transition-colors">Privacidad</a></li>
                <li><a href="#" className="hover:text-foreground transition-colors">Términos</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-foreground mb-3">Contacto</h4>
              <ul className="space-y-2 text-muted-foreground">
                <li><a href="mailto:hola@gestorpro.mx" className="hover:text-foreground transition-colors">hola@gestorpro.mx</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-border-subtle flex justify-between text-xs text-muted-foreground">
          <span>© 2025 GestorPro. Todos los derechos reservados.</span>
          <span>Hecho con orgullo en México 🇲🇽</span>
        </div>
      </footer>
    </div>
  )
}
