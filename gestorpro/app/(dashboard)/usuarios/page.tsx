'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Users, Shield, X, Loader2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatRelativeDate, initials } from '@/lib/utils/format'
import type { User, UserRole } from '@/types'
import toast from 'react-hot-toast'

const ROLES = {
  admin: { label: 'Administrador', desc: 'Acceso total', color: 'text-accent bg-accent/10' },
  vendedor: { label: 'Vendedor', desc: 'Ventas y clientes', color: 'text-success bg-success/10' },
  almacen: { label: 'Almacén', desc: 'Inventario y entregas', color: 'text-warning bg-warning/10' },
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', role: 'vendedor' as UserRole, password: '' })

  const supabase = createClient()

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) return
    const { data } = await supabase.from('profiles').select('*').eq('org_id', profile.org_id).order('name')
    setUsuarios((data as User[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleSave() {
    if (!form.nombre || !form.email || !form.password) return toast.error('Todos los campos son requeridos')
    setSaving(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) { setSaving(false); return }

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { name: form.nombre, org_id: profile.org_id, role: form.role },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })

    if (error) toast.error(error.message.includes('already') ? 'Email ya registrado' : error.message)
    else { toast.success(`Usuario ${form.nombre} invitado`); setShowModal(false); loadData() }
    setSaving(false)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Usuarios</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{usuarios.length} usuarios en tu organización</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-accent/90 transition-all hover:shadow-glow-accent">
          <Plus className="w-4 h-4" /> Invitar usuario
        </button>
      </div>

      {/* Role explanation */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(ROLES).map(([role, info]) => (
          <div key={role} className="bg-surface rounded-xl border border-border p-3">
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium mb-2 ${info.color}`}>
              <Shield className="w-3 h-3" />
              {info.label}
            </div>
            <p className="text-xs text-muted-foreground">{info.desc}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="bg-surface rounded-xl border border-border divide-y divide-border">
          {usuarios.map(u => (
            <div key={u.id} className="flex items-center gap-4 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center text-sm font-bold text-accent flex-shrink-0">
                {initials(u.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
              <div className={`text-xs px-2 py-1 rounded-md font-medium ${ROLES[u.role as UserRole]?.color ?? 'text-muted-foreground bg-surface-raised'}`}>
                {ROLES[u.role as UserRole]?.label ?? u.role}
              </div>
              <div className={`w-2 h-2 rounded-full ${u.active ? 'bg-success' : 'bg-muted-foreground'}`} title={u.active ? 'Activo' : 'Inactivo'} />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-surface border border-border rounded-xl w-full max-w-md shadow-modal animate-scale-in">
            <div className="flex items-center justify-between p-5 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Invitar usuario</h2>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {[
                { key: 'nombre', label: 'Nombre completo *', placeholder: 'Juan Pérez' },
                { key: 'email', label: 'Correo electrónico *', placeholder: 'usuario@empresa.com', type: 'email' },
                { key: 'password', label: 'Contraseña temporal *', placeholder: 'Mínimo 8 caracteres', type: 'password' },
              ].map(({ key, label, placeholder, type = 'text' }) => (
                <div key={key} className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                    className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
                </div>
              ))}

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Rol *</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(ROLES).map(([role, info]) => (
                    <button key={role} type="button" onClick={() => setForm(f => ({ ...f, role: role as UserRole }))}
                      className={`p-2.5 rounded-lg border text-xs font-medium transition-all ${form.role === role ? 'border-accent bg-accent/10 text-accent' : 'border-border bg-surface-raised text-muted-foreground hover:border-accent/30'}`}>
                      {form.role === role && <Check className="w-3 h-3 mx-auto mb-1 text-accent" />}
                      {info.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-border">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 disabled:opacity-50">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Invitar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
