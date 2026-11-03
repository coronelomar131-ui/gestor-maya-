// Herramientas MCP. Cada rol ve solo las de los módulos que puede abrir en la app; admin ve todas.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const datos = require('./datos');
const escritura = require('./escritura');
const buzon = require('./buzon');

// Los mismos roles por módulo que showModule() en public/index.html; borrar es solo de admin
const PERMISOS = {
  notas: ['admin', 'vendedor', 'almacen'],
  ventas: ['admin', 'vendedor'],
  clientes: ['admin', 'vendedor'],
  inventario: ['admin', 'almacen'],
  entregas: ['admin', 'vendedor', 'almacen'],
  envios: ['admin', 'vendedor', 'almacen'],
  visitas_talleres: ['admin', 'vendedor', 'almacen'],
  cotizaciones: ['admin', 'vendedor'],
  proveedores: ['admin', 'almacen'],
  pagos: ['admin', 'vendedor', 'almacen'],
  prestamos: ['admin'],
  usuarios: ['admin'],
  borrar: ['admin']
};
// El buzón de Pepito lo atiende una cuenta admin; no es un módulo del equipo
const ATIENDE_BUZON = ['admin'];

const LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ESCRITURA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const BORRADO = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');
const FILTROS = {
  tipo: z.enum(['todas', 'entrega', 'venta']).default('todas').describe('todas = notas de entrega (NE) y de venta (NV); entrega = solo NE; venta = solo NV'),
  cliente: z.string().optional().describe('Parte del nombre del cliente; no importan acentos ni mayúsculas'),
  vendedor: z.string().optional().describe('Parte del nombre del vendedor'),
  desde: FECHA.optional().describe('Primer día incluido (AAAA-MM-DD)'),
  hasta: FECHA.optional().describe('Último día incluido (AAAA-MM-DD)')
};
const ESTATUS_VENTA = ['Pendiente', 'Conseguir', 'En Proceso', 'Entregado', 'Cancelado'];
const PARTIDA = z.object({
  descripcion: z.string().min(1).describe('Pieza o servicio'),
  precio: z.number().min(0).describe('Precio de la partida completa, sin IVA'),
  iva_porcentaje: z.number().min(0).max(100).default(16).describe('IVA en % sobre el precio: 16 por omisión como en la app; 0 si no lleva'),
  ajuste: z.number().min(0).default(0).describe('Descuento en pesos que se resta'),
  siniestro: z.string().optional()
});
const opcional = z.string().optional();

const responder = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
const filtrosUsados = a => ({ tipo: a.tipo, cliente: a.cliente || null, vendedor: a.vendedor || null, desde: a.desde || null, hasta: a.hasta || null });

// Si Firebase no contesta, se avisa con un mensaje claro antes de que Vercel corte la función
// (maxDuration de api/mcp.js en vercel.json); si no, Claude solo ve "error de conexión".
const LIMITE_MS = 40000;
function conLimite(promesa) {
  let reloj;
  const limite = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error('La base de datos de la app (Firebase) tardó más de ' + LIMITE_MS / 1000 +
      ' segundos en responder. Intenta de nuevo en un momento. Si era un alta o un cambio, primero revisa si sí se guardó para no duplicarlo.')), LIMITE_MS);
  });
  return Promise.race([promesa, limite]).finally(() => clearTimeout(reloj));
}

// Errores del usuario (no existe, faltan datos) regresan como mensaje para Claude, no como falla del servidor
const ejecutar = fn => async a => {
  try {
    return responder(await conLimite(fn(a)));
  } catch (e) {
    if (e instanceof escritura.ErrorUsuario) return { isError: true, content: [{ type: 'text', text: e.message }] };
    throw e;
  }
};

