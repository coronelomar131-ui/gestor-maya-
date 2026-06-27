'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Building2, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { initials } from '@/lib/utils/format'
import type { Proveedor } from '@/types'
import toast from 'react-hot-toast'

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Proveedor | null>(null)
  const [form, setForm] = useState({ nombre: '', contacto: '', telefono: '', email: '', direccion: '', rfc: '', notas: '' })

  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) return
    const { data } = await supabase.from('proveedores').select('*').eq('org_id', profile.org_id).order('nombre')
    setProveedores((data as Proveedor[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function openNew() {
    setSelected(null)
    setForm({ nombre: '', contacto: '', telefono: '', email: '', direccion: '', rfc: '', notas: '' })
    setShowModal(true)
  }

  function openEdit(p: Proveedor) {
    setSelected(p)
    setForm({ nombre: p.nombre, contacto: p.contacto || '', telefono: p.telefono || '', email: p.email || '', direccion: p.direccion || '', rfc: p.rfc || '', notas: p.notas || '' })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) return toast.error('El nombre es requerido')
    setSaving(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) { setSaving(false); return }
    const { error } = selected
      ? await supabase.from('proveedores').update({ ...form }).eq('id', selected.id)
      : await supabase.from('proveedores').insert({ ...form, org_id: profile.org_id })
    if (error) toast.error('Error al guardar')
    else { toast.success(selected ? 'Proveedor actualizado' : 'Proveedor agregado'); setShowModal(false); loadData() }
    setSaving(false)
  }

  const filtered = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (p.contacto ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Proveedores</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{proveedores.length} proveedores</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all hover:shadow-glow-accent">
          <Plus className="w-4 h-4" /> Nuevo proveedor
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Buscar proveedores..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-3 py-16 text-center text-muted-foreground">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay proveedores</p>
            </div>
          ) : filtered.map(p => (
            <div key={p.id} onClick={() => openEdit(p)}
              className="bg-surface rounded-xl border border-border p-4 hover:border-accent/30 hover:shadow-card-hover transition-all cursor-pointer">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-surface-overlay flex items-center justify-center text-sm font-bold text-muted-foreground flex-shrink-0">
                  {initials(p.nombre)}
                </div>
                <div>
                  <div className="font-semibold text-foreground">{p.nombre}</div>
                  {p.contacto && <div className="text-xs text-muted-foreground">{p.contacto}</div>}
                </div>
              </div>
              {p.telefono && <div className="text-xs text-muted-foreground">{p.telefono}</div>}
              {p.email && <div className="text-xs text-muted-foreground truncate">{p.email}</div>}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-md shadow-modal animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{selected ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {[
                { key: 'nombre', label: 'Nombre *', placeholder: 'Proveedor S.A.' },
                { key: 'contacto', label: 'Contacto', placeholder: 'Persona de contacto' },
                { key: 'telefono', label: 'Teléfono', placeholder: '+52 55 0000 0000' },
                { key: 'email', label: 'Email', placeholder: 'proveedor@empresa.com' },
                { key: 'direccion', label: 'Dirección', placeholder: 'Dirección de la empresa' },
                { key: 'rfc', label: 'RFC', placeholder: 'XAXX010101000' },
              ].map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <input type="text" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {selected ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
