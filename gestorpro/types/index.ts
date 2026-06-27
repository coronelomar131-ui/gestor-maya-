// ─── Core Entity Types ────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'vendedor' | 'almacen'
export type Plan = 'free' | 'pro' | 'enterprise'

export interface Organization {
  id: string
  name: string
  slug: string
  plan: Plan
  logo_url?: string
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  org_id: string
  email: string
  name: string
  role: UserRole
  avatar_url?: string
  active: boolean
  created_at: string
}

// ─── Business Entities ────────────────────────────────────────────────────────

export interface Cliente {
  id: string
  org_id: string
  nombre: string
  telefono?: string
  email?: string
  direccion?: string
  ciudad?: string
  rfc?: string
  notas?: string
  total_compras: number
  ultima_compra?: string
  created_at: string
  updated_at: string
}

export interface Producto {
  id: string
  org_id: string
  nombre: string
  descripcion?: string
  sku?: string
  precio_venta: number
  precio_costo?: number
  stock: number
  stock_minimo: number
  categoria?: string
  proveedor_id?: string
  imagen_url?: string
  activo: boolean
  created_at: string
  updated_at: string
}

export interface Proveedor {
  id: string
  org_id: string
  nombre: string
  contacto?: string
  telefono?: string
  email?: string
  direccion?: string
  rfc?: string
  notas?: string
  created_at: string
}

// ─── Sales ────────────────────────────────────────────────────────────────────

export type VentaEstado = 'pendiente' | 'pagado' | 'parcial' | 'cancelado'
export type VentaTipo = 'contado' | 'credito'

export interface VentaItem {
  producto_id: string
  nombre: string
  sku?: string
  cantidad: number
  precio_unitario: number
  subtotal: number
}

export interface Venta {
  id: string
  org_id: string
  numero: string
  cliente_id?: string
  cliente_nombre: string
  vendedor_id: string
  vendedor_nombre: string
  items: VentaItem[]
  subtotal: number
  descuento: number
  total: number
  tipo: VentaTipo
  estado: VentaEstado
  siniestro?: string
  notas?: string
  created_at: string
  updated_at: string
}

// ─── Quotes ───────────────────────────────────────────────────────────────────

export type CotizacionEstado = 'borrador' | 'enviada' | 'aceptada' | 'rechazada' | 'expirada'

export interface Cotizacion {
  id: string
  org_id: string
  numero: string
  cliente_id?: string
  cliente_nombre: string
  vendedor_id: string
  vendedor_nombre: string
  items: VentaItem[]
  subtotal: number
  descuento: number
  total: number
  estado: CotizacionEstado
  validez_dias: number
  notas?: string
  created_at: string
  updated_at: string
}

// ─── Deliveries ───────────────────────────────────────────────────────────────

export type EntregaEstado = 'pendiente' | 'en_transito' | 'entregado' | 'cancelado'

export interface Entrega {
  id: string
  org_id: string
  venta_id?: string
  numero: string
  cliente_nombre: string
  cliente_telefono?: string
  direccion: string
  siniestro?: string[]
  items: { nombre: string; cantidad: number }[]
  estado: EntregaEstado
  repartidor?: string
  notas?: string
  entregado_at?: string
  created_at: string
  updated_at: string
}

// ─── Finance ──────────────────────────────────────────────────────────────────

export type PrestamoEstado = 'activo' | 'pagado' | 'vencido'

export interface Prestamo {
  id: string
  org_id: string
  descripcion: string
  cliente_nombre: string
  monto: number
  monto_pagado: number
  tasa_interes: number
  fecha_vencimiento: string
  estado: PrestamoEstado
  created_at: string
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardStats {
  ventas_hoy: number
  ventas_mes: number
  clientes_total: number
  productos_bajo_stock: number
  entregas_pendientes: number
  cotizaciones_activas: number
  ingresos_hoy: number
  ingresos_mes: number
}

export interface SalesTrend {
  date: string
  total: number
  count: number
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T | null
  error: string | null
  count?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  per_page: number
  total_pages: number
}

// ─── Form Types ───────────────────────────────────────────────────────────────

export interface LoginForm {
  email: string
  password: string
}

export interface RegisterForm {
  nombre_empresa: string
  nombre: string
  email: string
  password: string
  confirm_password: string
}
