import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Toaster } from 'react-hot-toast'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'GestorPro — ERP para distribuidores',
    template: '%s | GestorPro',
  },
  description: 'Sistema de gestión empresarial para distribuidores y tiendas. Ventas, inventario, clientes y más.',
  keywords: ['ERP', 'gestión empresarial', 'inventario', 'ventas', 'México'],
  authors: [{ name: 'GestorPro' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    locale: 'es_MX',
    title: 'GestorPro — ERP para distribuidores',
    description: 'Gestiona ventas, inventario y clientes en un solo lugar.',
    siteName: 'GestorPro',
  },
}

export const viewport: Viewport = {
  themeColor: '#00C4D4',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: 'hsl(220 15% 11%)',
              color: 'hsl(210 20% 92%)',
              border: '1px solid hsl(220 12% 18%)',
              borderRadius: '8px',
              fontSize: '13px',
              fontFamily: 'Inter, system-ui, sans-serif',
            },
            success: {
              iconTheme: { primary: '#22C55E', secondary: 'transparent' },
            },
            error: {
              iconTheme: { primary: '#EF4444', secondary: 'transparent' },
            },
          }}
        />
      </body>
    </html>
  )
}
