// Pruebas del servidor MCP sin Firebase real: una base en memoria con la misma forma que guarda la app.
// Se llaman las herramientas como lo hace Claude (cliente MCP en memoria). Correr con: npm test
process.env.TZ = 'America/Mexico_City';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js');
const { usar } = require('./firebase');
const datos = require('./datos');
const { crearServidor } = require('./herramientas');

// Ventas guarda la fecha como new Date('AAAA-MM-DD').getTime(): medianoche UTC
const ms = iso => new Date(iso + 'T00:00:00Z').getTime();

function baseDePrueba() {
  return {
    notasEntrega: {
      ne229: {
        notaId: 'NE-229', fecha: '2026-10-31', cliente: 'Distribuidora Ejemplo', siniestro: 'S-0001', vendedor: '',
        items: [{ descripcion: 'Cofre Seat Leon', siniestro: 'S-0001', anio: '2018', cantidad: 1, precioUnit: 0 }],
        subtotal: 0, ivaTotal: 0, total: 0, createdAt: '2026-10-31T16:18:00.000Z'
      },
      ne039: {
        notaId: 'NE-039', fecha: '2026-07-20', cliente: 'Refacciones Prueba', siniestro: 'S-0002', vendedor: 'Vendedora Uno',
        items: [{ descripcion: 'Faro Derecho Creta', siniestro: 'S-0002', anio: '2021', cantidad: 1, precioUnit: 9200 }],
        subtotal: 9200, ivaTotal: 1472, total: 10672, createdAt: '2026-07-20T17:20:00.000Z'
      },
      ne226: {
        notaId: 'NE-226', fecha: '2026-10-28', cliente: 'Clientes Redes', siniestro: '', vendedor: '',
        items: [{ descripcion: 'Cristal Delantero Izquierdo Kwid', siniestro: '', anio: '', cantidad: 1, precioUnit: 900 }],
        subtotal: 900, ivaTotal: 0, total: 900, createdAt: '2026-10-28T20:43:00.000Z'
      }
    },
    ventas: {
      // Generada sola al guardar NE-229; en Facturas aparece como NV-219 con factura F-219
      v243: {
        notaId: '243', notaNumero: 'NV-219', facturaNumero: 'F-219', fuente: 'nota_entrega', notaEntregaId: 'NE-229', estatus: 'Entregado',
        clienteNombre: 'Distribuidora Ejemplo', fecha: ms('2026-10-31'), items: [{ pedido: 'Cofre Seat Leon (2018)', numSiniestro: 'S-0001', precio: 0, iva: 0, ajuste: 0 }],
        subtotal: 0, ivaTotal: 0, ajusteTotal: 0, total: 0
      },
      // Misma venta que NE-039, capturada aparte: posible duplicado
      v71: {
        notaId: '71', estatus: 'Entregado', clienteNombre: 'Refacciones Prueba', vendedor: 'Vendedor Dos', fecha: ms('2026-07-20'),
        items: [{ pedido: 'Faro Derecho Creta 2021', numSiniestro: 'S-0002', precio: 9200, iva: 1472, ajuste: 0 }],
        subtotal: 9200, ivaTotal: 1472, ajusteTotal: 0, total: 10672
      },
      // NV #219 es otra venta distinta de NV-219; su folio de Facturas es NV-195
      v219: {
        notaId: '219', notaNumero: 'NV-195', estatus: 'Pendiente', clienteNombre: 'venta publico', fecha: ms('2026-06-01'),
        items: [{ pedido: 'Espejo', numSiniestro: '', precio: 500, iva: 0, ajuste: 0 }], subtotal: 500, ivaTotal: 0, ajusteTotal: 0, total: 500
      },
      v250: {
        notaId: '250', estatus: 'Cancelado', clienteNombre: 'Cliente Cancelado', fecha: ms('2026-10-15'),
        items: [{ pedido: 'Faro', numSiniestro: '', precio: 4500, iva: 720, ajuste: 0 }], subtotal: 4500, ivaTotal: 720, ajusteTotal: 0, total: 5220
      }
    },
    clientes: {
      c1: { codigoCliente: 'CL002', razonSocial: 'Zeta Autopartes', ciudad: 'Guadalajara', estado: 'Jalisco' },
      // Importado de Excel con "activo" en la columna de estado
      c2: { codigoCliente: 'CL001', razonSocial: 'Álvaro Pérez', ciudad: 'León', estado: 'activo', codigoPostal: '37353' },
      c3: { codigoCliente: 'Código Cliente', razonSocial: 'Razón Social', rfc: 'R.F.C.' }
    },
    productos: {
      p1: { codigo: 'A1', descripcion: 'Faro izquierdo', precio: 1200, stock: 1, stockMin: 2 },
      p2: { codigo: 'B2', descripcion: 'Espejo derecho', precio: 800, stock: 5, stockMin: 1 }
    },
    ml_productos: {
      MLM1: { id: 'MLM1', title: 'Faro Derecho Creta 2021', price: 9200, available_quantity: 3, status: 'active', permalink: 'https://articulo.mercadolibre.com.mx/MLM-1', ultimaSync: new Date('2026-10-30T20:00:00Z') },
      MLM2: { id: 'MLM2', title: 'Cofre Seat Leon 2018', price: 6500, available_quantity: 0, status: 'paused', permalink: 'https://articulo.mercadolibre.com.mx/MLM-2', ultimaSync: new Date('2026-10-30T20:05:00Z') }
    },
    // La app solo reescribe las publicaciones que cambian; la hora del último sync va aquí
    config: { ml_ultima_sync: { fecha: new Date('2026-10-30T21:00:00Z'), total: 2 } },
    cotizaciones: {
      cot6: { notaId: '6', fecha: 1782432000000, clienteNombre: 'Distribuidora Ejemplo', total: 0, estatus: 'vigente', createdAt: '2026-06-26T16:06:43.133Z' }
    },
    proveedores: { pr1: { nombre: 'Proveedor Uno', telefono: '555' } },
    compras: {
      compra1: {
        fecha: '2026-11-05', proveedor: 'Proveedor Faro',
        articulos: [
          { pieza: 'Faro derecho', cantidadComprada: 2, costoUnitario: 100, cantidadVendida: 1, precioVenta: 180 },
          { pieza: 'Espejo lateral', cantidadComprada: 1, costoUnitario: 250, cantidadVendida: 1, precioVenta: 300 }
        ]
      },
      compra2: {
        fecha: '2026-10-25', proveedor: 'Refa Uno', pieza: 'Cofre',
        cantidadComprada: 2, costoUnitario: 100, cantidadVendida: 1, ingresosVenta: 250
      }
    },
    usuarios: { u1: { uid: 'admin-1', nombre: 'Dirección', rol: 'admin' } }
  };
}

