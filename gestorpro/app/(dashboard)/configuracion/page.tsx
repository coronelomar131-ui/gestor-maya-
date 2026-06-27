'use client'

import { useState, useEffect } from 'react'
import { Settings, Building2, Save, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

export default function ConfiguracionPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [org, setOrg] = useState({ name: '', phone: '', address: '', rfc: '' })

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: profile } = await supabase.from('profiles').select('org_id').single()
      if (!profile) return
      const { data } = await supabase.from('organizations').select('*').eq('id', profile.org_id).single()
      if (data) setOrg({ name: data.name, phone: data.phone || '', address: data.address || '', rfc: data.rfc || '' })
      setLoading(false)
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    const { data: profile } = await supabase.from('profiles').select('org_id').single()
    if (!profile) { setSaving(false); return }
    const { error } = await supabase.from('organizations').update(org).eq('id', profile.org_id)
    if (error) toast.error('Error al guardar')
    else toast.success('Configuración guardada')
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configuración</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Datos de tu empresa</p>
      </div>

      <div className="bg-surface rounded-xl border border-border p-6 space-y-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-5 h-5 text-accent" />
          <h2 className="font-semibold text-foreground">Información de la empresa</h2>
        </div>

        {[
          { key: 'name', label: 'Nombre de la empresa', placeholder: 'Mi Distribuidora S.A.' },
          { key: 'phone', label: 'Teléfono', placeholder: '+52 55 0000 0000' },
          { key: 'address', label: 'Dirección', placeholder: 'Calle, colonia, ciudad' },
          { key: 'rfc', label: 'RFC', placeholder: 'XAXX010101000' },
        ].map(({ key, label, placeholder }) => (
          <div key={key} className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{label}</label>
            <input type="text" value={(org as any)[key]} onChange={e => setOrg(o => ({ ...o, [key]: e.target.value }))} placeholder={placeholder}
              className="w-full bg-surface-raised border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
        ))}

        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2 rounded-lg text-sm font-semibold hover:bg-accent/90 transition-all hover:shadow-glow-accent disabled:opacity-50 mt-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar cambios
        </button>
      </div>
    </div>
  )
}
