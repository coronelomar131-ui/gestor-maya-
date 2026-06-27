-- ═══════════════════════════════════════════════════════════════════
-- GestorPro — Initial Schema
-- Multi-tenant ERP for distributors and retail businesses
-- Security: Row Level Security on every table (Troy Hunt / OWASP)
-- ═══════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Organizations (tenants) ─────────────────────────────────────────────────

CREATE TABLE organizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  logo_url    TEXT,
  phone       TEXT,
  address     TEXT,
  rfc         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Users ───────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'vendedor' CHECK (role IN ('admin', 'vendedor', 'almacen')),
  avatar_url  TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Clients ─────────────────────────────────────────────────────────────────

CREATE TABLE clientes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  telefono        TEXT,
  email           TEXT,
  direccion       TEXT,
  ciudad          TEXT,
  rfc             TEXT,
  notas           TEXT,
  total_compras   DECIMAL(12,2) DEFAULT 0,
  ultima_compra   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Suppliers ───────────────────────────────────────────────────────────────

CREATE TABLE proveedores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  contacto    TEXT,
  telefono    TEXT,
  email       TEXT,
  direccion   TEXT,
  rfc         TEXT,
  notas       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Inventory ───────────────────────────────────────────────────────────────

CREATE TABLE productos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  descripcion     TEXT,
  sku             TEXT,
  precio_venta    DECIMAL(12,2) NOT NULL DEFAULT 0,
  precio_costo    DECIMAL(12,2) DEFAULT 0,
  stock           INTEGER NOT NULL DEFAULT 0,
  stock_minimo    INTEGER NOT NULL DEFAULT 5,
  categoria       TEXT,
  proveedor_id    UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  imagen_url      TEXT,
  activo          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, sku)
);

-- ─── Sales ───────────────────────────────────────────────────────────────────

CREATE TABLE ventas (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  numero          TEXT NOT NULL,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre  TEXT NOT NULL,
  vendedor_id     UUID NOT NULL REFERENCES profiles(id),
  vendedor_nombre TEXT NOT NULL,
  items           JSONB NOT NULL DEFAULT '[]',
  subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento       DECIMAL(12,2) NOT NULL DEFAULT 0,
  total           DECIMAL(12,2) NOT NULL DEFAULT 0,
  tipo            TEXT NOT NULL DEFAULT 'contado' CHECK (tipo IN ('contado', 'credito')),
  estado          TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'pagado', 'parcial', 'cancelado')),
  siniestro       TEXT,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, numero)
);

-- ─── Quotes ──────────────────────────────────────────────────────────────────

CREATE TABLE cotizaciones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  numero          TEXT NOT NULL,
  cliente_id      UUID REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre  TEXT NOT NULL,
  vendedor_id     UUID NOT NULL REFERENCES profiles(id),
  vendedor_nombre TEXT NOT NULL,
  items           JSONB NOT NULL DEFAULT '[]',
  subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento       DECIMAL(12,2) NOT NULL DEFAULT 0,
  total           DECIMAL(12,2) NOT NULL DEFAULT 0,
  estado          TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'enviada', 'aceptada', 'rechazada', 'expirada')),
  validez_dias    INTEGER NOT NULL DEFAULT 15,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, numero)
);

-- ─── Deliveries ──────────────────────────────────────────────────────────────

CREATE TABLE entregas (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  venta_id          UUID REFERENCES ventas(id) ON DELETE SET NULL,
  numero            TEXT NOT NULL,
  cliente_nombre    TEXT NOT NULL,
  cliente_telefono  TEXT,
  direccion         TEXT NOT NULL,
  siniestros        TEXT[] DEFAULT '{}',
  items             JSONB NOT NULL DEFAULT '[]',
  estado            TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'en_transito', 'entregado', 'cancelado')),
  repartidor        TEXT,
  notas             TEXT,
  entregado_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Finance ─────────────────────────────────────────────────────────────────

CREATE TABLE prestamos (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id              UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  descripcion         TEXT NOT NULL,
  cliente_nombre      TEXT NOT NULL,
  monto               DECIMAL(12,2) NOT NULL,
  monto_pagado        DECIMAL(12,2) NOT NULL DEFAULT 0,
  tasa_interes        DECIMAL(5,2) NOT NULL DEFAULT 0,
  fecha_vencimiento   DATE,
  estado              TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'pagado', 'vencido')),
  notas               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Audit Log (Security) ────────────────────────────────────────────────────

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id),
  action      TEXT NOT NULL,
  table_name  TEXT NOT NULL,
  record_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════
