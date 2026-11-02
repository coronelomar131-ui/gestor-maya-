// Herramientas MCP (solo lectura). Cada rol ve solo las de los módulos que puede abrir en la app.
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const datos = require('./datos');

const PERMISOS = {
  notas: ['admin', 'vendedor', 'almacen'],
  clientes: ['admin', 'vendedor'],
  productos: ['admin', 'almacen']
};

const SOLO_LECTURA = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');
const FILTROS = {
  tipo: z.enum(['todas', 'entrega', 'venta']).default('todas').describe('todas = notas de entrega (NE) y de venta (NV); entrega = solo NE; venta = solo NV'),
  cliente: z.string().optional().describe('Parte del nombre del cliente; no importan acentos ni mayúsculas'),
  vendedor: z.string().optional().describe('Parte del nombre del vendedor'),
  desde: FECHA.optional().describe('Primer día incluido (AAAA-MM-DD)'),
  hasta: FECHA.optional().describe('Último día incluido (AAAA-MM-DD)')
};

const responder = obj => ({ content: [{ type: 'text', text: JSON.stringify(obj) }] });
const filtrosUsados = a => ({ tipo: a.tipo, cliente: a.cliente || null, vendedor: a.vendedor || null, desde: a.desde || null, hasta: a.hasta || null });

function instrucciones(usuario) {
  const hoy = new Date();
  const fecha = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
  return [
    'Datos de Maya Autopartes (refaccionaria en la Ciudad de México). Conectado como ' + usuario.nombre + ' (rol: ' + usuario.rol + '). Hoy es ' + fecha + '.',
    'Montos en pesos mexicanos (MXN). Fechas AAAA-MM-DD en hora de la Ciudad de México.',
    'Hay dos tipos de nota: nota de entrega (folio NE-123) y nota de venta (folio NV #123). Salvo que se pida un tipo, el historial y el resumen incluyen ambas; no incluyen notas de venta canceladas ni las que se crean solas al guardar una nota de entrega (esa venta ya aparece como su NE).',
    'En cada nota: total = subtotal + iva - ajuste. Los totales del resumen son la suma exacta de las notas. Usa solo montos que vengan de las herramientas; no estimes ni inventes cifras.',
    'En las notas de venta no se guarda cantidad: cantidad y precio_unitario vienen en null y el importe es el precio capturado de la partida.',
    'Si resumen.posibles_duplicados no está vacío, avísale al usuario: podría ser la misma venta capturada como nota de venta y como nota de entrega, y el total la estaría sumando dos veces.'
  ].join('\n');
}

function crearServidor(usuario) {
  const puede = modulo => PERMISOS[modulo].includes(usuario.rol);
  const servidor = new McpServer({ name: 'maya-autopartes', title: 'Maya Autopartes', version: '1.0.0' }, { instructions: instrucciones(usuario) });

  if (puede('notas')) {
    servidor.registerTool('historial_notas', {
      title: 'Historial de notas',
      description: 'Notas de entrega y de venta con sus artículos, precios y totales, igual que el historial de la app. ' +
        'Úsala para saber qué se vendió, a quién y cuándo. Las notas vienen de la más reciente a la más antigua; el resumen siempre cubre todas las que cumplen los filtros aunque solo se muestren "limite".',
      inputSchema: Object.assign({}, FILTROS, {
        incluir_articulos: z.boolean().default(true).describe('Incluir el detalle de artículos de cada nota'),
        limite: z.number().int().min(1).max(200).default(50).describe('Máximo de notas a mostrar')
      }),
      annotations: SOLO_LECTURA
    }, async a => {
      const lista = datos.filtrar(await datos.cargarRegistros(), a);
      return responder({
        filtros: filtrosUsados(a),
        resumen: datos.resumen(lista),
        mostrando: Math.min(a.limite, lista.length),
        notas: lista.slice(0, a.limite).map(x => datos.notaJSON(x, a.incluir_articulos))
      });
    });

    servidor.registerTool('ver_nota', {
      title: 'Ver una nota',
      description: 'Detalle completo de una nota por su folio, por ejemplo "NE-203", "NV #350" o solo "203".',
      inputSchema: { folio: z.string().min(1).describe('Folio o número de la nota') },
      annotations: SOLO_LECTURA
    }, async ({ folio }) => {
      const encontradas = datos.buscarFolio(await datos.cargarRegistros(), folio);
      if (!encontradas.length) return responder({ encontrada: false, mensaje: 'No hay ninguna nota con el folio ' + folio });
      return responder({ encontradas: encontradas.length, notas: encontradas.slice(0, 5).map(x => datos.notaJSON(x, true)) });
    });

    servidor.registerTool('resumen_ventas', {
      title: 'Resumen de ventas',
      description: 'Totales agrupados por cliente, vendedor, día, mes o artículo, sumando las notas que cumplen los filtros. ' +
        'Úsala para rankings, comparativos y "cuánto se vendió".',
      inputSchema: Object.assign({}, FILTROS, {
        agrupar_por: z.enum(['cliente', 'vendedor', 'dia', 'mes', 'articulo']).default('cliente'),
        limite: z.number().int().min(1).max(400).default(50).describe('Máximo de grupos a mostrar')
      }),
      annotations: SOLO_LECTURA
    }, async a => {
      const lista = datos.filtrar(await datos.cargarRegistros(), a);
      const grupos = datos.agrupar(lista, a.agrupar_por);
      return responder({
        filtros: filtrosUsados(a),
        resumen: datos.resumen(lista),
        agrupado_por: a.agrupar_por,
        total_grupos: grupos.length,
        grupos: grupos.slice(0, a.limite)
      });
    });
  }

  if (puede('clientes')) {
    servidor.registerTool('buscar_clientes', {
      title: 'Buscar clientes',
      description: 'Clientes registrados en la app: nombre, RFC, teléfono, correo y dirección. Busca por nombre, RFC, código, correo o teléfono.',
      inputSchema: {
        texto: z.string().optional().describe('Texto a buscar; vacío lista todos'),
        limite: z.number().int().min(1).max(100).default(20)
      },
      annotations: SOLO_LECTURA
    }, async ({ texto, limite }) => responder({ clientes: await datos.clientes(texto, limite) }));
  }

  if (puede('productos')) {
    servidor.registerTool('buscar_productos', {
      title: 'Buscar en inventario',
      description: 'Productos del inventario con precio y existencias. Busca por código, descripción, marca o compatibilidad; ' +
        'con solo_bajo_stock muestra lo que está en su mínimo o debajo, empezando por lo más urgente.',
      inputSchema: {
        texto: z.string().optional().describe('Texto a buscar; vacío lista todos'),
        solo_bajo_stock: z.boolean().default(false),
        limite: z.number().int().min(1).max(200).default(50)
      },
      annotations: SOLO_LECTURA
    }, async ({ texto, solo_bajo_stock, limite }) => responder({ productos: await datos.productos(texto, solo_bajo_stock, limite) }));
  }

  return servidor;
}

module.exports = { crearServidor, PERMISOS };