// Misma interfaz que el Firebase real de firebase.js; update vacío falla como en Firestore
function firestoreFalsa(inicial) {
  const cols = {};
  Object.keys(inicial).forEach(c => { cols[c] = new Map(Object.entries(inicial[c])); });
  const col = c => (cols[c] = cols[c] || new Map());
  let n = 0;
  return {
    cols,
    lecturas: {},
    async leerColeccion(c) {
      this.lecturas[c] = (this.lecturas[c] || 0) + 1;
      return [...col(c)].map(([id, d]) => Object.assign({ id }, structuredClone(d)));
    },
    async buscarIgual(c, campo, valor) {
      this.lecturas[c] = (this.lecturas[c] || 0) + 1;
      return [...col(c)].filter(([, d]) => d[campo] === valor).map(([id, d]) => Object.assign({ id }, structuredClone(d)));
    },
    async obtener(c, id) { const d = col(c).get(id); return d ? structuredClone(d) : null; },
    async guardar(c, id, d) { col(c).set(id, structuredClone(d)); },
    async agregar(c, d) { const id = 'nuevo' + (++n); col(c).set(id, structuredClone(d)); return id; },
    async actualizar(c, id, cambios) {
      if (!col(c).has(id)) throw new Error('NOT_FOUND: ' + c + '/' + id);
      if (!Object.keys(cambios).length) throw new Error('Firestore: At least one field must be updated.');
      Object.assign(col(c).get(id), structuredClone(cambios));
    },
    async incrementar(c, id, campo, k) { const d = col(c).get(id); d[campo] = (Number(d[campo]) || 0) + k; },
    marcaTiempo() { return new Date(); },
    async borrar(c, id) { col(c).delete(id); },
    async tomar(c, id) { const d = col(c).get(id); col(c).delete(id); return d || null; },
    async perfil(uid) { return [...col('usuarios').values()].find(u => u.uid === uid) || null; },
    async verificarIdToken() { throw new Error('sin Firebase Auth en pruebas'); },
    cuentas: {},
    async cuentaCreada(uid) { return this.cuentas[uid] || 0; },
    async usuarioActivo() { return true; }
  };
}

const ADMIN = { uid: 'admin-1', email: 'admin@maya', nombre: 'Dirección', rol: 'admin' };
const VENDEDOR = { uid: 'v-1', email: 'vendedor@maya', nombre: 'Vendedor Dos', rol: 'vendedor' };

let db;
beforeEach(() => {
  db = firestoreFalsa(baseDePrueba());
  usar(db);
  datos.olvidarCache();
});

async function conectar(usuario) {
  const [ladoCliente, ladoServidor] = InMemoryTransport.createLinkedPair();
  const servidor = crearServidor(usuario);
  const cliente = new Client({ name: 'pruebas', version: '1.0.0' });
  await Promise.all([servidor.connect(ladoServidor), cliente.connect(ladoCliente)]);
  return {
    cliente,
    async llamar(nombre, args) {
      const r = await cliente.callTool({ name: nombre, arguments: args || {} });
      const texto = r.content[0].text;
      return r.isError ? { error: texto } : JSON.parse(texto);
    },
    cerrar: () => Promise.all([cliente.close(), servidor.close()])
  };
}

test('ver_nota encuentra una venta por su folio de Facturas (NV-219) o de factura (F-219), aunque NV #219 sea otra', async () => {
  const c = await conectar(ADMIN);
  for (const folio of ['NV-219', 'nv-219', 'F-219', 'NV #243']) {
    const r = await c.llamar('ver_nota', { folio });
    assert.equal(r.encontradas, 1, folio);
    assert.equal(r.notas[0].folio, 'NE-229', folio);
    assert.deepEqual(r.notas[0].otros_folios, ['NV #243', 'NV-219', 'F-219'], folio);
  }
  assert.deepEqual((await c.llamar('ver_nota', { folio: 'NV #219' })).notas.map(n => n.folio), ['NV #219']);
  assert.deepEqual((await c.llamar('ver_nota', { folio: 'NV-195' })).notas.map(n => n.folio), ['NV #219']);
  await c.cerrar();
});

test('ver_nota con solo un número trae todas las notas que lo usan y respeta el tipo si viene', async () => {
  const c = await conectar(ADMIN);
  assert.deepEqual((await c.llamar('ver_nota', { folio: '219' })).notas.map(n => n.folio).sort(), ['NE-229', 'NV #219']);
  assert.deepEqual((await c.llamar('ver_nota', { folio: 'NE-39' })).notas.map(n => n.folio), ['NE-039']);
  // Las canceladas no están en el historial (como en la app); se consultan con buscar_ventas
  assert.equal((await c.llamar('ver_nota', { folio: 'NV #250' })).encontrada, false);
  await c.cerrar();
});

test('el resumen avisa las notas en $0 y los posibles duplicados sin cambiar el total', async () => {
  const c = await conectar(ADMIN);
  const r = await c.llamar('resumen_ventas', { agrupar_por: 'cliente' });
  // NE-039 + NE-226 + NE-229 ($0) + NV #71 + NV #219; sin la cancelada ni la venta generada desde NE-229
  assert.equal(r.resumen.notas, 5);
  assert.equal(r.resumen.total, 10672 + 900 + 0 + 10672 + 500);
  assert.equal(r.resumen.notas_sin_importe, 1);
  assert.deepEqual(r.resumen.folios_sin_importe, ['NE-229']);
  assert.deepEqual(r.resumen.posibles_duplicados, ['NV #71 y NE-039']);
  await c.cerrar();
});

