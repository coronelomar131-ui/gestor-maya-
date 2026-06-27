'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Users, Package, FileText,
  Truck, BarChart3, DollarSign, Settings, Zap, LogOut,
  Boxes, Building2, ChevronRight, Bell
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

const navItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/dashboard/ventas', icon: ShoppingCart, label: 'Ventas' },
  { href: '/dashboard/cotizaciones', icon: FileText, label: 'Cotizaciones' },
  { href: '/dashboard/clientes', icon: Users, label: 'Clientes' },
  { href: '/dashboard/inventario', icon: Package, label: 'Inventario' },
  { href: '/dashboard/proveedores', icon: Building2, label: 'Proveedores' },
  { href: '/dashboard/entregas', icon: Truck, label: 'Entregas' },
  { href: '/dashboard/reportes', icon: BarChart3, label: 'Reportes' },
  { href: '/dashboard/finanzas', icon: DollarSign, label: 'Finanzas', adminOnly: true },
]

const bottomItems = [
  { href: '/dashboard/usuarios', icon: Boxes, label: 'Usuarios' },
  { href: '/dashboard/configuracion', icon: Settings, label: 'Configuración' },
]

interface SidebarProps {
  orgName: string
  userName: string
  userRole: string
  userInitials: string
}

export function Sidebar({ orgName, userName, userRole, userInitials }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    toast.success('Sesión cerrada')
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-56 bg-sidebar border-r border-sidebar-border flex flex-col z-40">
      {/* Logo / Org */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-accent-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">{orgName}</div>
            <div className="text-xs text-muted-foreground">GestorPro</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          if (item.adminOnly && userRole !== 'admin') return null
          const active = isActive(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all group',
                active
                  ? 'bg-sidebar-active text-accent font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-hover'
              )}
            >
              <item.icon className={cn('w-4 h-4 flex-shrink-0', active ? 'text-accent' : '')} />
              <span className="truncate">{item.label}</span>
              {active && <ChevronRight className="w-3 h-3 ml-auto text-accent/60" />}
            </Link>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-sidebar-border p-2 space-y-0.5">
        {bottomItems.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all',
                active
                  ? 'bg-sidebar-active text-accent font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-sidebar-hover'
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}

        {/* User */}
        <div className="mt-2 pt-2 border-t border-sidebar-border">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-md">
            <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-foreground truncate">{userName}</div>
              <div className="text-xs text-muted-foreground capitalize">{userRole}</div>
            </div>
            <button
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-sidebar-hover"
              title="Cerrar sesión"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
