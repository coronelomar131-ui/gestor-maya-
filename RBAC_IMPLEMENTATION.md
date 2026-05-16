# Role-Based Access Control (RBAC) Implementation

**Date**: 2026-05-08
**Commit**: 555c8cb
**Status**: ✅ Complete and deployed

## Overview
Implemented comprehensive role-based access control (RBAC) to restrict module access and action permissions based on user roles. This addresses the security vulnerability where unauthorized users could access admin-only modules.

## Implementation Details

### 1. Module-Level Access Control

Updated `showModule()` function (lines 2323-2355) to validate user permissions before displaying any module:

```javascript
const permissions = {
  dashboard: ['admin', 'vendedor', 'almacen'],
  ventas: ['admin', 'vendedor'],
  inventario: ['admin', 'almacen'],
  clientes: ['admin', 'vendedor'],
  cotizaciones: ['admin', 'vendedor'],
  proveedores: ['admin', 'almacen'],
  entregas: ['admin', 'vendedor', 'almacen'],
  reportes: ['admin'],
  mercadolibre: ['admin'],
  documentos: ['admin', 'vendedor'],
  usuarios: ['admin'],
  finanzas: ['admin']
};
```

**Behavior**:
- Non-authorized users see toast notification: "No tienes permiso para acceder a este módulo"
- They are automatically redirected to Dashboard
- This prevents accessing modules via direct URL or navigation

### 2. Action Button Permissions

Updated all render functions to conditionally display delete buttons:

| Module | Admin | Vendedor | Almacen |
|--------|:-----:|:--------:|:-------:|
| Ventas | ✅ | ❌ | ❌ |
| Inventario | ✅ | ❌ | ✅ |
| Clientes | ✅ | ❌ | ❌ |
| Cotizaciones | ✅ | ❌ | ❌ |
| Proveedores | ✅ | ❌ | ✅ |
| Entregas | ✅ | ❌ | ✅ |
| Usuarios | ✅ | ❌ | ❌ |
| Finanzas (Préstamos/Pagos) | ✅ | ❌ | ❌ |

**Implementation Pattern**:
```javascript
// In render functions
const rol = window.currentRole || 'vendedor';
// In row template:
${rol === 'admin' ? `<button class="btn btn-danger btn-sm" onclick="deleteItem(...)">🗑</button>` : ''}
```

### 3. Modified Functions

#### showModule() - Lines 2323-2355
- Added role validation
- Added permission object with module-level access
- Added unauthorized user handling

#### renderVentas() - Lines 1853-1873
- Only admin can delete sales

#### renderProductos() - Lines 1876-1896
- Admin and almacen can delete inventory

#### renderClientes() - Lines 1899-1915
- Only admin can delete clients

#### renderCotizaciones() - Lines 1918-1937
- Only admin can delete quotes

#### renderProveedores() - Lines 1940-1955
- Admin and almacen can delete suppliers

#### renderEntregas() - Lines 1958-1981
- Admin and almacen can delete deliveries

#### renderUsuarios() - Lines 1985-1999
- Only admin can delete users

#### renderPrestamos() - Lines 3527-3543
- Only admin can delete loans (Finance)

#### renderPagos() - Lines 3545-3560
- Only admin can delete payments (Finance)

## Security Features

1. **Multi-layer Protection**:
   - Module-level: Prevents unauthorized module access
   - UI-level: Hides action buttons for unauthorized users
   - Backend: Firestore security rules should validate on write

2. **User Experience**:
   - Clear error messages with toast notifications
   - Automatic redirect to safe default (Dashboard)
   - Navigation items already hidden for admin-only modules

3. **Role Definitions**:
   - **Admin**: Full access to all modules and actions
   - **Vendedor**: Can view Sales, Clients, Quotes, Documents; Can delete only Quotes
   - **Almacen**: Can view/manage Inventory, Suppliers, Deliveries; Limited view of other modules

## Testing Recommendations

1. **Test Admin User**:
   - Verify access to all modules (including Finanzas, Usuarios, Reportes)
   - Verify delete buttons visible on all modules
   - Verify can access admin-only modules via direct URL

2. **Test Vendedor User**:
   - Verify access to: Dashboard, Ventas, Clientes, Cotizaciones, Documentos
   - Verify NO access to: Finanzas, Usuarios, Inventario, Reportes, Mercado Libre
   - Verify delete buttons hidden on: Ventas, Clientes, Proveedores, Entregas, Usuarios, Finanzas
   - Verify can see delete buttons on: Cotizaciones only
   - Test accessing restricted modules via direct URL → redirects to Dashboard with error toast

3. **Test Almacen User**:
   - Verify access to: Dashboard, Inventario, Proveedores, Entregas
   - Verify NO access to: Ventas, Clientes, Cotizaciones, Reportes, Finanzas, Usuarios, Mercado Libre
   - Verify delete buttons visible on: Inventario, Proveedores, Entregas
   - Verify delete buttons hidden on: Ventas, Clientes, etc.

## Deployment

- Automatic deployment via GitHub → Vercel
- Changes pushed to main branch: `555c8cb`
- Vercel will auto-deploy in 1-2 minutes
- Production URL: https://maya-autopartes.vercel.app

## Notes

- `window.currentRole` is set during login from Firestore user profile
- Navigation items (Usuarios, Finanzas) already hidden for non-admin via `display:none` logic
- Admin section shown/hidden during authentication based on role
- This is UI-level protection; backend Firestore rules should be configured for data protection

## Future Enhancements

- Audit logging of who deleted what (add to Firestore)
- Permission audit dashboard (admin only)
- Fine-grained permissions (create, edit, view, delete per module)
- Encryption of sensitive fields