test('historial_notas muestra en cada NE los folios de la venta que generó', async () => {
  const c = await conectar(ADMIN);
  const r = await c.llamar('historial_notas', { desde: '2026-10-01', hasta: '2026-10-31' });
  const ne229 = r.notas.find(n => n.folio === 'NE-229');
  assert.deepEqual(ne229.otros_folios, ['NV #243', 'NV-219', 'F-219']);
  assert.equal(r.notas.find(n => n.folio === 'NE-226').otros_folios, undefined);
  await c.cerrar();
});

test('buscar_clientes ordena por nombre, da el total y no pone "activo" en la dirección', async () => {
  const c = await conectar(ADMIN);
  const r = await c.llamar('buscar_clientes', { limite: 2 });
  assert.equal(r.encontrados, 3);
  assert.equal(r.mostrando, 2);
  assert.deepEqual(r.clientes.map(x => x.nombre), ['Álvaro Pérez', 'Razón Social']);
  assert.equal(r.clientes[0].direccion, 'León, C.P. 37353');
  await c.cerrar();
});

test('buscar_productos da el total encontrado', async () => {
  const c = await conectar(ADMIN);
  const r = await c.llamar('buscar_productos', { solo_bajo_stock: true });
  assert.equal(r.encontrados, 1);
  assert.deepEqual(r.productos.map(p => p.codigo), ['A1']);
  await c.cerrar();
});

test('buscar_productos_ml: última sincronización, piezas y filtros; solo para roles con inventario', async () => {
  const admin = await conectar(ADMIN);
  const r = await admin.llamar('buscar_productos_ml', {});
  assert.equal(r.encontrados, 2);
  assert.equal(r.piezas_disponibles, 3);
  assert.equal(r.ultima_sincronizacion, '2026-10-30 15:00');
  assert.deepEqual((await admin.llamar('buscar_productos_ml', { solo_sin_existencias: true })).productos.map(p => p.id), ['MLM2']);
  assert.deepEqual((await admin.llamar('buscar_productos_ml', { estatus: 'active', texto: 'creta' })).productos.map(p => p.id), ['MLM1']);
  await admin.cerrar();

  const vendedor = await conectar(VENDEDOR);
  const { tools } = await vendedor.cliente.listTools();
  assert.ok(!tools.some(t => t.name === 'buscar_productos_ml'));
  await vendedor.cerrar();
});

test('buscar_productos_ml avisa cuando nunca se ha sincronizado', async () => {
  db.cols.ml_productos.clear();
  const c = await conectar(ADMIN);
  const r = await c.llamar('buscar_productos_ml', {});
  assert.equal(r.encontrados, 0);
  assert.match(r.aviso, /Sincronizar ML/);
  await c.cerrar();
});

test('buscar_registros entrega las fechas guardadas en milisegundos como AAAA-MM-DD', async () => {
  const c = await conectar(ADMIN);
  const r = await c.llamar('buscar_registros', { modulo: 'cotizaciones' });
  assert.equal(r.registros[0].fecha, '2026-06-26');
  await c.cerrar();
});

test('resumen_compras calcula utilidad por artículo, filtra y conserva compras anteriores', async () => {
  const c = await conectar(ADMIN);
  const r = await c.llamar('resumen_compras', {});
  assert.equal(r.compras_encontradas, 2);
  assert.deepEqual(r.resumen, {
    total_compra: 650,
    ingresos_venta: 730,
    utilidad_bruta: 280,
    piezas_compradas: 5,
    piezas_vendidas: 3,
    piezas_pendientes: 2
  });
  assert.equal(r.compras[0].articulos[0].utilidad_bruta, 80);
  assert.equal(r.compras[0].articulos[1].utilidad_bruta, 50);
  assert.equal(r.compras[1].articulos[0].ingresos_venta, 250, 'mantiene el ingreso acumulado de registros anteriores');
  assert.equal(db.lecturas.compras, 1);
  assert.equal(db.lecturas.ventas, undefined, 'consulta compras sin leer la colección de ventas');
  assert.equal(db.lecturas.productos, undefined, 'consulta compras sin leer el inventario');

  const filtrada = await c.llamar('resumen_compras', { texto: 'faro derecho', desde: '2026-11-01', hasta: '2026-11-30' });
  assert.equal(filtrada.compras_encontradas, 1);
  assert.deepEqual(filtrada.resumen, {
    total_compra: 200,
    ingresos_venta: 180,
    utilidad_bruta: 80,
    piezas_compradas: 2,
    piezas_vendidas: 1,
    piezas_pendientes: 1
  });

  const registros = await c.llamar('buscar_registros', { modulo: 'compras', texto: 'espejo' });
  assert.equal(registros.encontrados, 1);
  assert.equal(registros.registros[0].id, 'compra1');
  await c.cerrar();
});

test('solo administración y almacén pueden consultar compras con Pepito', async () => {
  const pepito = require('./pepito');
  const admin = await pepito.herramientasDe(ADMIN, 'gestor');
  assert.ok(admin.tools.some(tool => tool.name === 'resumen_compras'));
  assert.ok(admin.tools.some(tool => tool.name === 'crear_compra' && admin.escribe('crear_compra')));
  assert.ok(admin.tools.some(tool => tool.name === 'eliminar_compra' && admin.escribe('eliminar_compra')));
  const adminResultado = await admin.llamar('resumen_compras', {});
  assert.equal(adminResultado.error, false);
  assert.equal(JSON.parse(adminResultado.texto).resumen.utilidad_bruta, 280);
  await admin.cerrar();

  const almacen = await pepito.herramientasDe({ uid: 'a-1', nombre: 'Almacén', rol: 'almacen' }, 'gestor');
  assert.ok(almacen.tools.some(tool => tool.name === 'resumen_compras'));
  assert.ok(almacen.tools.some(tool => tool.name === 'crear_compra' && almacen.escribe('crear_compra')));
  assert.ok(almacen.tools.some(tool => tool.name === 'eliminar_compra' && almacen.escribe('eliminar_compra')));
  const resultado = await almacen.llamar('resumen_compras', { proveedor: 'faro' });
  assert.equal(resultado.error, false);
  assert.equal(JSON.parse(resultado.texto).compras_encontradas, 1);
  await almacen.cerrar();

  for (const usuario of [VENDEDOR, { uid: 'f-1', nombre: 'Facturación', rol: 'facturacion' }]) {
    const h = await pepito.herramientasDe(usuario, 'gestor');
    assert.ok(!h.tools.some(tool => tool.name === 'resumen_compras'));
    assert.ok(!h.tools.some(tool => tool.name === 'crear_compra' || tool.name === 'eliminar_compra'));
    const generic = h.tools.find(tool => tool.name === 'buscar_registros');
    if (generic) assert.ok(!generic.input_schema.properties.modulo.enum.includes('compras'));
    await h.cerrar();
  }
});

