// Roles del equipo de Maya Autopartes: UNA sola definición para la pantalla (qué módulos abre cada quien), el menú y
// Pepito / MCP (qué herramientas tiene). Si cambia un rol, se cambia aquí y nada más.
(function (raiz) {
  const ROLES = {
    admin: {
      nombre: 'Dirección (administrador)',
      descripcion: 'Ve y hace todo: ventas, facturación, cobranza, finanzas, reportes, usuarios y configuración. Único que puede borrar y dar accesos.',
      modulos: '*'
    },
    vendedor: {
      nombre: 'Vendedor',
      descripcion: 'Hace notas, ventas y cotizaciones, atiende a sus clientes y da seguimiento a sus piezas y envíos. Consulta existencias con Pepito. No ve facturación, cobranza, compras ni finanzas.',
      modulos: ['dashboard', 'pepito', 'oficina', 'seguimiento', 'notas-entrega', 'ventas', 'cotizaciones', 'clientes', 'busqueda-ventas', 'documentos', 'entregas', 'envios', 'visitas-talleres']
    },
    almacen: {
      nombre: 'Almacén',
      descripcion: 'Prepara las piezas, lleva inventario, compras y proveedores, y despacha envíos y ventas de Mercado Libre. Ve las notas para surtirlas, sin precios de venta en reportes ni cobranza.',
      modulos: ['dashboard', 'pepito', 'oficina', 'seguimiento', 'notas-entrega', 'busqueda-ventas', 'inventario', 'compras', 'proveedores', 'mercadolibre', 'entregas', 'envios', 'visitas-talleres']
    },
    entregas: {
      nombre: 'Entregas (chofer / mensajería)',
      descripcion: 'Mueve las piezas de etapa (en camino, entregada), captura guías de paquetería y quién recibió. Solo ve logística: no ve precios, ventas ni facturación.',
      modulos: ['pepito', 'oficina', 'seguimiento', 'entregas', 'envios']
    },
    facturacion: {
      nombre: 'Facturación y cobranza (Geraldine)',
      descripcion: 'Factura en CONTPAQi y sube el XML (o se lo manda a Geraldine Bot), cobra, registra pagos y cancela notas con motivo. Ve ventas, clientes, notas y reportes; no ve inventario, compras ni finanzas.',
      modulos: ['dashboard', 'pepito', 'oficina', 'seguimiento', 'facturacion', 'cobranza', 'notas-entrega', 'ventas', 'clientes', 'busqueda-ventas', 'documentos', 'reportes']
    }
  };
  const LISTA = Object.keys(ROLES);
  const puedeModulo = (rol, modulo) => { const r = ROLES[rol]; return !!r && (r.modulos === '*' || r.modulos.includes(modulo)); };

  // Permisos de Pepito / MCP por área (herramientas): se derivan de los módulos, más lo que solo se consulta
  const AREAS = {
    notas: ['notas-entrega'],                 // historial, ver, crear notas y ventas
    ventas: ['ventas'],
    clientes: ['clientes'],
    facturas: ['facturacion'],
    inventario: ['inventario'],               // alta y cambios de producto
    inventario_consulta: ['inventario', 'notas-entrega', 'ventas', 'cotizaciones'], // existencias y precio por Pepito (vendedor incluido)
    compras: ['compras'],
    entregas: ['entregas'],
    envios: ['envios'],
    visitas_talleres: ['visitas-talleres'],
    cotizaciones: ['cotizaciones'],
    proveedores: ['proveedores'],
    seguimiento: ['seguimiento'],
    mercadolibre: ['mercadolibre'],
    pagos: ['finanzas'],
    prestamos: ['finanzas'],
    usuarios: ['usuarios']
  };
  const rolesDeArea = area => LISTA.filter(rol => rol === 'admin' || (AREAS[area] || []).some(m => puedeModulo(rol, m)));
  const PERMISOS_MCP = Object.keys(AREAS).reduce((o, area) => { o[area] = rolesDeArea(area); return o; }, { borrar: ['admin'] });

  // Módulo con el que entra cada rol (el primero que puede abrir; admin y los demás, el Resumen)
  const inicio = rol => { const r = ROLES[rol]; return !r || r.modulos === '*' || r.modulos.includes('dashboard') ? 'dashboard' : (r.modulos.includes('seguimiento') ? 'seguimiento' : r.modulos[0]); };

  const api = { ROLES, LISTA, puedeModulo, PERMISOS_MCP, rolesDeArea, inicio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.mayaRoles = api;
})(typeof window !== 'undefined' ? window : globalThis);
