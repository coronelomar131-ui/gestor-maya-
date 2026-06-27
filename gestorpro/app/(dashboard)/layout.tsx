import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { initials } from '@/lib/utils/format'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, organizations(name)')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  const org = profile.organizations as { name: string } | null

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        orgName={org?.name ?? 'Mi Empresa'}
        userName={profile.name}
        userRole={profile.role}
        userInitials={initials(profile.name)}
      />

      {/* Main content — offset by sidebar width */}
      <main className="ml-56 min-h-screen">
        <div className="p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