test('Pepito propone crear y eliminar compras; ejecuta cada acción solo al confirmar', async () => {
  process.env.ANTHROPIC_API_KEY = 'prueba';
  const pepito = require('./pepito');
  const falsa = claudeFalso([
    herramienta('crear_compra', {
      fecha: '2026-11-06',
      proveedor: 'Proveedor Prueba',
      articulos: [
        { pieza: 'Faro nuevo', cantidad_comprada: 2, costo_unitario: 1000, cantidad_vendida: 0, precio_venta: 0 }
      ]
    }),
    texto('Voy a registrar 2 faros por $1,000 cada uno con Proveedor Prueba. ¿Confirmas?'),
    texto('Compra registrada.'),
    herramienta('eliminar_compra', { id: 'nuevo1', confirmar: true }),
    texto('Voy a eliminar la compra de 2 faros de Proveedor Prueba. ¿Confirmas?'),
    texto('Compra eliminada y respaldada.')
  ]);
  pepito._usarCliente(falsa);

  const propuestaAlta = await pepito.conversar(ADMIN, 'Registra esta compra', 'gestor');
  assert.equal(propuestaAlta.propuesta.herramienta, 'crear_compra');
  assert.equal(db.cols.compras.has('nuevo1'), false, 'no guarda antes de la confirmación');
  const alta = await pepito.resolverPropuesta(ADMIN, propuestaAlta.propuesta.id, true, 'gestor');
  assert.equal(db.cols.compras.get('nuevo1').articulos[0].pieza, 'Faro nuevo');
  assert.equal(alta.herramienta, 'crear_compra');

  const propuestaBaja = await pepito.conversar(ADMIN, 'Elimina esa compra', 'gestor');
  assert.equal(propuestaBaja.propuesta.herramienta, 'eliminar_compra');
  assert.equal(db.cols.compras.has('nuevo1'), true, 'conserva la compra antes de confirmar el borrado');
  const baja = await pepito.resolverPropuesta(ADMIN, propuestaBaja.propuesta.id, true, 'gestor');
  assert.equal(db.cols.compras.has('nuevo1'), false);
  const respaldo = [...db.cols.papelera.values()].find(doc => doc.coleccion === 'compras' && doc.idOriginal === 'nuevo1');
  assert.equal(respaldo.datos.articulos[0].pieza, 'Faro nuevo');
  assert.equal(baja.herramienta, 'eliminar_compra');
});

test('guardar_producto con id sí cambia el código; buscado por código no lo cambia', async () => {
  const c = await conectar(ADMIN);
  const r = await c.llamar('guardar_producto', { id: 'p1', codigo: 'A1-NUEVO' });
  assert.equal(r.codigo, 'A1-NUEVO');
  assert.equal(db.cols.productos.get('p1').codigo, 'A1-NUEVO');
  const r2 = await c.llamar('guardar_producto', { codigo: 'B2', precio: 850 });
  assert.equal(r2.actualizado, 'p2');
  assert.equal(db.cols.productos.get('p2').codigo, 'B2');
  assert.equal(db.cols.productos.get('p2').precio, 850);
  await c.cerrar();
});

test('guardar_proveedor con id y sin datos da un mensaje claro y no toca Firebase', async () => {
  const c = await conectar(ADMIN);
  const r = await c.llamar('guardar_proveedor', { id: 'pr1' });
  assert.equal(r.error, 'No mandaste ningún dato para cambiar');
  assert.deepEqual(db.cols.proveedores.get('pr1'), { nombre: 'Proveedor Uno', telefono: '555' });
  await c.cerrar();
});

test('crear_nota_entrega guarda como la app y su venta se encuentra por cualquiera de sus folios', async () => {
  const c = await conectar(ADMIN);
  const r = await c.llamar('crear_nota_entrega', {
    cliente: 'refacciones prueba', fecha: '2026-11-02',
    articulos: [{ descripcion: 'Faro Izquierdo Kia K3', cantidad: 2, precio_unitario: 4000 }]
  });
  assert.equal(r.creada.folio, 'NE-230');
  assert.equal(r.creada.total, 8000);
  assert.equal(r.venta_registrada.folio, 'NV #251');
  const venta = [...db.cols.ventas.values()].find(v => v.notaEntregaId === 'NE-230');
  assert.equal(venta.fuente, 'nota_entrega');
  assert.equal(venta.estatus, 'Entregado');
  assert.equal(venta.items[0].pedido, 'Faro Izquierdo Kia K3 x2');
  const vista = await c.llamar('ver_nota', { folio: 'NV #251' });
  assert.deepEqual(vista.notas.map(n => n.folio), ['NE-230']);
  await c.cerrar();
});

test('varias preguntas seguidas leen cada colección de Firebase una sola vez (límite diario del plan Spark)', async () => {
  const c = await conectar(ADMIN);
  await c.llamar('resumen_ventas', { agrupar_por: 'cliente' });
  await c.llamar('resumen_ventas', { agrupar_por: 'mes' });
  await c.llamar('historial_notas', { desde: '2026-10-01', hasta: '2026-10-31' });
  await c.llamar('ver_nota', { folio: 'NV-219' });
  await c.llamar('buscar_ventas', { texto: 'NV-219' });
  await c.llamar('buscar_clientes', {});
  await c.llamar('buscar_clientes', { texto: 'zeta' });
  assert.deepEqual(db.lecturas, { notasEntrega: 1, ventas: 1, clientes: 1 });
  // Un alta desde Claude limpia el caché: la siguiente consulta ya la ve
  await c.llamar('crear_nota_entrega', { cliente: 'Zeta Autopartes', articulos: [{ descripcion: 'Espejo', cantidad: 1, precio_unitario: 500 }] });
  assert.equal((await c.llamar('ver_nota', { folio: 'NE-230' })).notas[0].folio, 'NE-230');
  await c.cerrar();
});

