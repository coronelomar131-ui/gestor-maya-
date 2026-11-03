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
