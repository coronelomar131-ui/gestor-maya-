// Roles del equipo de Maya Autopartes: UNA sola definición para la pantalla (qué módulos abre cada quien), el menú y
// Pepito / MCP (qué herramientas tiene). Si cambia un rol, se cambia aquí y nada más.
(function (raiz) {
  // Lo que ve todo el equipo: las ventas y todo su seguimiento (de la nota al pago). Facturación y Cobranza son de consulta
  // para quien no factura: subir facturas, registrar pagos y cancelarlas es de ACCIONES.facturar.
  const TODOS_VEN = ['pepito', 'oficina', 'seguimiento', 'notas-entrega', 'ventas', 'busqueda-ventas', 'documentos', 'facturacion', 'cobranza'];
  const ROLES = {
    admin: {
      nombre: 'Dirección (administrador)',
      descripcion: 'Ve y hace todo: ventas, facturación, cobranza, finanzas, reportes, usuarios y configuración. Único que puede borrar y dar accesos.',
      modulos: '*'
    },
    vendedor: {
      nombre: 'Vendedor',
      descripcion: 'Hace notas, ventas y cotizaciones, atiende a sus clientes y sigue cada venta hasta el pago: ve Seguimiento, Facturación y Cobranza (solo consulta). Consulta existencias con Pepito. No ve compras ni finanzas.',
      modulos: TODOS_VEN.concat(['dashboard', 'cotizaciones', 'clientes', 'entregas', 'envios', 'visitas-talleres'])
    },
    almacen: {
      nombre: 'Almacén',
      descripcion: 'Prepara las piezas, lleva inventario, compras y proveedores, y despacha envíos y ventas de Mercado Libre. Ve las ventas y su seguimiento hasta el pago (Facturación y Cobranza solo consulta).',
      modulos: TODOS_VEN.concat(['dashboard', 'inventario', 'compras', 'proveedores', 'mercadolibre', 'entregas', 'envios', 'visitas-talleres'])
    },
    entregas: {
      nombre: 'Entregas (chofer / mensajería)',
      descripcion: 'Mueve las piezas de etapa (en camino, entregada), captura guías de paquetería y quién recibió. Ve las ventas y su seguimiento hasta el pago (solo consulta).',
      modulos: TODOS_VEN.concat(['entregas', 'envios'])
    },
    facturacion: {
      nombre: 'Facturación y cobranza (Geraldine)',
      descripcion: 'Ve todo igual que Dirección: ventas, notas, clientes, inventario, compras, Mercado Libre, envíos, reportes y finanzas. Factura en CONTPAQi y sube el XML (o se lo manda a Geraldine Bot), cobra y cancela notas con motivo. Lo único que no puede es dar accesos, cambiar la configuración ni borrar registros.',
      modulos: '*sin-admin'
    }
  };
  const LISTA = Object.keys(ROLES);
  // Lo que es solo de Dirección aunque un rol "vea todo": dar accesos y la configuración general (borrar va aparte, en PERMISOS_MCP)
  const SOLO_DIRECCION = ['usuarios', 'configuracion'];
  const puedeModulo = (rol, modulo) => {
    const r = ROLES[rol];
    if (!r) return false;
    if (r.modulos === '*') return true;
    if (r.modulos === '*sin-admin') return !SOLO_DIRECCION.includes(modulo);
    return r.modulos.includes(modulo);
  };

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
  // Borrar compras: Dirección y almacén (que las captura); quien solo "ve todo" no borra
  PERMISOS_MCP.compras_borrar = PERMISOS_MCP.compras.filter(r => r === 'admin' || (ROLES[r] && Array.isArray(ROLES[r].modulos) && ROLES[r].modulos.includes('compras')));

  // Módulo con el que entra cada rol (el primero que puede abrir; admin y los demás, el Resumen)
  const inicio = rol => { const r = ROLES[rol]; return !r || typeof r.modulos === 'string' || r.modulos.includes('dashboard') ? 'dashboard' : (r.modulos.includes('seguimiento') ? 'seguimiento' : r.modulos[0]); };

  // Pepito "fuera de rol": si alguien le pide algo que su rol no tiene, Pepito lo hace con este rol ampliado. Todo menos
  // finanzas, accesos, configuración y borrar; cada uso queda registrado y Dirección recibe aviso de las acciones.
  const AMPLIADO = 'pepito_ampliado';
  const NUNCA_FUERA_DE_ROL = ['pagos', 'prestamos', 'usuarios', 'borrar', 'compras_borrar'];
  Object.keys(PERMISOS_MCP).forEach(area => { if (!NUNCA_FUERA_DE_ROL.includes(area)) PERMISOS_MCP[area] = PERMISOS_MCP[area].concat(AMPLIADO); });

  // Acciones que no van con solo poder abrir el módulo
  const ACCIONES = { facturar: ['admin', 'facturacion', AMPLIADO] };
  const puedeAccion = (rol, accion) => (ACCIONES[accion] || []).includes(rol);

  const api = { AMPLIADO, NUNCA_FUERA_DE_ROL, ROLES, LISTA, TODOS_VEN, ACCIONES, puedeAccion, SOLO_DIRECCION, puedeModulo, PERMISOS_MCP, rolesDeArea, inicio };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.mayaRoles = api;
})(typeof window !== 'undefined' ? window : globalThis);