test('OAuth: una cuenta sin perfil en usuarios ya no entra (antes entraba como admin)', async () => {
  const oauth = require('./oauth');
  const crypto = require('node:crypto');
  const huella = t => crypto.createHash('sha256').update(t).digest('hex');
  const futuro = Date.now() + 60000;
  await db.guardar('mcp_tokens', huella('tok-admin'), { uid: 'admin-1', email: 'admin@maya', expira: futuro });
  await db.guardar('mcp_tokens', huella('tok-sin-perfil'), { uid: 'intruso', email: 'x@y.z', expira: futuro });
  const ok = await oauth.autenticar({ headers: { authorization: 'Bearer tok-admin' } });
  assert.equal(ok.usuario.rol, 'admin');
  db.cuentas.intruso = Date.parse('2026-11-10T00:00:00Z'); // cuenta nueva, creada después de cerrar el registro
  const no = await oauth.autenticar({ headers: { authorization: 'Bearer tok-sin-perfil' } });
  assert.equal(no.error, 'invalid_token');
  assert.equal(no.usuario, undefined);
  db.cuentas.intruso = Date.parse('2026-06-01T00:00:00Z'); // cuenta que ya existía: conserva su acceso
  const vieja = await oauth.autenticar({ headers: { authorization: 'Bearer tok-sin-perfil' } });
  assert.equal(vieja.usuario.rol, 'admin');
});

test('buzón de Pepito: revisar trae pendientes con permisos del rol; responder lo marca; solo admin lo atiende', async () => {
  await db.guardar('buzon_pepito', 'b1', { texto: '¿Cuánto vendimos ayer?', uid: 'v-1', nombre: 'Vendedor Dos', rol: 'vendedor', estado: 'pendiente', createdAt: new Date('2026-11-03T16:00:00Z') });
  await db.guardar('buzon_pepito', 'b0', { texto: 'Hazme una cotización', uid: 'a-1', nombre: 'Almacén', rol: 'almacen', estado: 'pendiente', createdAt: new Date('2026-11-03T15:00:00Z'),
    contexto: { pregunta: 'antes', respuesta: 'propuesta' } });
  await db.guardar('buzon_pepito', 'b2', { texto: 'ya contestado', uid: 'v-1', rol: 'vendedor', estado: 'respondido' });
  const c = await conectar(ADMIN);
  const r = await c.llamar('revisar_buzon', {});
  assert.equal(r.pendientes, 2);
  assert.deepEqual(r.pedidos.map(p => p.id), ['b0', 'b1']);
  assert.ok(r.pedidos[1].puede_usar.includes('ventas'));
  assert.ok(!r.pedidos[1].puede_usar.includes('prestamos'));
  assert.ok(!r.pedidos[0].puede_usar.includes('cotizaciones'));
  assert.equal(r.pedidos[1].puede_borrar, false);
  assert.equal(r.pedidos[0].contexto.respuesta_anterior, 'propuesta');
  assert.ok(db.cols.config.get('buzon_pepito').ultimaRevision);
  const ok = await c.llamar('responder_buzon', { id: 'b1', respuesta: 'Ayer: $1,000', adjuntos: [{ tipo: 'nota_entrega', id: 'ne1', folio: 'NE-1' }] });
  assert.equal(ok.ok, true);
  assert.deepEqual(db.cols.buzon_pepito.get('b1').adjuntos, [{ tipo: 'nota_entrega', id: 'ne1', folio: 'NE-1' }]);
  assert.equal(db.cols.buzon_pepito.get('b1').estado, 'respondido');
  assert.equal(db.cols.buzon_pepito.get('b1').respuesta, 'Ayer: $1,000');
  assert.match((await c.llamar('responder_buzon', { id: 'nada', respuesta: 'x' })).error, /No existe/);
  assert.equal((await c.llamar('revisar_buzon', {})).pendientes, 1);
  await c.cerrar();

  const v = await conectar(VENDEDOR);
  const { tools } = await v.cliente.listTools();
  assert.ok(!tools.some(t => t.name === 'revisar_buzon' || t.name === 'responder_buzon'));
  await v.cerrar();
});

test('facturación y cobranza: pendientes sin factura y saldos con días vencidos; solo admin y facturación', async () => {
  // v71 ya tiene factura por cobrar (vencida); v219 tiene una cancelada, así que sigue pendiente
  db.cols.ventas.get('v71').facturaId = 'f1';
  db.cols.ventas.get('v219').facturaId = 'f0';
  const hace = d => Date.now() - d * 86400000;
  await db.guardar('facturas', 'f1', { serieFolio: 'A-100', clienteNombre: 'Refacciones Prueba', fecha: hace(40), vencimiento: hace(10), total: 10672, saldo: 4000, estatus: 'por_cobrar', pagos: [{ monto: 6672 }], notas: [{ folio: 'NV #71' }] });
  await db.guardar('facturas', 'f2', { serieFolio: 'A-101', clienteNombre: 'Zeta Autopartes', fecha: hace(2), vencimiento: hace(-28), total: 2000, saldo: 2000, estatus: 'por_cobrar', notas: [] });
  await db.guardar('facturas', 'f3', { serieFolio: 'A-102', clienteNombre: 'Zeta Autopartes', fecha: hace(5), vencimiento: hace(1), total: 900, saldo: 0, estatus: 'pagada' });
  await db.guardar('facturas', 'f0', { serieFolio: 'A-099', estatus: 'cancelada', saldo: 0 });
  const c = await conectar(ADMIN);
  const p = await c.llamar('pendientes_facturar', {});
  const folios = p.por_cliente.flatMap(g => g.folios);
  assert.ok(!folios.includes('NV #71'), 'la que tiene factura no está pendiente');
  assert.ok(folios.includes('NV #219'), 'la de factura cancelada vuelve a pendientes');
  assert.ok(!folios.includes('NV #250'), 'las canceladas no cuentan');
  const cob = await c.llamar('cobranza', {});
  assert.equal(cob.facturas, 2);
  assert.equal(cob.por_cobrar, 6000);
  assert.equal(cob.vencido, 4000);
  assert.equal(cob.detalle[0].factura, 'A-100');
  assert.equal(cob.detalle[0].dias_vencida, 10);
  assert.equal((await c.llamar('cobranza', { solo_vencidas: true })).facturas, 1);
  await c.cerrar();
  const v = await conectar(VENDEDOR);
  const { tools } = await v.cliente.listTools();
  assert.ok(!tools.some(t => t.name === 'cobranza' || t.name === 'pendientes_facturar'));
  await v.cerrar();
  const f = await conectar({ uid: 'g1', email: 'fac@maya', nombre: 'Facturación', rol: 'facturacion' });
  const nombres = (await f.cliente.listTools()).tools.map(t => t.name);
  assert.ok(nombres.includes('cobranza') && nombres.includes('historial_notas') && !nombres.includes('eliminar_registro'));
  await f.cerrar();
});