function instrucciones(usuario) {
  const hoy = datos.fechaISO(new Date());
  return [
    'Datos de Maya Autopartes (refaccionaria en la Ciudad de México). Conectado como ' + usuario.nombre + ' (rol: ' + usuario.rol + '). Hoy es ' + hoy + '.',
    'Montos en pesos mexicanos (MXN). Fechas AAAA-MM-DD en hora de la Ciudad de México.',
    'Hay dos tipos de nota: nota de entrega (folio NE-123) y nota de venta (folio NV #123). Salvo que se pida un tipo, el historial y el resumen incluyen ambas; no incluyen notas de venta canceladas ni las que se crean solas al guardar una nota de entrega (esa venta ya aparece como su NE).',
    'En cada nota: total = subtotal + iva - ajuste. Los totales del resumen son la suma exacta de las notas. Usa solo montos que vengan de las herramientas; no estimes ni inventes cifras.',
    'En las notas de venta no se guarda cantidad: cantidad y precio_unitario vienen en null y el importe es el precio capturado de la partida.',
    'Si resumen.posibles_duplicados no está vacío, avísale al usuario: podría ser la misma venta capturada como nota de venta y como nota de entrega, y el total la estaría sumando dos veces.',
    'Algunas notas van sin precio a propósito (así las piden algunos clientes): resumen.notas_sin_importe dice cuántas están en $0 (folios en folios_sin_importe). Cuentan como nota pero no suman al total; menciónalo en una línea al dar totales, sin tratarlo como error.',
    'Una venta puede tener tres folios: NV #243 (su número en Ventas), NV-219 (el de Facturas) y F-219 (el de su factura). Si una nota trae otros_folios, son los de la venta ligada; úsalos al responder para que el usuario la reconozca.',
    'Para no agotar el límite diario de lecturas de Firebase, las consultas reutilizan los datos hasta 5 minutos: si alguien acaba de capturar algo en la app y no aparece, espera unos minutos. Lo que se guarda desde aquí aparece al momento.',
    'Las herramientas que crean, cambian o borran guardan directo en la app que usa el negocio. Antes de usarlas, muéstrale al usuario exactamente qué vas a guardar (cliente, artículos, cantidades, precios, IVA y total) y espera su confirmación. Nunca inventes precios ni cantidades: si faltan, pregúntalos.',
    'Para cambiar o borrar algo, primero búscalo para tener su id. Borrar es definitivo en la app (queda una copia en la colección "papelera" de Firebase); pide confirmación explícita.'
  ].join('\n');
}

