import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import {
  TrendingUp, ShoppingCart, Users, Package,
  Truck, FileText, AlertTriangle, ArrowUpRight, ArrowDownRight
} from 'lucide-react'
import { formatCurrency, formatRelativeDate } from '@/lib/utils/format'

export const metadata = { title: 'Dashboard' }

async function getDashboardData(orgId: string) {
  const supabase = createClient()
  const today = new Date()
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString()
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()

  const [
    { data: ventasHoy },
    { data: ventasMes },
    { count: totalClientes },
    { data: bajoStock },
    { count: entregasPendientes },
    { count: cotizacionesActivas },
    { data: ultimasVentas },
  ] = await Promise.all([
    supabase.from('ventas').select('total').eq('org_id', orgId).gte('created_at', startOfDay),
    supabase.from('ventas').select('total').eq('org_id', orgId).gte('created_at', startOfMonth),
    supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('productos').select('id, nombre, stock, stock_minimo').eq('org_id', orgId).lt('stock', supabase.rpc as any),
    supabase.from('entregas').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('estado', 'pendiente'),
    supabase.from('cotizaciones').select('*', { count: 'exact', head: true }).eq('org_id', orgId).in('estado', ['borrador', 'enviada']),
    supabase.from('ventas').select('numero, cliente_nombre, total, estado, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(5),
  ])

  const ingresosHoy = (ventasHoy || []).reduce((s, v) => s + v.total, 0)
  const ingresosMes = (ventasMes || []).reduce((s, v) => s + v.total, 0)

  return {
    ingresosHoy,
    ingresosMes,
    totalVentasHoy: ventasHoy?.length ?? 0,
    totalVentasMes: ventasMes?.length ?? 0,
    totalClientes: totalClientes ?? 0,
    entregasPendientes: entregasPendientes ?? 0,
    cotizacionesActivas: cotizacionesActivas ?? 0,
    ultimasVentas: ultimasVentas ?? [],
  }
}

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, name')
    .eq('id', user.id)
    .single()

  if (!profile?.org_id) redirect('/login')

  const data = await getDashboardData(profile.org_id)

  const stats = [
    {
      label: 'Ingresos hoy',
      value: formatCurrency(data.ingresosHoy),
      sub: `${data.totalVentasHoy} ventas`,
      icon: TrendingUp,
      trend: '+12%',
      up: true,
      color: 'text-accent',
      iconBg: 'bg-accent/10',
    },
    {
      label: 'Ventas del mes',
      value: formatCurrency(data.ingresosMes),
      sub: `${data.totalVentasMes} transacciones`,
      icon: ShoppingCart,
      trend: '+8%',
      up: true,
      color: 'text-success',
      iconBg: 'bg-success/10',
    },
    {
      label: 'Clientes totales',
      value: data.totalClientes.toLocaleString(),
      sub: 'En tu base de datos',
      icon: Users,
      color: 'text-foreground',
      iconBg: 'bg-surface-overlay',
    },
    {
      label: 'Entregas pendientes',
      value: data.entregasPendientes.toString(),
      sub: 'Por despachar',
      icon: Truck,
      color: data.entregasPendientes > 10 ? 'text-warning' : 'text-foreground',
      iconBg: data.entregasPendientes > 10 ? 'bg-warning/10' : 'bg-surface-overlay',
    },
  ]

  const estadoColors: Record<string, string> = {
    pagado: 'text-success bg-success/10',
    pendiente: 'text-warning bg-warning/10',
    parcial: 'text-accent bg-accent/10',
    cancelado: 'text-destructive bg-destructive/10',
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Bienvenido, {profile.name}. Aquí está el resumen de tu negocio.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-surface rounded-xl border border-border p-4 hover:border-border hover:shadow-card-hover transition-all"
          >
            <div className="flex items-start justify-between mb-3">
              <div className={`w-9 h-9 rounded-lg ${stat.iconBg} flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              {stat.trend && (
                <div className={`flex items-center gap-1 text-xs font-medium ${stat.up ? 'text-success' : 'text-destructive'}`}>
                  {stat.up
                    ? <ArrowUpRight className="w-3 h-3" />
                    : <ArrowDownRight className="w-3 h-3" />
                  }
                  {stat.trend}
                </div>
              )}
            </div>
            <div className={`text-2xl font-bold mb-1 ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-muted-foreground">{stat.label}</div>
            <div className="text-xs text-muted-foreground/60 mt-0.5">{stat.sub}</div>
          </div>
        ))}
      </div>

      {/* Bottom grid */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Recent sales */}
        <div className="lg:col-span-2 bg-surface rounded-xl border border-border">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Últimas ventas</h2>
            <a href="/dashboard/ventas" className="text-xs text-accent hover:text-accent/80 transition-colors flex items-center gap-1">
              Ver todas <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
          <div className="divide-y divide-border">
            {data.ultimasVentas.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p>No hay ventas aún</p>
                <a href="/dashboard/ventas" className="text-accent text-xs mt-1 inline-block hover:underline">
                  Registrar primera venta →
                </a>
              </div>
            ) : (
              data.ultimasVentas.map((venta: any) => (
                <div key={venta.numero} className="flex items-center justify-between px-5 py-3 hover:bg-surface-raised transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{venta.cliente_nombre}</div>
                    <div className="text-xs text-muted-foreground">{venta.numero} · {formatRelativeDate(venta.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estadoColors[venta.estado] ?? 'text-muted-foreground bg-surface-overlay'}`}>
                      {venta.estado}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{formatCurrency(venta.total)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-surface rounded-xl border border-border">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Acciones rápidas</h2>
          </div>
          <div className="p-3 space-y-1">
            {[
              { href: '/dashboard/ventas?new=1', icon: ShoppingCart, label: 'Nueva venta', color: 'text-accent' },
              { href: '/dashboard/cotizaciones?new=1', icon: FileText, label: 'Nueva cotización', color: 'text-foreground' },
              { href: '/dashboard/clientes?new=1', icon: Users, label: 'Nuevo cliente', color: 'text-foreground' },
              { href: '/dashboard/inventario?new=1', icon: Package, label: 'Agregar producto', color: 'text-foreground' },
              { href: '/dashboard/entregas?new=1', icon: Truck, label: 'Nueva entrega', color: 'text-foreground' },
            ].map((action) => (
              <a
                key={action.href}
                href={action.href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-raised transition-colors group"
              >
                <div className="w-7 h-7 rounded-md bg-surface-overlay flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                  <action.icon className={`w-4 h-4 ${action.color}`} />
                </div>
                <span className="text-sm text-foreground">{action.label}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>

          {/* Alerts */}
          {data.cotizacionesActivas > 0 && (
            <div className="mx-3 mb-3 mt-2 p-3 rounded-lg bg-warning/10 border border-warning/20 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-warning">
                  {data.cotizacionesActivas} cotizacion{data.cotizacionesActivas > 1 ? 'es' : ''} activa{data.cotizacionesActivas > 1 ? 's' : ''}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Esperando respuesta del cliente</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