// ── Pepito con la API de Claude (cliente simulado: no llama a Anthropic) ──
function claudeFalso(guion) {
  const llamadas = [];
  const crear = async params => {
    llamadas.push(params);
    const paso = guion.shift();
    if (!paso) throw new Error('guion agotado');
    return typeof paso === 'function' ? paso(params) : paso;
  };
  return { llamadas, messages: { create: crear }, beta: { messages: { create: crear } } };
}
const usoFalso = { input_tokens: 100, output_tokens: 20 };
const herramienta = (name, input, id) => ({ stop_reason: 'tool_use', usage: usoFalso, content: [{ type: 'tool_use', id: id || 't' + name, name, input }] });
const texto = t => ({ stop_reason: 'end_turn', usage: usoFalso, content: [{ type: 'text', text: t }] });

test('Pepito API: consulta con herramientas del rol y propuesta que solo se guarda al confirmar', async () => {
  process.env.ANTHROPIC_API_KEY = 'prueba';
  const pepito = require('./pepito');
  const cot = { cliente: 'Zeta Autopartes', partidas: [{ descripcion: 'Faro', precio: 1000, iva_porcentaje: 16, ajuste: 0 }] };
  const falso = claudeFalso([
    herramienta('resumen_ventas', { agrupar_por: 'mes' }),
    texto('Este año van varias notas.'),
    herramienta('crear_cotizacion', cot),
    texto('Voy a guardar una cotización para Zeta Autopartes por $1,160. ¿La guardo?'),
    texto('Listo, quedó la COT.')
  ]);
  pepito._usarCliente(falso);
  const r1 = await pepito.conversar(ADMIN, '¿cómo vamos?', 'gestor');
  assert.equal(r1.texto, 'Este año van varias notas.');
  assert.deepEqual(r1.herramientas, ['resumen_ventas']);
  // Las herramientas que recibe Claude son las del rol, sin el buzón
  const nombres = falso.llamadas[0].tools.map(t => t.name);
  assert.ok(nombres.includes('crear_cotizacion') && !nombres.includes('revisar_buzon'));
  assert.equal(falso.llamadas[0].fallbacks, 'default');
  // El resultado de la herramienta regresó a Claude
  assert.equal(falso.llamadas[1].messages.at(-1).content[0].type, 'tool_result');

  const antes = db.cols.cotizaciones.size;
  const r2 = await pepito.conversar(ADMIN, 'hazme una cotización de un faro para Zeta a 1000', 'gestor');
  assert.ok(r2.propuesta && r2.propuesta.herramienta === 'crear_cotizacion');
  assert.equal(db.cols.cotizaciones.size, antes, 'no se guarda hasta confirmar');
  assert.match(falso.llamadas[3].messages.at(-1).content[0].content, /PENDIENTE DE CONFIRMACIÓN/);

  await assert.rejects(() => pepito.resolverPropuesta(ADMIN, 'otra', true, 'gestor'), /ya no está pendiente/);
  const r3 = await pepito.resolverPropuesta(ADMIN, r2.propuesta.id, true, 'gestor');
  assert.equal(r3.texto, 'Listo, quedó la COT.');
  assert.equal(db.cols.cotizaciones.size, antes + 1, 'al confirmar sí se guarda');
  await assert.rejects(() => pepito.resolverPropuesta(ADMIN, r2.propuesta.id, true, 'gestor'), /ya no está pendiente/);
  const conv = db.cols.pepito_conversacion.get('admin-1');
  assert.equal(conv.mensajes.length, 5);
  assert.equal(conv.propuesta, null);
  const uso = [...db.cols.pepito_uso.values()][0];
  assert.equal(uso.mensajes, 2);
  // La Oficina 3D se entera de qué área trabajó: consultó reportes, propuso y guardó en dirección (cotización)
  const act = db.cols.config.get('pepito_actividad').eventos;
  assert.deepEqual(act.map(e => [e.accion, e.area]), [['guardó', 'direccion'], ['propuso', 'direccion'], ['consultó', 'reportes']]);
});

test('Pepito API: un vendedor no recibe herramientas de su rol prohibido y hay límite diario', async () => {
  process.env.ANTHROPIC_API_KEY = 'prueba';
  const pepito = require('./pepito');
  const falso = claudeFalso([texto('Hola')]);
  pepito._usarCliente(falso);
  await pepito.conversar(VENDEDOR, 'hola', 'whatsapp');
  const nombres = falso.llamadas[0].tools.map(t => t.name);
  assert.ok(!nombres.includes('eliminar_registro') && !nombres.includes('cobranza') && !nombres.includes('guardar_producto'));
  assert.match(falso.llamadas[0].system[0].text, /WhatsApp/);
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  db.cols.pepito_uso.set('v-1_' + hoy, { uid: 'v-1', mensajes: 999, entrada: 0, salida: 0, cache: 0 });
  await assert.rejects(() => pepito.conversar(VENDEDOR, 'otra', 'gestor'), /mensajes de hoy/);
});