function crearServidor(usuario) {
  const puede = modulo => PERMISOS[modulo].includes(usuario.rol);
  const servidor = new McpServer({ name: 'maya-autopartes', title: 'Maya Autopartes', version: '2.2.0' }, { instructions: instrucciones(usuario) });

  // ── Consultas ──
  if (puede('notas')) {
    servidor.registerTool('historial_notas', {
      title: 'Historial de notas',
      description: 'Notas de entrega y de venta con sus artículos, precios y totales, igual que el historial de la app. ' +
        'Úsala para saber qué se vendió, a quién y cuándo. Las notas vienen de la más reciente a la más antigua; el resumen siempre cubre todas las que cumplen los filtros aunque solo se muestren "limite".',
      inputSchema: Object.assign({}, FILTROS, {
        incluir_articulos: z.boolean().default(true).describe('Incluir el detalle de artículos de cada nota'),
        limite: z.number().int().min(1).max(200).default(50).describe('Máximo de notas a mostrar')
      }),
      annotations: LECTURA
    }, ejecutar(async a => {
      const lista = datos.filtrar(await datos.cargarRegistros(), a);
      return {
        filtros: filtrosUsados(a),
        resumen: datos.resumen(lista),
        mostrando: Math.min(a.limite, lista.length),
        notas: lista.slice(0, a.limite).map(x => datos.notaJSON(x, a.incluir_articulos))
      };
    }));

    servidor.registerTool('ver_nota', {
      title: 'Ver una nota',
      description: 'Detalle completo de una nota por su folio: "NE-203", "NV #350", el folio de Facturas "NV-219", el de factura "F-219" o solo "203". ' +
        'Una venta creada desde una nota de entrega se muestra como esa NE, con los folios de la venta en otros_folios.',
      inputSchema: { folio: z.string().min(1).describe('Folio o número de la nota') },
      annotations: LECTURA
    }, ejecutar(async ({ folio }) => {
      const encontradas = datos.buscarFolio(await datos.cargarRegistros(), folio);
      if (!encontradas.length) {
        return { encontrada: false, mensaje: 'No hay ninguna nota con el folio ' + folio + ' en el historial. Si es una venta cancelada, búscala con buscar_ventas.' };
      }
      return { encontradas: encontradas.length, notas: encontradas.slice(0, 5).map(x => datos.notaJSON(x, true)) };
    }));

    servidor.registerTool('resumen_ventas', {
      title: 'Resumen de ventas',
      description: 'Totales agrupados por cliente, vendedor, día, mes o artículo, sumando las notas que cumplen los filtros. ' +
        'Úsala para rankings, comparativos y "cuánto se vendió".',
      inputSchema: Object.assign({}, FILTROS, {
        agrupar_por: z.enum(['cliente', 'vendedor', 'dia', 'mes', 'articulo']).default('cliente'),
        limite: z.number().int().min(1).max(400).default(50).describe('Máximo de grupos a mostrar')
      }),
      annotations: LECTURA
    }, ejecutar(async a => {
      const lista = datos.filtrar(await datos.cargarRegistros(), a);
      const grupos = datos.agrupar(lista, a.agrupar_por);
      return { filtros: filtrosUsados(a), resumen: datos.resumen(lista), agrupado_por: a.agrupar_por, total_grupos: grupos.length, grupos: grupos.slice(0, a.limite) };
    }));
  }

  if (puede('ventas')) {
    servidor.registerTool('buscar_ventas', {
      title: 'Buscar ventas',
      description: 'Ventas (notas de venta) como están en el módulo Ventas, incluidas las canceladas y las creadas desde una nota de entrega, ' +
        'con su estatus y datos de factura. Úsala para dar seguimiento, facturación o para cambiar el estatus de una venta.',
      inputSchema: {
        texto: z.string().optional().describe('Folio (NV o la NE de la que salió), cliente, vendedor, siniestro o pieza'),
        estatus: z.enum(ESTATUS_VENTA).optional(),
        con_factura: z.boolean().optional().describe('true = solo facturadas; false = solo sin factura'),
        desde: FECHA.optional(),
        hasta: FECHA.optional(),
        incluir_articulos: z.boolean().default(false),
        limite: z.number().int().min(1).max(200).default(30)
      },
      annotations: LECTURA
    }, ejecutar(a => datos.ventas(a, a.limite)));
  }

  if (puede('clientes')) {
    servidor.registerTool('buscar_clientes', {
      title: 'Buscar clientes',
      description: 'Clientes registrados en la app: nombre, RFC, teléfono, correo y dirección. Busca por nombre, RFC, código, correo o teléfono.',
      inputSchema: {
        texto: z.string().optional().describe('Texto a buscar; vacío lista todos'),
        limite: z.number().int().min(1).max(100).default(20)
      },
      annotations: LECTURA
    }, ejecutar(({ texto, limite }) => datos.clientes(texto, limite)));
  }

  if (puede('inventario')) {
    servidor.registerTool('buscar_productos', {
      title: 'Buscar en inventario',
      description: 'Productos del inventario con precio y existencias. Busca por código, descripción, marca o compatibilidad; ' +
        'con solo_bajo_stock muestra lo que está en su mínimo o debajo, empezando por lo más urgente.',
      inputSchema: {
        texto: z.string().optional().describe('Texto a buscar; vacío lista todos'),
        solo_bajo_stock: z.boolean().default(false),
        limite: z.number().int().min(1).max(200).default(50)
      },
      annotations: LECTURA
    }, ejecutar(({ texto, solo_bajo_stock, limite }) => datos.productos(texto, solo_bajo_stock, limite)));

    servidor.registerTool('buscar_productos_ml', {
      title: 'Publicaciones de Mercado Libre',
      description: 'Publicaciones de Mercado Libre con precio, piezas disponibles, estatus y link, según la última sincronización de la app ' +
        '(Inventario → Sincronizar ML); no consulta Mercado Libre en vivo, así que di la fecha de ultima_sincronizacion al responder. Busca por título o id (MLM...).',
      inputSchema: {
        texto: z.string().optional().describe('Parte del título o id de la publicación; vacío lista todas'),
        estatus: z.enum(['active', 'paused', 'closed', 'under_review', 'inactive']).optional().describe('active = activa, paused = pausada, closed = finalizada'),
        solo_sin_existencias: z.boolean().default(false).describe('Solo publicaciones con 0 piezas disponibles'),
        limite: z.number().int().min(1).max(200).default(50)
      },
      annotations: LECTURA
    }, ejecutar(a => datos.productosML(a, a.limite)));
  }

  const modulos = Object.keys(datos.MODULOS).filter(puede);
  if (modulos.length) {
    servidor.registerTool('buscar_registros', {
      title: 'Consultar otros módulos',
      description: 'Registros de ' + modulos.join(', ') + ' tal como están guardados (del más reciente al más antiguo). ' +
        'Entregas usa estatus pending (pendiente), delivered (entregado) y cancelled (cancelado).',
      inputSchema: {
        modulo: z.enum(modulos),
        texto: z.string().optional().describe('Texto a buscar en cualquier campo'),
        limite: z.number().int().min(1).max(200).default(30)
      },
      annotations: LECTURA
    }, ejecutar(({ modulo, texto, limite }) => datos.registros(modulo, texto, limite)));
  }

  // ── Altas y cambios ──
  if (puede('notas')) {
    servidor.registerTool('crear_nota_entrega', {
      title: 'Crear nota de entrega',
      description: 'Crea una nota de entrega (folio NE-consecutivo) igual que el botón "Guardar" de la app; por omisión también registra la venta, ' +
        'como la casilla "Registrar también como venta". Confirma con el usuario cliente, artículos, cantidades, precios e IVA antes de usarla.',
      inputSchema: {
        cliente: z.string().min(1).describe('Si coincide con un cliente registrado se usa su nombre exacto'),
        fecha: FECHA.optional().describe('Por omisión hoy'),
        vendedor: opcional,
        con_iva: z.boolean().default(false).describe('Suma 16% de IVA al subtotal (casilla "Incluye IVA 16%")'),
        registrar_venta: z.boolean().default(true).describe('false si esa venta ya se capturó en Ventas'),
        articulos: z.array(z.object({
          descripcion: z.string().min(1),
          cantidad: z.number().positive().default(1),
          precio_unitario: z.number().min(0).describe('Precio por pieza, sin IVA'),
          siniestro: opcional,
          anio: z.string().optional().describe('Año del auto')
        })).min(1)
      },
      annotations: ESCRITURA
    }, ejecutar(a => escritura.crearNotaEntrega(usuario, a)));
  }

  if (puede('ventas')) {
    servidor.registerTool('crear_venta', {
      title: 'Crear nota de venta',
      description: 'Registra una venta (nota de venta, folio consecutivo) igual que el módulo Ventas: cada partida con su precio, IVA y ajuste. ' +
        'Confirma con el usuario antes de usarla.',
      inputSchema: {
        cliente: z.string().min(1),
        fecha: FECHA.optional().describe('Por omisión hoy'),
        vendedor: z.string().optional().describe('Por omisión el usuario conectado'),
        estatus: z.enum(ESTATUS_VENTA).default('Pendiente'),
        incluye_datos_fiscales: z.boolean().default(false),
        partidas: z.array(PARTIDA).min(1)
      },
      annotations: ESCRITURA
    }, ejecutar(a => escritura.crearVenta(usuario, a)));

    servidor.registerTool('cambiar_estatus_venta', {
      title: 'Cambiar estatus de venta',
      description: 'Cambia el estatus de una venta (Pendiente, Conseguir, En Proceso, Entregado, Cancelado). Busca la venta por id o por folio ("NV #350", "350" o "NV-120").',
      inputSchema: { id: opcional, folio: opcional, estatus: z.enum(ESTATUS_VENTA) },
      annotations: ESCRITURA
    }, ejecutar(a => {
      if (!a.id && !a.folio) throw new escritura.ErrorUsuario('Indica el id o el folio de la venta');
      return escritura.cambiarEstatusVenta(usuario, a);
    }));
  }

  if (puede('clientes')) {
    servidor.registerTool('guardar_cliente', {
      title: 'Alta o cambio de cliente',
      description: 'Sin id da de alta un cliente (código CL consecutivo, como la app; si ya existe uno con ese nombre no lo duplica). ' +
        'Con id (de buscar_clientes) cambia solo los campos que mandes.',
      inputSchema: {
        id: opcional, nombre: z.string().optional().describe('Nombre o razón social; obligatorio para alta'), codigo: opcional, rfc: opcional,
        email: opcional, telefono: opcional, calle: opcional, numero_exterior: opcional, numero_interior: opcional, colonia: opcional,
        municipio: opcional, ciudad: opcional, estado: opcional, pais: opcional, codigo_postal: opcional,
        venta_publica_redes: z.boolean().optional().describe('Cliente de venta pública (redes sociales)')
      },
      annotations: ESCRITURA
    }, ejecutar(a => escritura.guardarCliente(usuario, a)));
  }

  if (puede('inventario')) {
    servidor.registerTool('guardar_producto', {
      title: 'Alta o cambio de producto',
      description: 'Da de alta un producto o cambia uno existente (por id, o por código si ya existe). ' +
        'stock pone las existencias en un número; ajuste_stock suma o resta (ej. -2 al vender dos piezas).',
      inputSchema: {
        id: opcional, codigo: opcional, descripcion: opcional, marca: opcional, compatibilidad: opcional,
        precio: z.number().min(0).optional(), stock: z.number().int().optional(), stock_minimo: z.number().int().min(0).optional(),
        clase: opcional, ajuste_stock: z.number().int().optional()
      },
      annotations: ESCRITURA
    }, ejecutar(a => escritura.guardarProducto(usuario, a)));
  }

  if (puede('entregas')) {
    servidor.registerTool('guardar_entrega', {
      title: 'Alta o cambio de entrega',
      description: 'Sin id registra una entrega a domicilio como el módulo Control de Entregas; con id (de buscar_registros, módulo entregas) cambia su estatus u otros datos.',
      inputSchema: {
        id: opcional, cliente: opcional, direccion: opcional, monto: z.number().min(0).optional(),
        metodo_pago: z.enum(['Efectivo', 'Transferencia', 'Tarjeta', 'Ya pagado']).optional(),
        estatus: z.enum(['pendiente', 'entregado', 'cancelado']).optional(), notas: opcional
      },
      annotations: ESCRITURA
    }, ejecutar(a => escritura.guardarEntrega(usuario, a)));
  }

  if (puede('cotizaciones')) {
    servidor.registerTool('crear_cotizacion', {
      title: 'Crear cotización',
      description: 'Crea una cotización (COT-consecutivo, estatus vigente) igual que el módulo Cotizaciones. Confirma con el usuario antes de usarla.',
      inputSchema: { cliente: z.string().min(1), fecha: FECHA.optional(), vendedor: opcional, partidas: z.array(PARTIDA).min(1) },
      annotations: ESCRITURA
    }, ejecutar(a => escritura.crearCotizacion(usuario, a)));
  }

  if (puede('proveedores')) {
    servidor.registerTool('guardar_proveedor', {
      title: 'Alta o cambio de proveedor',
      description: 'Sin id da de alta un proveedor; con id cambia los campos que mandes.',
      inputSchema: { id: opcional, nombre: opcional, contacto: opcional, telefono: opcional, email: opcional, productos: z.string().optional().describe('Qué surte') },
      annotations: ESCRITURA
    }, ejecutar(a => escritura.guardarProveedor(usuario, a)));
  }

  if (puede('borrar')) {
    servidor.registerTool('eliminar_registro', {
      title: 'Eliminar registro',
      description: 'Borra un registro de la app (como el botón 🗑). Antes guarda una copia en la colección "papelera" de Firebase. ' +
        'Úsala solo después de que el usuario confirme explícitamente qué se borra.',
      inputSchema: {
        coleccion: z.enum(escritura.BORRABLES),
        id: z.string().min(1).describe('id del registro (sale en las búsquedas)'),
        confirmar: z.literal(true).describe('true solo si el usuario ya confirmó el borrado')
      },
      annotations: BORRADO
    }, ejecutar(a => escritura.eliminarRegistro(usuario, a)));
  }

  // ── Buzón de Pepito ──
  if (ATIENDE_BUZON.includes(usuario.rol)) {
    servidor.registerTool('revisar_buzon', {
      title: 'Revisar el buzón de Pepito',
      description: 'Pedidos que el equipo dejó en el buzón de la app (módulo Pepito), del más viejo al más nuevo. ' +
        'Contesta cada uno con responder_buzon, en español, breve y claro, como Pepito. Reglas: ' +
        '1) Atiende cada pedido con el rol de quien lo hizo: usa solo herramientas de los módulos en puede_usar; si pide algo fuera de eso, contesta que no tiene permiso y que lo pida a un admin. ' +
        '2) Para consultas, busca los datos y contesta con cifras exactas de las herramientas. ' +
        '3) Para crear, cambiar o borrar: si el pedido NO es la confirmación de una propuesta tuya (ver contexto), NO guardes nada; contesta con exactamente lo que guardarías (cliente, artículos, precios, IVA, total) y marca espera_confirmacion. ' +
        'Si el pedido confirma claramente la propuesta del contexto, hazlo y contesta con el folio. ' +
        '4) Si falta un dato (precio, cantidad, cliente), pregúntalo en la respuesta; nunca lo inventes.',
      inputSchema: {},
      annotations: LECTURA
    }, ejecutar(() => buzon.revisar(PERMISOS)));

    servidor.registerTool('responder_buzon', {
      title: 'Contestar un pedido del buzón',
      description: 'Guarda la respuesta de Pepito a un pedido del buzón; quien lo pidió la ve en la app al momento. ' +
        'Si pidieron una nota o cotización (o la acabas de crear), mándala en adjuntos para que puedan descargar el PDF desde el chat.',
      inputSchema: {
        id: z.string().min(1).describe('id del pedido (sale en revisar_buzon)'),
        respuesta: z.string().min(1).describe('Lo que verá la persona en la app'),
        espera_confirmacion: z.boolean().default(false).describe('true si propones guardar algo y esperas que confirme'),
        adjuntos: z.array(z.object({
          tipo: z.enum(['nota_entrega', 'nota_venta', 'cotizacion']).describe('nota_entrega = NE (id de la nota); nota_venta = NV (id de la venta); cotizacion = COT (id de la cotización)'),
          id: z.string().min(1).describe('id del registro, como lo regresan ver_nota, historial_notas, crear_* o buscar_*'),
          folio: z.string().optional().describe('Folio para el botón, ej. NE-230, NV #243, COT-12')
        })).max(5).default([]).describe('Notas o cotizaciones que la persona pidió o que acabas de crear: en la app le sale un botón para descargar su PDF')
      },
      annotations: ESCRITURA
    }, ejecutar(a => buzon.responder(usuario, a)));
  }

  return servidor;
}

module.exports = { crearServidor, PERMISOS };
