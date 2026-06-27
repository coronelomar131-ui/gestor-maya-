'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Truck, X, Loader2, MapPin, Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeDate } from '@/lib/utils/format'
import type { Entrega } from '@/types'
import toast from 'react-hot-toast'

const ESTADO_CONFIG = {
  pendiente:    { label: 'Pendiente',    color: 'text-warning bg-warning/10 border-warning/20' },
  en_transito:  { label: 'En tránsito',  color: 'text-accent bg-accent/10 border-accent/20' },
  entregado:    { label: 'Entregado',    color: 'text-success bg-success/10 border-success/20' },
  cancelado:    { label: 'Cancelado',    color: 'text-destructive bg-destructive/10 border-destructive/20' },
} as const

export default function EntregasPage() {
  const [entregas, setEntregas] = useState<Entrega[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState<string>('all')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    cliente_nombre: '', cliente_telefono: '', direccion: '',
    siniestros: '', repartidor: '', notas: '',
    items: [{ nombre: '', cantidad: 1 }],
  })

  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) return
    const { data } = await supabase.from('entregas').select('*').eq('org_id', profile.org_id).order('created_at', { ascending: false })
    setEntregas((data as Entrega[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    if (!form.cliente_nombre.trim() || !form.direccion.trim()) return toast.error('Cliente y dirección son requeridos')
    setSaving(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) { setSaving(false); return }

    const { count } = await supabase.from('entregas').select('*', { count: 'exact', head: true }).eq('org_id', profile.org_id)
    const numero = `ENT-${String((count ?? 0) + 1).padStart(5, '0')}`

    const { error } = await supabase.from('entregas').insert({
      org_id: profile.org_id, numero,
      cliente_nombre: form.cliente_nombre, cliente_telefono: form.cliente_telefono || null,
      direccion: form.direccion,
      siniestros: form.siniestros ? form.siniestros.split(',').map(s => s.trim()).filter(Boolean) : [],
      items: form.items.filter(i => i.nombre.trim()),
      repartidor: form.repartidor || null, notas: form.notas || null,
      estado: 'pendiente',
    })

    if (error) { toast.error('Error al guardar') }
    else { toast.success(`Entrega ${numero} creada`); setShowModal(false); loadData() }
    setSaving(false)
  }

  async function cambiarEstado(id: string, estado: Entrega['estado']) {
    const updates: any = { estado }
    if (estado === 'entregado') updates.entregado_at = new Date().toISOString()
    const { error } = await supabase.from('entregas').update(updates).eq('id', id)
    if (error) toast.error('Error al actualizar')
    else { toast.success(`Estado actualizado a ${ESTADO_CONFIG[estado].label}`); loadData() }
  }

  const filtered = entregas.filter(e => {
    const matchSearch = e.cliente_nombre.toLowerCase().includes(search.toLowerCase()) ||
      e.numero.toLowerCase().includes(search.toLowerCase()) ||
      (e.siniestros ?? []).some(s => s.toLowerCase().includes(search.toLowerCase()))
    const matchEstado = filterEstado === 'all' || e.estado === filterEstado
    return matchSearch && matchEstado
  })

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Entregas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {entregas.filter(e => e.estado === 'pendiente').length} pendientes ·{' '}
            {entregas.filter(e => e.estado === 'en_transito').length} en tránsito
          </p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all hover:shadow-glow-accent">
          <Plus className="w-4 h-4" /> Nueva entrega
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input type="text" placeholder="Buscar por cliente, folio o siniestro..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
        </div>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
          className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent">
          <option value="all">Todos</option>
          {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Truck className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No hay entregas</p>
          </div>
        ) : filtered.map((e) => (
          <div key={e.id} className="bg-surface rounded-xl border border-border p-4 hover:border-border hover:shadow-card-hover transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs text-accent font-medium">{e.numero}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ESTADO_CONFIG[e.estado].color}`}>
                    {ESTADO_CONFIG[e.estado].label}
                  </span>
                </div>
                <div className="font-semibold text-foreground mb-2">{e.cliente_nombre}</div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {e.direccion}</div>
                  {e.cliente_telefono && <div className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> {e.cliente_telefono}</div>}
                  {e.siniestros?.length > 0 && (
                    <div>Siniestros: <span className="font-mono">{e.siniestros.join(', ')}</span></div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-shrink-0">
                {e.estado === 'pendiente' && (
                  <button onClick={() => cambiarEstado(e.id, 'en_transito')}
                    className="text-xs px-3 py-1.5 rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors font-medium">
                    → En tránsito
                  </button>
                )}
                {e.estado === 'en_transito' && (
                  <button onClick={() => cambiarEstado(e.id, 'entregado')}
                    className="text-xs px-3 py-1.5 rounded-lg bg-success/10 text-success border border-success/20 hover:bg-success/20 transition-colors font-medium">
                    ✓ Marcar entregado
                  </button>
                )}
                <div className="text-xs text-muted-foreground text-right">{formatRelativeDate(e.created_at)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-modal animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Nueva entrega</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {[
                { key: 'cliente_nombre', label: 'Cliente *', placeholder: 'Nombre del cliente' },
                { key: 'cliente_telefono', label: 'Teléfono', placeholder: '+52 55 0000 0000' },
                { key: 'direccion', label: 'Dirección *', placeholder: 'Calle, colonia, número' },
                { key: 'siniestros', label: 'Siniestros', placeholder: 'SIN-001, SIN-002 (separados por coma)' },
                { key: 'repartidor', label: 'Repartidor', placeholder: 'Nombre del repartidor' },
              ].map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <input type="text" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
              ))}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Artículos</label>
                {form.items.map((item, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={item.nombre} onChange={e => {
                      const items = [...form.items]; items[i].nombre = e.target.value; setForm(f => ({ ...f, items }))
                    }} placeholder="Artículo" className="flex-1 bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                    <input type="number" min="1" value={item.cantidad} onChange={e => {
                      const items = [...form.items]; items[i].cantidad = parseInt(e.target.value) || 1; setForm(f => ({ ...f, items }))
                    }} className="w-16 bg-surface-raised border border-border rounded-lg px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                  </div>
                ))}
                <button onClick={() => setForm(f => ({ ...f, items: [...f.items, { nombre: '', cantidad: 1 }] }))}
                  className="text-xs text-accent hover:text-accent/80 transition-colors">
                  + Agregar artículo
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Notas</label>
                <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
