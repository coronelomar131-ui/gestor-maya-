'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Filter, Download, Eye, ShoppingCart, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, formatRelativeDate } from '@/lib/utils/format'
import type { Venta, VentaItem, Cliente, Producto } from '@/types'
import toast from 'react-hot-toast'

const ESTADO_COLORS = {
  pagado: 'text-success bg-success/10 border-success/20',
  pendiente: 'text-warning bg-warning/10 border-warning/20',
  parcial: 'text-accent bg-accent/10 border-accent/20',
  cancelado: 'text-destructive bg-destructive/10 border-destructive/20',
} as const

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({
    cliente_nombre: '',
    cliente_id: '',
    tipo: 'contado' as 'contado' | 'credito',
    estado: 'pendiente' as Venta['estado'],
    siniestro: '',
    notas: '',
    descuento: 0,
    items: [] as VentaItem[],
  })

  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) return

    const [{ data: v }, { data: c }, { data: p }] = await Promise.all([
      supabase.from('ventas').select('*').eq('org_id', profile.org_id).order('created_at', { ascending: false }).limit(100),
      supabase.from('clientes').select('id, nombre, telefono').eq('org_id', profile.org_id).order('nombre'),
      supabase.from('productos').select('id, nombre, sku, precio_venta, stock').eq('org_id', profile.org_id).eq('activo', true).order('nombre'),
    ])

    setVentas((v as Venta[]) || [])
    setClientes((c as Cliente[]) || [])
    setProductos((p as Producto[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const addItem = (producto: Producto) => {
    setForm(f => {
      const existing = f.items.findIndex(i => i.producto_id === producto.id)
      if (existing >= 0) {
        const items = [...f.items]
        items[existing].cantidad += 1
        items[existing].subtotal = items[existing].cantidad * items[existing].precio_unitario
        return { ...f, items }
      }
      return {
        ...f,
        items: [...f.items, {
          producto_id: producto.id,
          nombre: producto.nombre,
          sku: producto.sku,
          cantidad: 1,
          precio_unitario: producto.precio_venta,
          subtotal: producto.precio_venta,
        }],
      }
    })
  }

  const removeItem = (idx: number) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  const updateItem = (idx: number, field: 'cantidad' | 'precio_unitario', val: number) => {
    setForm(f => {
      const items = [...f.items]
      items[idx] = { ...items[idx], [field]: val, subtotal: 0 }
      items[idx].subtotal = items[idx].cantidad * items[idx].precio_unitario
      return { ...f, items }
    })
  }

  const subtotal = form.items.reduce((s, i) => s + i.subtotal, 0)
  const total = subtotal - form.descuento

  async function handleSave() {
    if (!form.cliente_nombre.trim()) return toast.error('Ingresa el nombre del cliente')
    if (form.items.length === 0) return toast.error('Agrega al menos un producto')

    setSaving(true)
    const { data: profile } = await supabase.from('profiles').select('org_id, id, name').single()
    if (!profile) { setSaving(false); return }

    const { count } = await supabase.from('ventas').select('*', { count: 'exact', head: true }).eq('org_id', profile.org_id)
    const numero = `VTA-${String((count ?? 0) + 1).padStart(5, '0')}`

    const { error } = await supabase.from('ventas').insert({
      org_id: profile.org_id,
      numero,
      cliente_id: form.cliente_id || null,
      cliente_nombre: form.cliente_nombre,
      vendedor_id: profile.id,
      vendedor_nombre: profile.name,
      items: form.items,
      subtotal,
      descuento: form.descuento,
      total,
      tipo: form.tipo,
      estado: form.estado,
      siniestro: form.siniestro || null,
      notas: form.notas || null,
    })

    if (error) {
      toast.error('Error al guardar la venta')
      console.error(error)
    } else {
      toast.success(`Venta ${numero} guardada`)
      setShowModal(false)
      setForm({ cliente_nombre: '', cliente_id: '', tipo: 'contado', estado: 'pendiente', siniestro: '', notas: '', descuento: 0, items: [] })
      loadData()
    }
    setSaving(false)
  }

  const filtered = ventas.filter(v => {
    const matchSearch = v.cliente_nombre.toLowerCase().includes(search.toLowerCase()) ||
      v.numero.toLowerCase().includes(search.toLowerCase()) ||
      (v.siniestro ?? '').toLowerCase().includes(search.toLowerCase())
    const matchEstado = filterEstado === 'all' || v.estado === filterEstado
    return matchSearch && matchEstado
  })

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ventas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{ventas.length} ventas registradas</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all hover:shadow-glow-accent"
        >
          <Plus className="w-4 h-4" />
          Nueva venta
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por cliente, folio o siniestro..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>
        <select
          value={filterEstado}
          onChange={e => setFilterEstado(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="all">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="pagado">Pagado</option>
          <option value="parcial">Parcial</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-raised">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Folio</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Vendedor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Siniestro</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Estado</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-muted-foreground">
                    <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">{search ? 'Sin resultados para tu búsqueda' : 'No hay ventas registradas'}</p>
                  </td>
                </tr>
              ) : filtered.map((venta) => (
                <tr key={venta.id} className="table-row-hover">
                  <td className="px-4 py-3 font-mono text-xs text-accent font-medium">{venta.numero}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{venta.cliente_nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">{venta.vendedor_nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{venta.siniestro || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ESTADO_COLORS[venta.estado]}`}>
                      {venta.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-foreground">{formatCurrency(venta.total)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{formatRelativeDate(venta.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nueva Venta */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-modal animate-scale-in">
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-surface">
              <h2 className="text-lg font-semibold text-foreground">Nueva venta</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Cliente */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Cliente *</label>
                  <input
                    type="text"
                    placeholder="Nombre del cliente"
                    value={form.cliente_nombre}
                    onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))}
                    list="clientes-list"
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                  <datalist id="clientes-list">
                    {clientes.map(c => <option key={c.id} value={c.nombre} />)}
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Tipo de pago</label>
                  <select
                    value={form.tipo}
                    onChange={e => setForm(f => ({ ...f, tipo: e.target.value as any }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="contado">Contado</option>
                    <option value="credito">Crédito</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Estado</label>
                  <select
                    value={form.estado}
                    onChange={e => setForm(f => ({ ...f, estado: e.target.value as any }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="pagado">Pagado</option>
                    <option value="parcial">Pago parcial</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Siniestro</label>
                  <input
                    type="text"
                    placeholder="Ej. SIN-2025-001"
                    value={form.siniestro}
                    onChange={e => setForm(f => ({ ...f, siniestro: e.target.value }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Descuento ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.descuento}
                    onChange={e => setForm(f => ({ ...f, descuento: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
              </div>

              {/* Products */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-2">Productos *</label>

                {/* Product search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar y agregar producto..."
                    list="productos-list"
                    className="w-full bg-surface-raised border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    onChange={e => {
                      const found = productos.find(p =>
                        p.nombre.toLowerCase() === e.target.value.toLowerCase() ||
                        p.sku?.toLowerCase() === e.target.value.toLowerCase()
                      )
                      if (found) {
                        addItem(found)
                        e.target.value = ''
                      }
                    }}
                  />
                  <datalist id="productos-list">
                    {productos.map(p => <option key={p.id} value={p.nombre} label={`SKU: ${p.sku || '—'} | Stock: ${p.stock} | ${formatCurrency(p.precio_venta)}`} />)}
                  </datalist>
                </div>

                {/* Items table */}
                {form.items.length > 0 ? (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-surface-raised border-b border-border">
                          <th className="text-left px-3 py-2 text-xs text-muted-foreground">Producto</th>
                          <th className="text-center px-3 py-2 text-xs text-muted-foreground">Cant.</th>
                          <th className="text-right px-3 py-2 text-xs text-muted-foreground">Precio</th>
                          <th className="text-right px-3 py-2 text-xs text-muted-foreground">Subtotal</th>
                          <th className="px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {form.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 text-foreground">{item.nombre}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                min="1"
                                value={item.cantidad}
                                onChange={e => updateItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                                className="w-14 text-center bg-surface border border-border rounded px-1 py-0.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.precio_unitario}
                                onChange={e => updateItem(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                                className="w-24 text-right bg-surface border border-border rounded px-1 py-0.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-foreground">{formatCurrency(item.subtotal)}</td>
                            <td className="px-2 py-2">
                              <button onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="border border-dashed border-border rounded-lg py-8 text-center text-muted-foreground text-sm">
                    Busca y agrega productos arriba
                  </div>
                )}

                {/* Totals */}
                {form.items.length > 0 && (
                  <div className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>{formatCurrency(subtotal)}</span>
                    </div>
                    {form.descuento > 0 && (
                      <div className="flex justify-between text-destructive">
                        <span>Descuento</span>
                        <span>- {formatCurrency(form.descuento)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-foreground text-base pt-2 border-t border-border">
                      <span>Total</span>
                      <span className="text-accent">{formatCurrency(total)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Notas</label>
                <textarea
                  rows={2}
                  placeholder="Observaciones adicionales..."
                  value={form.notas}
                  onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border sticky bottom-0 bg-surface">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Guardar venta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
