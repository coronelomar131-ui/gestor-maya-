'use client'

import { useState, useEffect } from 'react'
import { BarChart3, Download, Calendar, TrendingUp, Users, ShoppingCart, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts'

export default function ReportesPage() {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month')
  const [ventasPorDia, setVentasPorDia] = useState<any[]>([])
  const [ventasPorVendedor, setVentasPorVendedor] = useState<any[]>([])
  const [topProductos, setTopProductos] = useState<any[]>([])
  const [stats, setStats] = useState({ total: 0, count: 0, ticket_promedio: 0, nuevos_clientes: 0 })

  const supabase = createClient()

  useEffect(() => {
    loadReporte()
  }, [period])

  async function loadReporte() {
    setLoading(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) return

    const now = new Date()
    let startDate: Date
    if (period === 'week') startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    else startDate = new Date(now.getFullYear(), 0, 1)

    const { data: ventas } = await supabase
      .from('ventas')
      .select('*')
      .eq('org_id', profile.org_id)
      .gte('created_at', startDate.toISOString())
      .neq('estado', 'cancelado')
      .order('created_at')

    if (!ventas) { setLoading(false); return }

    // Ventas por día
    const byDay = ventas.reduce((acc: any, v) => {
      const day = v.created_at.split('T')[0]
      if (!acc[day]) acc[day] = { date: day, total: 0, count: 0 }
      acc[day].total += v.total
      acc[day].count += 1
      return acc
    }, {})
    setVentasPorDia(Object.values(byDay))

    // Ventas por vendedor
    const byVendedor = ventas.reduce((acc: any, v) => {
      const n = v.vendedor_nombre
      if (!acc[n]) acc[n] = { nombre: n, total: 0, count: 0 }
      acc[n].total += v.total
      acc[n].count += 1
      return acc
    }, {})
    setVentasPorVendedor(Object.values(byVendedor).sort((a: any, b: any) => b.total - a.total))

    // Top productos
    const byProducto: any = {}
    ventas.forEach(v => {
      (v.items as any[] || []).forEach((item: any) => {
        if (!byProducto[item.nombre]) byProducto[item.nombre] = { nombre: item.nombre, cantidad: 0, total: 0 }
        byProducto[item.nombre].cantidad += item.cantidad
        byProducto[item.nombre].total += item.subtotal
      })
    })
    setTopProductos(Object.values(byProducto).sort((a: any, b: any) => b.total - a.total).slice(0, 10))

    const total = ventas.reduce((s, v) => s + v.total, 0)
    setStats({ total, count: ventas.length, ticket_promedio: ventas.length ? total / ventas.length : 0, nuevos_clientes: 0 })
    setLoading(false)
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-surface-raised border border-border rounded-lg p-3 text-xs shadow-modal">
        <div className="text-muted-foreground mb-1">{label}</div>
        <div className="font-bold text-accent">{formatCurrency(payload[0].value)}</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reportes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Análisis de tu negocio</p>
        </div>
        <div className="flex gap-2">
          {(['week', 'month', 'year'] as const).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                period === p ? 'bg-accent text-accent-foreground' : 'bg-surface border border-border text-muted-foreground hover:text-foreground'
              }`}>
              {p === 'week' ? '7 días' : p === 'month' ? 'Este mes' : 'Este año'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Ingresos totales', value: formatCurrency(stats.total), icon: TrendingUp, color: 'text-accent' },
              { label: 'Ventas realizadas', value: stats.count.toString(), icon: ShoppingCart, color: 'text-foreground' },
              { label: 'Ticket promedio', value: formatCurrency(stats.ticket_promedio), icon: BarChart3, color: 'text-success' },
              { label: 'Vendedores activos', value: ventasPorVendedor.length.toString(), icon: Users, color: 'text-foreground' },
            ].map(kpi => (
              <div key={kpi.label} className="bg-surface rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  <span className="text-xs text-muted-foreground">{kpi.label}</span>
                </div>
                <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Chart ventas por día */}
          <div className="bg-surface rounded-xl border border-border p-5">
            <h3 className="font-semibold text-foreground mb-4">Ventas por día</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ventasPorDia} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 12% 18%)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#657489' }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 11, fill: '#657489' }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="total" fill="hsl(189 100% 42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {/* Por vendedor */}
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-semibold text-foreground mb-4">Ventas por vendedor</h3>
              <div className="space-y-3">
                {ventasPorVendedor.map((v, i) => {
                  const max = ventasPorVendedor[0]?.total || 1
                  return (
                    <div key={v.nombre}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm text-foreground">{v.nombre}</span>
                        <span className="text-sm font-semibold text-accent">{formatCurrency(v.total)}</span>
                      </div>
                      <div className="h-2 bg-surface-raised rounded-full overflow-hidden">
                        <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(v.total / max) * 100}%` }} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{v.count} ventas</div>
                    </div>
                  )
                })}
                {ventasPorVendedor.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin datos para el período</p>
                )}
              </div>
            </div>

            {/* Top productos */}
            <div className="bg-surface rounded-xl border border-border p-5">
              <h3 className="font-semibold text-foreground mb-4">Productos más vendidos</h3>
              <div className="space-y-2">
                {topProductos.slice(0, 8).map((p, i) => (
                  <div key={p.nombre} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
                    <span className="text-sm text-foreground flex-1 truncate">{p.nombre}</span>
                    <span className="text-xs text-muted-foreground">{p.cantidad} u.</span>
                    <span className="text-sm font-semibold text-accent">{formatCurrency(p.total)}</span>
                  </div>
                ))}
                {topProductos.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin datos para el período</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
