'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Users, Phone, Mail, MapPin, X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatRelativeDate, initials } from '@/lib/utils/format'
import type { Cliente } from '@/types'
import toast from 'react-hot-toast'

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState<Cliente | null>(null)

  const [form, setForm] = useState({
    nombre: '', telefono: '', email: '', direccion: '', ciudad: '', rfc: '', notas: '',
  })

  const supabase = createClient()

  const loadClientes = useCallback(async () => {
    setLoading(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) return
    const { data } = await supabase
      .from('clientes').select('*').eq('org_id', profile.org_id).order('nombre')
    setClientes((data as Cliente[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadClientes() }, [loadClientes])

  function openNew() {
    setSelected(null)
    setForm({ nombre: '', telefono: '', email: '', direccion: '', ciudad: '', rfc: '', notas: '' })
    setShowModal(true)
  }

  function openEdit(c: Cliente) {
    setSelected(c)
    setForm({ nombre: c.nombre, telefono: c.telefono || '', email: c.email || '', direccion: c.direccion || '', ciudad: c.ciudad || '', rfc: c.rfc || '', notas: c.notas || '' })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.nombre.trim()) return toast.error('El nombre es requerido')
    setSaving(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) { setSaving(false); return }

    const payload = { ...form, org_id: profile.org_id }
    const { error } = selected
      ? await supabase.from('clientes').update(payload).eq('id', selected.id)
      : await supabase.from('clientes').insert(payload)

    if (error) { toast.error('Error al guardar') }
    else { toast.success(selected ? 'Cliente actualizado' : 'Cliente agregado'); setShowModal(false); loadClientes() }
    setSaving(false)
  }

  const filtered = clientes.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (c.telefono ?? '').includes(search) ||
    (c.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Clientes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{clientes.length} clientes registrados</p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all hover:shadow-glow-accent">
          <Plus className="w-4 h-4" />
          Nuevo cliente
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input type="text" placeholder="Buscar por nombre, teléfono o email..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full bg-surface border border-border rounded-lg pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-3 py-16 text-center text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No hay clientes{search ? ' con esa búsqueda' : ''}</p>
            </div>
          ) : filtered.map((c) => (
            <div key={c.id} onClick={() => openEdit(c)}
              className="bg-surface rounded-xl border border-border p-4 hover:border-accent/30 hover:shadow-card-hover transition-all cursor-pointer">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center text-sm font-bold text-accent flex-shrink-0">
                  {initials(c.nombre)}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-foreground truncate">{c.nombre}</div>
                  {c.ciudad && <div className="text-xs text-muted-foreground mt-0.5">{c.ciudad}</div>}
                </div>
              </div>
              <div className="space-y-1.5">
                {c.telefono && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="w-3.5 h-3.5" /> {c.telefono}
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" /> <span className="truncate">{c.email}</span>
                  </div>
                )}
              </div>
              {c.total_compras > 0 && (
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Total compras</span>
                  <span className="text-sm font-semibold text-accent">{formatCurrency(c.total_compras)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-md shadow-modal animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">{selected ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {[
                { key: 'nombre', label: 'Nombre *', placeholder: 'Nombre completo o empresa' },
                { key: 'telefono', label: 'Teléfono', placeholder: '+52 55 0000 0000' },
                { key: 'email', label: 'Email', placeholder: 'cliente@empresa.com' },
                { key: 'direccion', label: 'Dirección', placeholder: 'Calle, colonia, número' },
                { key: 'ciudad', label: 'Ciudad', placeholder: 'Ciudad de México' },
                { key: 'rfc', label: 'RFC', placeholder: 'XAXX010101000' },
              ].map(({ key, label, placeholder }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <input type="text" value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
              ))}
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
                {selected ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