test('Acceso por WhatsApp: solo números registrados (52 o 521 + 10 dígitos)', async () => {
  const acceso = require('./acceso');
  db.cols.usuarios.get('u1').whatsapp10 = '5512345678';
  assert.equal((await acceso.porWhatsApp('5215512345678')).uid, 'admin-1');
  assert.equal((await acceso.porWhatsApp('525512345678')).uid, 'admin-1');
  assert.equal(await acceso.porWhatsApp('5219999999999'), null);
});

test('crear venta y cotización sin vendedor no ponen al usuario conectado; con vendedor sí lo guardan', async () => {
  const c = await conectar(ADMIN);
  const partidas = [{ descripcion: 'Cristal', precio: 1000, iva_porcentaje: 0 }];
  const v = await c.llamar('crear_venta', { cliente: 'Zeta Autopartes', partidas });
  assert.equal(db.cols.ventas.get(v.creada.id).vendedor, '');
  const v2 = await c.llamar('crear_venta', { cliente: 'Zeta Autopartes', partidas, vendedor: 'Daniel' });
  assert.equal(db.cols.ventas.get(v2.creada.id).vendedor, 'Daniel');
  const cot = await c.llamar('crear_cotizacion', { cliente: 'Zeta Autopartes', partidas });
  assert.equal(db.cols.cotizaciones.get(cot.creada).vendedor, '');
  await c.cerrar();
});

test('Pepito API: enviar_whatsapp a alguien del equipo queda como propuesta y solo se envía al confirmar', async () => {
  process.env.ANTHROPIC_API_KEY = 'prueba';
  process.env.WHATSAPP_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_ID = '123';
  const enviados = [];
  let respuesta = { ok: true, status: 200, text: async () => '{}' };
  const fetchOriginal = global.fetch;
  global.fetch = async (url, op) => { enviados.push(JSON.parse(op.body)); return respuesta; };
  try {
    db.cols.usuarios.set('u2', { uid: 'd-1', nombre: 'Daniel Hernandez', rol: 'vendedor', whatsapp10: '5512345678' });
    const pepito = require('./pepito');
    const falso = claudeFalso([
      herramienta('enviar_whatsapp', { para: 'daniel', mensaje: 'Ya llegó el faro de Rocco' }),
      texto('Le voy a mandar a Daniel: "Ya llegó el faro de Rocco". ¿Lo envío?'),
      texto('Listo, ya le mandé el mensaje a Daniel.'),
      herramienta('enviar_whatsapp', { para: 'daniel', mensaje: 'otro' }),
      texto('¿Lo envío?')
    ]);
    pepito._usarCliente(falso);
    const r = await pepito.conversar(ADMIN, 'avísale a Daniel que ya llegó el faro de Rocco', 'gestor');
    assert.ok(falso.llamadas[0].tools.some(t => t.name === 'enviar_whatsapp'));
    assert.equal(r.propuesta.herramienta, 'enviar_whatsapp');
    assert.equal(enviados.length, 0, 'no se manda hasta confirmar');
    await pepito.resolverPropuesta(ADMIN, r.propuesta.id, true, 'gestor');
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].to, '525512345678');
    assert.match(enviados[0].text.body, /^Mensaje de Dirección \(vía Pepito\):\nYa llegó el faro de Rocco$/);
    // Fuera de la ventana de 24 h, se explica qué hacer
    respuesta = { ok: false, status: 400, text: async () => JSON.stringify({ error: { code: 131047, message: 'Re-engagement message' } }) };
    const r2 = await pepito.conversar(ADMIN, 'mándale otro', 'gestor');
    const res = await pepito.resolverPropuesta(ADMIN, r2.propuesta.id, true, 'gestor');
    assert.match(res.texto, /24 horas/);
    // Alguien sin número registrado no se encuentra
    const h = await pepito.herramientasDe(ADMIN);
    const no = await h.llamar('enviar_whatsapp', { para: 'Nadie', mensaje: 'hola' });
    assert.equal(no.error, true);
    assert.match(no.texto, /No encontré/);
    await h.cerrar();
  } finally {
    global.fetch = fetchOriginal;
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_ID;
  }
});

test('PDF en el servidor: mismo generador de la app para nota de entrega, venta y cotización', async () => {
  const pdf = require('./pdf');
  const ne = { id: 'n', notaId: 'NE-9', fecha: '2026-11-04', cliente: 'Zeta', items: [{ descripcion: 'Faro', cantidad: 1, precioUnit: 100 }], subtotal: 100, ivaTotal: 0, total: 100 };
  const nv = { id: 'v', notaId: '9', fecha: Date.now(), clienteNombre: 'Zeta', items: [{ pedido: 'Faro', precio: 100, iva: 16, ajuste: 0 }], subtotal: 100, ivaTotal: 16, total: 116 };
  const cot = { id: 'c', notaId: '3', fecha: Date.now(), clienteNombre: 'Zeta', items: [{ pedido: 'Faro', precio: 100, iva: 16, ajuste: 0 }], subtotal: 100, ivaTotal: 16, total: 116 };
  for (const [tipo, reg, nombre] of [['nota_entrega', ne, 'nota-entrega-NE-9.pdf'], ['nota_venta', nv, 'NV-9.pdf'], ['cotizacion', cot, 'cotizacion-3.pdf']]) {
    const r = await pdf.generar(tipo, reg, { data: { clientes: [] } });
    assert.equal(r.archivo, nombre);
    assert.equal(r.datos.slice(0, 5).toString(), '%PDF-');
    assert.ok(r.datos.length > 5000);
  }
});