-- INDEXES — Performance matters (John Carmack philosophy)
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX idx_clientes_org_id ON clientes(org_id);
CREATE INDEX idx_clientes_nombre ON clientes(org_id, nombre);
CREATE INDEX idx_productos_org_id ON productos(org_id);
CREATE INDEX idx_productos_sku ON productos(org_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX idx_ventas_org_id ON ventas(org_id);
CREATE INDEX idx_ventas_created_at ON ventas(org_id, created_at DESC);
CREATE INDEX idx_ventas_estado ON ventas(org_id, estado);
CREATE INDEX idx_cotizaciones_org_id ON cotizaciones(org_id);
CREATE INDEX idx_entregas_org_id ON entregas(org_id);
CREATE INDEX idx_entregas_estado ON entregas(org_id, estado);
CREATE INDEX idx_audit_logs_org_id ON audit_logs(org_id, created_at DESC);

-- ═══════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — Troy Hunt / OWASP principle: deny by default
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestamos ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's org_id
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Organizations: users see only their own org
CREATE POLICY "org_read_own" ON organizations
  FOR SELECT USING (id = get_user_org_id());

CREATE POLICY "org_update_admin" ON organizations
  FOR UPDATE USING (id = get_user_org_id() AND get_user_role() = 'admin');

-- Profiles: users see profiles in their org
CREATE POLICY "profiles_read_own_org" ON profiles
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "profiles_update_self" ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profiles_manage_admin" ON profiles
  FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'admin');

-- Clientes: org-scoped, vendedor and admin can write
CREATE POLICY "clientes_read" ON clientes
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "clientes_write" ON clientes
  FOR INSERT WITH CHECK (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'vendedor'));

CREATE POLICY "clientes_update" ON clientes
  FOR UPDATE USING (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'vendedor'));

CREATE POLICY "clientes_delete" ON clientes
  FOR DELETE USING (org_id = get_user_org_id() AND get_user_role() = 'admin');

-- Productos: org-scoped, almacen and admin can write
CREATE POLICY "productos_read" ON productos
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "productos_write" ON productos
  FOR INSERT WITH CHECK (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'almacen'));

CREATE POLICY "productos_update" ON productos
  FOR UPDATE USING (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'almacen'));

CREATE POLICY "productos_delete" ON productos
  FOR DELETE USING (org_id = get_user_org_id() AND get_user_role() = 'admin');

-- Ventas: org-scoped
CREATE POLICY "ventas_read" ON ventas
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "ventas_write" ON ventas
  FOR INSERT WITH CHECK (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'vendedor'));

CREATE POLICY "ventas_update" ON ventas
  FOR UPDATE USING (org_id = get_user_org_id() AND get_user_role() IN ('admin', 'vendedor'));

CREATE POLICY "ventas_delete" ON ventas
  FOR DELETE USING (org_id = get_user_org_id() AND get_user_role() = 'admin');

-- Apply same pattern for remaining tables
CREATE POLICY "cotizaciones_all" ON cotizaciones
  FOR ALL USING (org_id = get_user_org_id());

CREATE POLICY "entregas_all" ON entregas
  FOR ALL USING (org_id = get_user_org_id());

CREATE POLICY "proveedores_all" ON proveedores
  FOR ALL USING (org_id = get_user_org_id());

CREATE POLICY "prestamos_admin" ON prestamos
  FOR ALL USING (org_id = get_user_org_id() AND get_user_role() = 'admin');

CREATE POLICY "audit_logs_read_admin" ON audit_logs
  FOR SELECT USING (org_id = get_user_org_id() AND get_user_role() = 'admin');

CREATE POLICY "audit_logs_insert" ON audit_logs
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

-- ═══════════════════════════════════════════════════════════════════
-- TRIGGERS — auto-update timestamps + audit trail
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_productos_updated_at BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_ventas_updated_at BEFORE UPDATE ON ventas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_cotizaciones_updated_at BEFORE UPDATE ON cotizaciones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_entregas_updated_at BEFORE UPDATE ON entregas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════════
-- Function: auto-create profile on signup
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  org_id UUID;
  org_name TEXT;
  org_slug TEXT;
BEGIN
  org_name := NEW.raw_user_meta_data->>'org_name';
  org_slug := NEW.raw_user_meta_data->>'org_slug';

  IF org_name IS NOT NULL THEN
    INSERT INTO organizations (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO org_id;

    INSERT INTO profiles (id, org_id, email, name, role)
    VALUES (
      NEW.id,
      org_id,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      'admin'
    );
  ELSE
    INSERT INTO profiles (id, org_id, email, name, role)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data->>'org_id')::UUID,
      NEW.email,
      COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
      COALESCE(NEW.raw_user_meta_data->>'role', 'vendedor')
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
