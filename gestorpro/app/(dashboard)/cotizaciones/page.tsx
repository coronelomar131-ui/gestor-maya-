'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, FileText, X, Loader2, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import type { Cotizacion, Producto, Cliente } from '@/types'
import toast from 'react-hot-toast'

const ESTADO_COLORS = {
  borrador: 'text-muted-foreground bg-surface-overlay border-border',
  enviada: 'text-accent bg-accent/10 border-accent/20',
  aceptada: 'text-success bg-success/10 border-success/20',
  rechazada: 'text-destructive bg-destructive/10 border-destructive/20',
  expirada: 'text-muted-foreground bg-surface-raised border-border',
} as const

export default function CotizacionesPage() {
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    cliente_nombre: '', descuento: 0, validez_dias: 15, notas: '',
    items: [] as { producto_id: string; nombre: string; sku?: string; cantidad: number; precio_unitario: number; subtotal: number }[],
  })

  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) return
    const [{ data: c }, { data: cl }, { data: p }] = await Promise.all([
      supabase.from('cotizaciones').select('*').eq('org_id', profile.org_id).order('created_at', { ascending: false }),
      supabase.from('clientes').select('id, nombre').eq('org_id', profile.org_id).order('nombre'),
      supabase.from('productos').select('id, nombre, sku, precio_venta').eq('org_id', profile.org_id).eq('activo', true).order('nombre'),
    ])
    setCotizaciones((c as Cotizacion[]) || [])
    setClientes((cl as Cliente[]) || [])
    setProductos((p as Producto[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const subtotal = form.items.reduce((s, i) => s + i.subtotal, 0)
  const total = subtotal - form.descuento

  function addItem(p: Producto) {
    setForm(f => {
      const ex = f.items.findIndex(i => i.producto_id === p.id)
      if (ex >= 0) {
        const items = [...f.items]
        items[ex].cantidad++
        items[ex].subtotal = items[ex].cantidad * items[ex].precio_unitario
        return { ...f, items }
      }
      return { ...f, items: [...f.items, { producto_id: p.id, nombre: p.nombre, sku: p.sku, cantidad: 1, precio_unitario: p.precio_venta, subtotal: p.precio_venta }] }
    })
  }

  async function handleSave() {
    if (!form.cliente_nombre.trim() || form.items.length === 0) return toast.error('Completa los campos requeridos')
    setSaving(true)
    const { data: profile } = await supabase.from('profiles').select('org_id, id, name').single()
    if (!profile) { setSaving(false); return }
    const { count } = await supabase.from('cotizaciones').select('*', { count: 'exact', head: true }).eq('org_id', profile.org_id)
    const numero = `COT-${String((count ?? 0) + 1).padStart(5, '0')}`
    const { error } = await supabase.from('cotizaciones').insert({
      org_id: profile.org_id, numero,
      cliente_nombre: form.cliente_nombre,
      vendedor_id: profile.id, vendedor_nombre: profile.name,
      items: form.items, subtotal, descuento: form.descuento, total,
      validez_dias: form.validez_dias, notas: form.notas || null, estado: 'borrador',
    })
    if (error) toast.error('Error al guardar')
    else { toast.success(`Cotización ${numero} creada`); setShowModal(false); setForm({ cliente_nombre: '', descuento: 0, validez_dias: 15, notas: '', items: [] }); loadData() }
    setSaving(false)
  }

  const filtered = cotizaciones.filter(c =>
    c.cliente_nombre.toLowerCase().includes(search.toLowerCase()) || c.numero.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cotizaciones</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{cotizaciones.length} cotizaciones</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all hover:shadow-glow-accent">
          <Plus className="w-4 h-4" /> Nueva cotización
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Buscar cotizaciones..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-raised">
              {['Folio', 'Cliente', 'Vendedor', 'Estado', 'Total', 'Válida hasta', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={7} className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="py-16 text-center text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No hay cotizaciones</p>
              </td></tr>
            ) : filtered.map(c => {
              const expDate = new Date(c.created_at)
              expDate.setDate(expDate.getDate() + c.validez_dias)
              return (
                <tr key={c.id} className="table-row-hover">
                  <td className="px-4 py-3 font-mono text-xs text-accent font-medium">{c.numero}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{c.cliente_nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.vendedor_nombre}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ESTADO_COLORS[c.estado]}`}>
                      {c.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-semibold text-foreground">{formatCurrency(c.total)}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(expDate)}</td>
                  <td className="px-4 py-3">
                    <button className="text-muted-foreground hover:text-accent transition-colors p-1 rounded">
                      <Download className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal (simplified) */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-modal animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Nueva cotización</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Cliente *</label>
                <input type="text" value={form.cliente_nombre} onChange={e => setForm(f => ({ ...f, cliente_nombre: e.target.value }))}
                  list="clientes-cot" placeholder="Nombre del cliente"
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                <datalist id="clientes-cot">{clientes.map(c => <option key={c.id} value={c.nombre} />)}</datalist>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Productos *</label>
                <input type="text" list="productos-cot" placeholder="Buscar y agregar producto..."
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                  onChange={e => {
                    const found = productos.find(p => p.nombre.toLowerCase() === e.target.value.toLowerCase())
                    if (found) { addItem(found); e.target.value = '' }
                  }} />
                <datalist id="productos-cot">{productos.map(p => <option key={p.id} value={p.nombre} />)}</datalist>

                {form.items.length > 0 && (
                  <div className="border border-border rounded-lg overflow-hidden mt-2">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-surface-raised border-b border-border">
                        <th className="text-left px-3 py-2 text-xs text-muted-foreground">Producto</th>
                        <th className="text-center px-3 py-2 text-xs text-muted-foreground">Cant.</th>
                        <th className="text-right px-3 py-2 text-xs text-muted-foreground">Total</th>
                        <th />
                      </tr></thead>
                      <tbody className="divide-y divide-border">
                        {form.items.map((item, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-foreground text-sm">{item.nombre}</td>
                            <td className="px-3 py-2 text-center">
                              <input type="number" min="1" value={item.cantidad} onChange={e => {
                                const items = [...form.items]; items[i].cantidad = parseInt(e.target.value) || 1; items[i].subtotal = items[i].cantidad * items[i].precio_unitario
                                setForm(f => ({ ...f, items }))
                              }} className="w-12 text-center bg-surface border border-border rounded px-1 py-0.5 text-sm focus:outline-none" />
                            </td>
                            <td className="px-3 py-2 text-right text-foreground">{formatCurrency(item.subtotal)}</td>
                            <td className="px-2 py-2">
                              <button onClick={() => setForm(f => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                                className="text-muted-foreground hover:text-destructive"><X className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex justify-between px-3 py-2 border-t border-border bg-surface-raised text-sm font-bold text-foreground">
                      <span>Total</span>
                      <span className="text-accent">{formatCurrency(total)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Descuento ($)</label>
                  <input type="number" min="0" value={form.descuento} onChange={e => setForm(f => ({ ...f, descuento: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Validez (días)</label>
                  <input type="number" min="1" value={form.validez_dias} onChange={e => setForm(f => ({ ...f, validez_dias: parseInt(e.target.value) || 15 }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar cotización
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