test('mandar_pdf: solo por WhatsApp, con número registrado y según el rol', async () => {
  process.env.WHATSAPP_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_ID = '123';
  try {
    const pepito = require('./pepito');
    const enGestor = await pepito.herramientasDe(ADMIN, 'gestor');
    assert.ok(!enGestor.tools.some(t => t.name === 'mandar_pdf'));
    await enGestor.cerrar();
    const almacen = { uid: 'a-1', nombre: 'Almacén', rol: 'almacen', whatsapp10: '5511111111' };
    const h = await pepito.herramientasDe(almacen, 'whatsapp');
    assert.ok(h.tools.some(t => t.name === 'mandar_pdf'));
    assert.equal(h.escribe('mandar_pdf'), false, 'no pide confirmación: solo le llega a quien lo pidió');
    const no = await h.llamar('mandar_pdf', { tipo: 'cotizacion', id: 'x' });
    assert.match(no.texto, /rol no puede/);
    await h.cerrar();
  } finally {
    delete process.env.WHATSAPP_TOKEN;
    delete process.env.WHATSAPP_PHONE_ID;
  }
});

test('reporte diario: ventas de ayer, por facturar y cobranza, según el rol', async () => {
  const reporte = require('./reporte');
  const ayerISO = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
  db.cols.ventas.set('vAyer', { notaId: '300', estatus: 'Pendiente', clienteNombre: 'Zeta Autopartes', fecha: ms(ayerISO) + 12 * 3600000, items: [{ pedido: 'Faro', precio: 1000, iva: 160, ajuste: 0 }], subtotal: 1000, ivaTotal: 160, ajusteTotal: 0, total: 1160 });
  await db.guardar('facturas', 'fv', { serieFolio: 'A-7', clienteNombre: 'Zeta Autopartes', fecha: Date.now() - 40 * 86400000, vencimiento: Date.now() - 5 * 86400000, total: 500, saldo: 500, estatus: 'por_cobrar' });
  const rep = await reporte.armar();
  assert.equal(rep.ayer, ayerISO);
  assert.ok(rep.ventas.notas >= 1);
  assert.ok(rep.ventas.top.some(([c]) => c === 'Zeta Autopartes'));
  assert.equal(rep.cobranza.vencidas, 1);
  const admin = reporte.texto(rep, { nombre: 'Omar Coronel', rol: 'admin' });
  assert.match(admin, /^Buenos días, Omar\./);
  assert.match(admin, /Ventas:/);
  assert.match(admin, /A-7 de Zeta Autopartes, 5 días/);
  const fac = reporte.texto(rep, { nombre: 'Geraldine', rol: 'facturacion' });
  assert.doesNotMatch(fac, /Ventas:/, 'facturación no ve ventas');
  assert.doesNotMatch(reporte.corto(rep, { rol: 'admin' }), /\n/, 'la plantilla no lleva saltos de línea');
});

test('emparejar factura con notas: siniestro, pieza con abreviaturas, importe y suma de varias notas', async () => {
  const { emparejar } = await import('../public/diseno/emparejar.js');
  const dia = d => Date.parse('2026-11-' + d + 'T12:00:00Z');
  const notas = [
    { clave: 'ne:1', cliente: 'LATAM', fecha: dia('01'), total: 9200, siniestro: 'B84247461', items: [{ descripcion: 'Faro Derecho Creta', anio: '2021', cantidad: 1, precioUnit: 9200, siniestro: 'B84247461' }] },
    { clave: 'ne:2', cliente: 'LATAM', fecha: dia('02'), total: 2500, siniestro: '', items: [{ descripcion: 'Espejo izquierdo Aveo', anio: '2019', cantidad: 1, precioUnit: 2500 }] },
    { clave: 'ne:3', cliente: 'LATAM', fecha: dia('02'), total: 4300, siniestro: '', items: [{ descripcion: 'Marco radiador Transit', cantidad: 1, precioUnit: 4300 }] },
    { clave: 'ne:4', cliente: 'Otro Taller', fecha: dia('01'), total: 9200, siniestro: 'B11111111', items: [{ descripcion: 'Faro derecho Creta', anio: '2021', cantidad: 1, precioUnit: 9200 }] },
    { clave: 'nv:5', cliente: 'LATAM', fecha: dia('03'), total: 1000, items: [{ pedido: 'Tapón de tanque', precio: 1000 }] }
  ];
  const deLatam = n => n.cliente === 'LATAM';
  // 1) El siniestro viene en las observaciones de la factura; el concepto dice "FARO DER. CRETA 21"
  const f1 = { fecha: dia('04'), subtotal: 9200, total: 10672, conceptos: [{ descripcion: 'FARO DER. CRETA 2021', importe: 9200 }], textoCompleto: '<cfdi:Comprobante Observaciones="SINIESTRO B84247461">' };
  const r1 = emparejar(f1, notas, deLatam);
  assert.deepEqual(r1.elegidas.map(e => e.clave), ['ne:1']);
  assert.ok(r1.elegidas[0].razones.some(x => x.tipo === 'siniestro'));
  assert.ok(r1.cuadra);
  assert.ok(!r1.elegidas.some(e => e.clave === 'ne:4'), 'la nota igual de otro cliente no se elige');
  // 2) Sin siniestro: por pieza (con abreviaturas) e importe
  const f2 = { fecha: dia('04'), subtotal: 6800, total: 7888, conceptos: [{ descripcion: 'ESPEJO IZQ AVEO 2019', importe: 2500 }, { descripcion: 'MARCO DE RADIADOR FORD TRANSIT', importe: 4300 }] };
  const r2 = emparejar(f2, notas, deLatam);
  assert.deepEqual(r2.elegidas.map(e => e.clave).sort(), ['ne:2', 'ne:3']);
  assert.ok(r2.cuadra);
  // 3) Conceptos genéricos: la combinación de notas del cliente que da el total
  const f3 = { fecha: dia('04'), subtotal: 3500, total: 4060, conceptos: [{ descripcion: 'REFACCIONES VARIAS', importe: 3500 }] };
  const r3 = emparejar(f3, notas, deLatam);
  assert.deepEqual(r3.elegidas.map(e => e.clave).sort(), ['ne:2', 'nv:5']);
  assert.ok(r3.elegidas.every(e => e.razones.some(x => x.tipo === 'suma')));
  // 4) Una nota posterior a la factura no se sugiere
  const f4 = { fecha: dia('01'), subtotal: 1000, total: 1160, conceptos: [{ descripcion: 'TAPON DE TANQUE', importe: 1000 }] };
  assert.ok(!emparejar(f4, notas, deLatam).elegidas.some(e => e.clave === 'nv:5'));
});
