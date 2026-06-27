'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Package, AlertTriangle, X, Loader2, TrendingDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/format'
import type { Producto, Proveedor } from '@/types'
import toast from 'react-hot-toast'

export default function InventarioPage() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterBajoStock, setFilterBajoStock] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editProduct, setEditProduct] = useState<Producto | null>(null)

  const [form, setForm] = useState({
    nombre: '', descripcion: '', sku: '', precio_venta: 0,
    precio_costo: 0, stock: 0, stock_minimo: 5,
    categoria: '', proveedor_id: '',
  })

  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) return

    const [{ data: p }, { data: prov }] = await Promise.all([
      supabase.from('productos').select('*').eq('org_id', profile.org_id).order('nombre'),
      supabase.from('proveedores').select('id, nombre').eq('org_id', profile.org_id).order('nombre'),
    ])

    setProductos((p as Producto[]) || [])
    setProveedores((prov as Proveedor[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function openNew() {
    setEditProduct(null)
    setForm({ nombre: '', descripcion: '', sku: '', precio_venta: 0, precio_costo: 0, stock: 0, stock_minimo: 5, categoria: '', proveedor_id: '' })
    setShowModal(true)
  }

  function openEdit(p: Producto) {
    setEditProduct(p)
    setForm({
      nombre: p.nombre, descripcion: p.descripcion || '', sku: p.sku || '',
      precio_venta: p.precio_venta, precio_costo: p.precio_costo || 0,
      stock: p.stock, stock_minimo: p.stock_minimo,
      categoria: p.categoria || '', proveedor_id: p.proveedor_id || '',
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) return toast.error('El nombre es requerido')
    setSaving(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) { setSaving(false); return }

    const payload = { ...form, org_id: profile.org_id, proveedor_id: form.proveedor_id || null }

    const { error } = editProduct
      ? await supabase.from('productos').update(payload).eq('id', editProduct.id)
      : await supabase.from('productos').insert(payload)

    if (error) {
      toast.error(error.message.includes('unique') ? 'El SKU ya existe' : 'Error al guardar')
    } else {
      toast.success(editProduct ? 'Producto actualizado' : 'Producto agregado')
      setShowModal(false)
      loadData()
    }
    setSaving(false)
  }

  const filtered = productos.filter(p => {
    const matchSearch = p.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.categoria ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStock = !filterBajoStock || p.stock <= p.stock_minimo
    return matchSearch && matchStock
  })

  const totalProductos = productos.length
  const bajosStock = productos.filter(p => p.stock <= p.stock_minimo).length
  const valorInventario = productos.reduce((s, p) => s + p.stock * p.precio_venta, 0)

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventario</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{totalProductos} productos · Valor: {formatCurrency(valorInventario)}</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all hover:shadow-glow-accent"
        >
          <Plus className="w-4 h-4" />
          Agregar producto
        </button>
      </div>

      {/* Alert */}
      {bajosStock > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-warning/30 bg-warning/5 text-warning">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="font-semibold">{bajosStock} producto{bajosStock > 1 ? 's' : ''} con stock bajo</span>
            <button onClick={() => setFilterBajoStock(true)} className="ml-2 underline text-sm opacity-80 hover:opacity-100">
              Ver solo esos
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por nombre, SKU o categoría..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
        <button
          onClick={() => setFilterBajoStock(f => !f)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
            filterBajoStock
              ? 'bg-warning/10 border-warning/30 text-warning'
              : 'bg-surface border-border text-muted-foreground hover:text-foreground hover:border-accent/30'
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          Stock bajo
        </button>
      </div>

      {/* Grid / Table */}
      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-raised">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Producto</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">SKU</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Categoría</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Precio</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Stock</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading ? (
              <tr><td colSpan={6} className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-16 text-center text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay productos</p>
                </td>
              </tr>
            ) : filtered.map((p) => {
              const bajStock = p.stock <= p.stock_minimo
              return (
                <tr key={p.id} className="table-row-hover" onClick={() => openEdit(p)}>
                  <td className="px-4 py-3 font-medium text-foreground">{p.nombre}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.sku || '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.categoria || '—'}</td>
                  <td className="px-4 py-3 text-right text-foreground">{formatCurrency(p.precio_venta)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      bajStock ? 'text-destructive bg-destructive/10' : 'text-success bg-success/10'
                    }`}>
                      {p.stock}
                    </span>
                    {bajStock && <AlertTriangle className="w-3.5 h-3.5 text-warning inline ml-1" />}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{formatCurrency(p.stock * p.precio_venta)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-modal animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{editProduct ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Nombre *</label>
                <input type="text" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">SKU</label>
                  <input type="text" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Categoría</label>
                  <input type="text" value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Precio de venta *</label>
                  <input type="number" min="0" step="0.01" value={form.precio_venta} onChange={e => setForm(f => ({ ...f, precio_venta: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Precio de costo</label>
                  <input type="number" min="0" step="0.01" value={form.precio_costo} onChange={e => setForm(f => ({ ...f, precio_costo: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Stock actual</label>
                  <input type="number" min="0" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Stock mínimo</label>
                  <input type="number" min="0" value={form.stock_minimo} onChange={e => setForm(f => ({ ...f, stock_minimo: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Proveedor</label>
                <select value={form.proveedor_id} onChange={e => setForm(f => ({ ...f, proveedor_id: e.target.value }))}
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent">
                  <option value="">Sin proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editProduct ? 'Actualizar' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
