'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, DollarSign, X, Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import type { Prestamo } from '@/types'
import toast from 'react-hot-toast'

const ESTADO_COLORS = {
  activo: 'text-accent bg-accent/10 border-accent/20',
  pagado: 'text-success bg-success/10 border-success/20',
  vencido: 'text-destructive bg-destructive/10 border-destructive/20',
}

export default function FinanzasPage() {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ descripcion: '', cliente_nombre: '', monto: 0, tasa_interes: 0, fecha_vencimiento: '' })

  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) return
    const { data } = await supabase.from('prestamos').select('*').eq('org_id', profile.org_id).order('created_at', { ascending: false })
    setPrestamos((data as Prestamo[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    if (!form.descripcion || !form.cliente_nombre || !form.monto) return toast.error('Completa los campos requeridos')
    setSaving(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) { setSaving(false); return }
    const { error } = await supabase.from('prestamos').insert({ ...form, org_id: profile.org_id, estado: 'activo', monto_pagado: 0 })
    if (error) toast.error('Error al guardar')
    else { toast.success('Préstamo registrado'); setShowModal(false); loadData() }
    setSaving(false)
  }

  const totalActivo = prestamos.filter(p => p.estado === 'activo').reduce((s, p) => s + (p.monto - p.monto_pagado), 0)

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Finanzas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Por cobrar: <span className="text-accent font-semibold">{formatCurrency(totalActivo)}</span></p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all hover:shadow-glow-accent">
          <Plus className="w-4 h-4" /> Nuevo préstamo
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {prestamos.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay préstamos registrados</p>
            </div>
          ) : prestamos.map(p => {
            const saldo = p.monto - p.monto_pagado
            const pct = (p.monto_pagado / p.monto) * 100
            return (
              <div key={p.id} className="bg-surface rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="font-semibold text-foreground">{p.descripcion}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{p.cliente_nombre}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ESTADO_COLORS[p.estado]}`}>
                    {p.estado}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                  <div><div className="text-xs text-muted-foreground mb-0.5">Monto total</div><div className="font-semibold text-foreground">{formatCurrency(p.monto)}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-0.5">Pagado</div><div className="font-semibold text-success">{formatCurrency(p.monto_pagado)}</div></div>
                  <div><div className="text-xs text-muted-foreground mb-0.5">Saldo</div><div className="font-semibold text-accent">{formatCurrency(saldo)}</div></div>
                </div>
                <div className="h-1.5 bg-surface-raised rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                {p.fecha_vencimiento && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Vence: {formatDate(p.fecha_vencimiento)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-md shadow-modal animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Nuevo préstamo</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {[
                { key: 'descripcion', label: 'Descripción *', placeholder: 'Ej. Crédito de mercancía' },
                { key: 'cliente_nombre', label: 'Cliente *', placeholder: 'Nombre del deudor' },
              ].map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <input type="text" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Monto *</label>
                  <input type="number" min="0" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Tasa de interés (%)</label>
                  <input type="number" min="0" step="0.1" value={form.tasa_interes} onChange={e => setForm(f => ({ ...f, tasa_interes: parseFloat(e.target.value) || 0 }))}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Fecha de vencimiento</label>
                <input type="date" value={form.fecha_vencimiento} onChange={e => setForm(f => ({ ...f, fecha_vencimiento: e.target.value }))}
                  className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
