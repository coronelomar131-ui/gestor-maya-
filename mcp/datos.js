// Datos que consulta el servidor MCP. Notas de entrega (NE) y de venta (NV) se arman con la misma lógica
// del historial de notas de public/index.html (sección NOTAS DE ENTREGA): si cambia una, cambia la otra.
const { fb } = require('./firebase');

const pad = n => String(n).padStart(2, '0');

function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function centavos(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, ''));
  return isFinite(n) ? Math.round(n * 100) : 0;
}

const pesos = c => Math.round(c) / 100;

function aFecha(v) {
  if (v == null || v === '') return null;
  const d = typeof v.toDate === 'function' ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const mediodia = d => (d ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12) : null);

// Ventas guarda new Date('AAAA-MM-DD').getTime(): medianoche UTC, que se lee en UTC para respetar el día capturado
function dia(v) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(typeof v === 'string' ? v.trim() : '');
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12);
  const d = aFecha(typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v);
  if (d && d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
  }
  return mediodia(d);
}

const fechaISO = d => (d ? d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) : null);
const horaTxt = d => (d ? pad(d.getHours()) + ':' + pad(d.getMinutes()) : null);
const suma = (lista, campo) => lista.reduce((s, it) => s + (Number(it[campo]) || 0), 0);
const numero = v => parseInt(String(v || '').replace(/\D/g, ''), 10) || 0;

function desdeEntrega(n) {
  const items = (Array.isArray(n.items) ? n.items : []).map(it => {
    const cantidad = Number(it.cantidad) || 1;
    const pu = centavos(it.precioUnit);
    return { texto: (it.descripcion || '-') + (it.anio ? ' (' + it.anio + ')' : ''), siniestro: it.siniestro || '', cantidad, pu, importe: Math.round(cantidad * pu) };
  });
  const subtotal = n.subtotal != null ? centavos(n.subtotal) : suma(items, 'importe');
  const iva = centavos(n.ivaTotal);
  const creada = aFecha(n.createdAt);
  return {
    tipo: 'NE', id: n.id, folio: n.notaId || 'NE', numero: numero(n.notaId), otrosFolios: [],
    fecha: dia(n.fecha) || mediodia(creada), creada,
    cliente: n.cliente || '', vendedor: n.vendedor || '', siniestro: n.siniestro || '',
    items, subtotal, iva, ajuste: 0,
    total: n.total != null ? centavos(n.total) : subtotal + iva
  };
}

// Una venta tiene hasta tres folios: su número (NV #243, el de la tabla de Ventas), el de Facturas (NV-219) y el de la factura (F-219)
function foliosVenta(v) {
  const lista = [];
  if (v.notaId) lista.push({ tipo: 'NV', folio: 'NV #' + v.notaId, numero: numero(v.notaId) });
  if (v.notaNumero) lista.push({ tipo: 'NV', folio: String(v.notaNumero), numero: numero(v.notaNumero) });
  if (v.facturaNumero) lista.push({ tipo: 'F', folio: String(v.facturaNumero), numero: numero(v.facturaNumero) });
  return lista;
}

// En Ventas cada partida trae su precio (sin cantidad), su IVA y su ajuste; total = subtotal + IVA − ajuste
function desdeVenta(v) {
  const partidas = Array.isArray(v.items) && v.items.length ? v.items : null;
  const items = partidas
    ? partidas.map(it => ({ texto: it.pedido || it.descripcion || '-', siniestro: it.numSiniestro || '', cantidad: null, pu: null, importe: centavos(it.precio) }))
    : [{ texto: v.descripcion || '-', siniestro: '', cantidad: null, pu: null, importe: centavos(v.total) }];
  const porPartida = campo => (partidas ? partidas.reduce((s, it) => s + centavos(it[campo]), 0) : 0);
  const subtotal = v.subtotal != null ? centavos(v.subtotal) : suma(items, 'importe');
  const iva = v.ivaTotal != null ? centavos(v.ivaTotal) : porPartida('iva');
  const ajuste = v.ajusteTotal != null ? centavos(v.ajusteTotal) : porPartida('ajuste');
  const creada = aFecha(v.createdAt);
  const folio = v.notaId ? 'NV #' + v.notaId : (v.notaNumero || 'NV');
  return {
    tipo: 'NV', id: v.id, folio, numero: numero(v.notaId || v.notaNumero),
    otrosFolios: foliosVenta(v).filter(f => f.folio !== folio),
    fecha: dia(v.fecha) || mediodia(creada), creada,
    cliente: v.clienteNombre || v.cliente || '', vendedor: v.vendedor || '',
    siniestro: String(v.siniestros || items.map(it => it.siniestro).filter(Boolean).join(' | ')),
    items, subtotal, iva, ajuste,
    total: v.total != null ? centavos(v.total) : subtotal + iva - ajuste
  };
}

function armarRegistros(notasEntrega, ventas) {
  const lista = notasEntrega.map(desdeEntrega);
  const porFolio = new Map(lista.map(x => [x.folio, x]));
  ventas.forEach(v => {
    // Las ventas creadas desde una nota de entrega ya están como NE: sus folios quedan en la NE para encontrarla
    // también como "NV-219" o "F-219". Las canceladas no son venta.
    if (v.fuente === 'nota_entrega' || v.notaEntregaId) {
      const ne = porFolio.get(v.notaEntregaId);
      if (ne) ne.otrosFolios = ne.otrosFolios.concat(foliosVenta(v));
      return;
    }
    if (/^cancel/.test(norm(v.estatus))) return;
    lista.push(desdeVenta(v));
  });
  return lista;
}

// Cada colección se lee completa una vez y se reutiliza unos minutos. En el plan Spark de Firebase hay 50,000
// lecturas al día y leer notas + ventas cuesta ~450; leyendo en cada pregunta, unos cuantos informes agotaron el
// límite y la app y el MCP dejaron de leer hasta el día siguiente. Las altas y cambios desde Claude limpian el caché
// (olvidarCache) y la numeración de folios en escritura.js siempre lee de Firebase, sin caché.
const VIGENCIA_MS = 5 * 60 * 1000;
let cache = new Map();

function leer(nombre) {
  const guardado = cache.get(nombre);
  if (guardado && Date.now() <= guardado.hasta) return guardado.promesa;
  const promesa = fb().leerColeccion(nombre);
  promesa.catch(() => { if (cache.get(nombre) && cache.get(nombre).promesa === promesa) cache.delete(nombre); });
  cache.set(nombre, { hasta: Date.now() + VIGENCIA_MS, promesa });
  return promesa;
}

function cargarRegistros() {
  return Promise.all([leer('notasEntrega'), leer('ventas')]).then(([ne, nv]) => armarRegistros(ne, nv));
}

function olvidarCache() {
  cache = new Map();
}

const comparar = (a, b) =>
  ((b.fecha ? b.fecha.getTime() : 0) - (a.fecha ? a.fecha.getTime() : 0)) ||
  ((b.creada ? b.creada.getTime() : 0) - (a.creada ? a.creada.getTime() : 0)) ||
  (b.numero - a.numero);

function diaLocal(iso, finDelDia) {
  const [a, m, d] = iso.split('-').map(Number);
  return finDelDia ? new Date(a, m - 1, d, 23, 59, 59, 999) : new Date(a, m - 1, d, 0, 0, 0, 0);
}

// f: { tipo: 'todas' | 'entrega' | 'venta', cliente, vendedor, desde, hasta } (fechas AAAA-MM-DD, inclusivas)
function filtrar(lista, f) {
  const tipo = f.tipo === 'entrega' ? 'NE' : f.tipo === 'venta' ? 'NV' : '';
  const cliente = norm(f.cliente);
  const vendedor = norm(f.vendedor);
  const desde = f.desde ? diaLocal(f.desde, false) : null;
  const hasta = f.hasta ? diaLocal(f.hasta, true) : null;
  return lista.filter(x => {
    if (tipo && x.tipo !== tipo) return false;
    if (cliente && !norm(x.cliente).includes(cliente)) return false;
    if (vendedor && !norm(x.vendedor).includes(vendedor)) return false;
    if ((desde || hasta) && !x.fecha) return false;
    if (desde && x.fecha < desde) return false;
    if (hasta && x.fecha > hasta) return false;
    return true;
  }).sort(comparar);
}

// Una venta capturada como NV y aparte como NE (sin ligarlas) se sumaría dos veces: se avisa, no se quita
function duplicados(lista) {
  const entregas = lista.filter(x => x.tipo === 'NE' && x.total > 0 && x.fecha);
  const usadas = new Set();
  const pares = [];
  lista.forEach(v => {
    if (v.tipo !== 'NV' || !(v.total > 0) || !v.fecha) return;
    let mejor = null;
    entregas.forEach(e => {
      if (usadas.has(e.id) || e.total !== v.total || norm(e.cliente) !== norm(v.cliente)) return;
      const dif = Math.abs(e.fecha - v.fecha);
      if (dif <= 1296e5 && (!mejor || dif < mejor.dif)) mejor = { e, dif };
    });
    if (mejor) {
      usadas.add(mejor.e.id);
      pares.push(v.folio + ' y ' + mejor.e.folio);
    }
  });
  return pares;
}

function resumen(lista) {
  const r = { notas: lista.length, notas_entrega: 0, notas_venta: 0, articulos: 0, piezas_notas_entrega: 0, subtotal: 0, iva: 0, ajustes: 0, total: 0, desde: null, hasta: null };
  let desde = null;
  let hasta = null;
  lista.forEach(x => {
    r.subtotal += x.subtotal;
    r.iva += x.iva;
    r.ajustes += x.ajuste;
    r.total += x.total;
    r.articulos += x.items.length;
    if (x.tipo === 'NE') {
      r.notas_entrega++;
      r.piezas_notas_entrega += suma(x.items, 'cantidad');
    } else {
      r.notas_venta++;
    }
    if (x.fecha && (!desde || x.fecha < desde)) desde = x.fecha;
    if (x.fecha && (!hasta || x.fecha > hasta)) hasta = x.fecha;
  });
  // Notas en $0: algunos clientes piden la nota sin precio. Cuentan como nota pero no suman al total; se informan para que el total se entienda
  const sinImporte = lista.filter(x => x.total === 0);
  return Object.assign(r, {
    subtotal: pesos(r.subtotal), iva: pesos(r.iva), ajustes: pesos(r.ajustes), total: pesos(r.total),
    piezas_notas_entrega: Math.round(r.piezas_notas_entrega * 100) / 100,
    desde: fechaISO(desde), hasta: fechaISO(hasta),
    posibles_duplicados: duplicados(lista),
    notas_sin_importe: sinImporte.length,
    folios_sin_importe: sinImporte.slice(0, 30).map(x => x.folio)
  });
}

function notaJSON(x, conArticulos) {
  const o = {
    id: x.id,
    folio: x.folio,
    ...(x.otrosFolios && x.otrosFolios.length ? { otros_folios: x.otrosFolios.map(f => f.folio) } : {}),
    tipo: x.tipo === 'NE' ? 'nota de entrega' : 'nota de venta',
    fecha: fechaISO(x.fecha),
    hora_registro: horaTxt(x.creada),
    cliente: x.cliente,
    vendedor: x.vendedor || null,
    siniestro: x.siniestro || null,
    subtotal: pesos(x.subtotal),
    iva: pesos(x.iva),
    ajuste: pesos(x.ajuste),
    total: pesos(x.total)
  };
  if (conArticulos) {
    o.articulos = x.items.map(it => ({
      descripcion: it.texto,
      siniestro: it.siniestro || null,
      cantidad: it.cantidad,
      precio_unitario: it.pu == null ? null : pesos(it.pu),
      importe: pesos(it.importe)
    }));
  } else {
    o.num_articulos = x.items.length;
  }
  return o;
}

// "NE-203", "ne 203", "NV #350", "350", "NV-219", "F-219". Primero el folio exacto, incluidos los otros folios de cada nota
// (la venta que generó una NE, el folio de Facturas y el de la factura), porque NV #243 y NV-219 pueden ser la misma venta
// y NV-219 otra distinta de NV #219. Si no hay exacto, por número, respetando el tipo si viene.
function buscarFolio(lista, folio) {
  const clave = s => norm(s).replace(/\s+/g, '');
  const texto = clave(folio);
  const tipo = /^ne/.test(texto) ? 'NE' : /^nv/.test(texto) ? 'NV' : /^f\W*\d/.test(texto) ? 'F' : '';
  const num = numero(texto);
  const folios = x => [{ tipo: x.tipo, folio: x.folio, numero: x.numero }].concat(x.otrosFolios || []);
  const exactas = lista.filter(x => folios(x).some(f => clave(f.folio) === texto));
  if (exactas.length || !num) return exactas;
  return lista.filter(x => folios(x).some(f => (!tipo || f.tipo === tipo) && f.numero === num));
}

function agrupar(lista, por) {
  const grupos = new Map();
  const sumar = (clave, etiqueta, notaId, total, extra) => {
    if (!grupos.has(clave)) grupos.set(clave, { etiqueta, notas: new Set(), total: 0, cantidad: 0, veces: 0 });
    const g = grupos.get(clave);
    g.notas.add(notaId);
    g.total += total;
    g.veces += 1;
    if (extra) g.cantidad += extra;
  };
  lista.forEach(x => {
    if (por === 'articulo') {
      x.items.forEach(it => sumar(norm(it.texto), it.texto, x.tipo + x.id, it.importe, it.cantidad || 0));
    } else if (por === 'dia' || por === 'mes') {
      const clave = x.fecha ? (por === 'dia' ? fechaISO(x.fecha) : fechaISO(x.fecha).slice(0, 7)) : 'sin fecha';
      sumar(clave, clave, x.tipo + x.id, x.total);
    } else {
      const valor = por === 'vendedor' ? x.vendedor : x.cliente;
      sumar(norm(valor) || '(sin ' + por + ')', String(valor || '').trim() || '(sin ' + por + ')', x.tipo + x.id, x.total);
    }
  });
  const salida = Array.from(grupos.values()).map(g => {
    const o = { [por]: g.etiqueta, notas: g.notas.size, total: pesos(g.total) };
    if (por === 'articulo') {
      o.veces_vendido = g.veces;
      o.piezas_en_notas_entrega = Math.round(g.cantidad * 100) / 100;
      o.importe = o.total;
      delete o.total;
    }
    return o;
  });
  if (por === 'dia' || por === 'mes') return salida.sort((a, b) => (a[por] < b[por] ? -1 : 1));
  const monto = g => (por === 'articulo' ? g.importe : g.total);
  return salida.sort((a, b) => monto(b) - monto(a));
}

// Algunos clientes importados de Excel traen "activo" en la columna de estado (entidad); eso no es parte de la dirección
const esEstatus = v => /^(activo|inactivo)$/.test(norm(v));

async function clientes(texto, limite) {
  const q = norm(texto);
  const lista = (await leer('clientes'))
    .filter(c => !q || norm([c.razonSocial, c.nombre, c.rfc, c.codigoCliente, c.codigo, c.email, c.telefono].join(' ')).includes(q))
    .map(c => ({
      id: c.id,
      codigo: c.codigoCliente || c.codigo || null,
      nombre: c.razonSocial || c.nombre || '',
      rfc: c.rfc || null,
      telefono: c.telefono || c.tel || null,
      email: c.email || null,
      direccion: [[c.calle, c.numeroExterior, c.numeroInterior && 'int. ' + c.numeroInterior].filter(Boolean).join(' '), c.colonia, c.municipio, c.ciudad,
        esEstatus(c.estado) ? '' : c.estado, c.codigoPostal && 'C.P. ' + c.codigoPostal]
        .filter(Boolean).join(', ') || null,
      venta_publica_redes: !!c.redesSociales
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return { encontrados: lista.length, mostrando: Math.min(limite, lista.length), clientes: lista.slice(0, limite) };
}

async function productos(texto, soloBajoStock, limite) {
  const q = norm(texto);
  const lista = (await leer('productos'))
    .map(p => {
      const stock = Number(p.stock) || 0;
      const minimo = Number(p.stockMin) || 0;
      return {
        id: p.id,
        codigo: p.codigo || null,
        descripcion: p.descripcion || '',
        marca: p.marca || null,
        compatibilidad: p.compatibilidad || null,
        precio: pesos(centavos(p.precio)),
        stock,
        stock_minimo: minimo,
        bajo_stock: stock <= minimo,
        clase: p.clase || null
      };
    })
    .filter(p => (!soloBajoStock || p.bajo_stock) && (!q || norm([p.codigo, p.descripcion, p.marca, p.compatibilidad].join(' ')).includes(q)))
    .sort((a, b) => (soloBajoStock ? a.stock - a.stock_minimo - (b.stock - b.stock_minimo) : a.descripcion.localeCompare(b.descripcion, 'es')));
  return { encontrados: lista.length, mostrando: Math.min(limite, lista.length), productos: lista.slice(0, limite) };
}

// Publicaciones de Mercado Libre tal como quedaron en la última sincronización de la app (Inventario → Sincronizar ML).
// No consulta Mercado Libre en vivo. Los tokens de ML (ml_tokens) nunca se leen aquí.
async function productosML(f, limite) {
  const q = norm(f.texto);
  const [todos, meta] = await Promise.all([leer('ml_productos'), fb().obtener('config', 'ml_ultima_sync').catch(() => null)]);
  // La app ya solo reescribe las publicaciones que cambian; la hora del último sync está en config/ml_ultima_sync
  let ultima = meta ? aFecha(meta.fecha) : null;
  const lista = todos
    .map(p => {
      const sync = aFecha(p.ultimaSync);
      if (sync && (!ultima || sync > ultima)) ultima = sync;
      return {
        id: p.id,
        titulo: p.title || '',
        precio: pesos(centavos(p.price)),
        disponibles: Number(p.available_quantity) || 0,
        estatus: p.status || null,
        link: p.permalink || null
      };
    })
    .filter(p => (!q || norm(p.titulo + ' ' + p.id).includes(q)) && (!f.estatus || p.estatus === f.estatus) && (!f.solo_sin_existencias || p.disponibles <= 0))
    .sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
  const r = {
    ultima_sincronizacion: ultima ? fechaISO(ultima) + ' ' + horaTxt(ultima) : null,
    encontrados: lista.length,
    piezas_disponibles: lista.reduce((s, p) => s + p.disponibles, 0),
    mostrando: Math.min(limite, lista.length),
    productos: lista.slice(0, limite)
  };
  if (!todos.length) r.aviso = 'No hay publicaciones guardadas. Para verlas, sincroniza desde la app: Inventario → Sincronizar ML.';
  return r;
}

// Todas las ventas tal cual (también canceladas y las creadas desde una NE), con su estatus y factura
async function ventas(f, limite) {
  const q = norm(f.texto);
  const desde = f.desde ? diaLocal(f.desde, false) : null;
  const hasta = f.hasta ? diaLocal(f.hasta, true) : null;
  const lista = (await leer('ventas'))
    .map(v => ({ v, x: desdeVenta(v) }))
    .filter(({ v, x }) => {
      if (f.estatus && norm(v.estatus || 'Pendiente') !== norm(f.estatus)) return false;
      if (f.con_factura != null && !!v.tieneFactura !== f.con_factura) return false;
      if (q && !norm([x.folio, v.notaNumero, v.notaEntregaId, x.cliente, x.vendedor, x.siniestro].concat(x.items.map(i => i.texto)).join(' ')).includes(q)) return false;
      if ((desde || hasta) && !x.fecha) return false;
      if (desde && x.fecha < desde) return false;
      if (hasta && x.fecha > hasta) return false;
      return true;
    })
    .sort((a, b) => comparar(a.x, b.x));
  const vigentes = lista.filter(({ v }) => !/^cancel/.test(norm(v.estatus)));
  return {
    encontradas: lista.length,
    total_sin_canceladas: pesos(vigentes.reduce((s, e) => s + e.x.total, 0)),
    mostrando: Math.min(limite, lista.length),
    ventas: lista.slice(0, limite).map(({ v, x }) => Object.assign(notaJSON(x, f.incluir_articulos), {
      estatus: v.estatus || 'Pendiente',
      folio_en_tabla: v.notaNumero || null,
      factura: {
        tiene_factura: !!v.tieneFactura,
        numero: v.facturaNumero || null,
        archivo: v.facturaURL || null,
        lleva_factura: v.llevaFactura == null ? null : !!v.llevaFactura,
        estatus: v.estatusFactura || null
      },
      creada_desde_nota_entrega: v.notaEntregaId || null,
      observaciones: v.observaciones || v.notas || null
    }))
  };
}

// Módulos que se consultan tal cual. Los textos muy largos (fotos en base64, firmas) se recortan.
const MODULOS = {
  entregas: 'entregas', envios: 'envios', visitas_talleres: 'visitasTalleres', cotizaciones: 'cotizaciones',
  proveedores: 'proveedores', prestamos: 'finanzas_prestamos', pagos: 'finanzas_pagos', usuarios: 'usuarios'
};

function limpiar(valor) {
  if (valor == null) return valor;
  if (typeof valor.toDate === 'function') return valor.toDate().toISOString();
  if (valor instanceof Date) return valor.toISOString();
  if (typeof valor === 'string') return valor.length > 1500 ? '[omitido: ' + valor.length + ' caracteres]' : valor;
  if (Array.isArray(valor)) return valor.slice(0, 100).map(limpiar);
  if (typeof valor === 'object') {
    const o = {};
    Object.keys(valor).forEach(k => { o[k] = limpiar(valor[k]); });
    return o;
  }
  return valor;
}

async function registros(modulo, texto, limite) {
  const q = norm(texto);
  const cuando = d => { const f = aFecha(d.createdAt) || aFecha(d.fecha); return f ? f.getTime() : 0; };
  const lista = (await leer(MODULOS[modulo]))
    .map(d => {
      const o = limpiar(d);
      // Cotizaciones y otros guardan la fecha en milisegundos (1782432000000): se entrega como AAAA-MM-DD
      if (typeof o.fecha === 'number') o.fecha = fechaISO(dia(o.fecha));
      return o;
    })
    .filter(d => !q || norm(JSON.stringify(d)).includes(q))
    .sort((a, b) => cuando(b) - cuando(a));
  return { modulo, encontrados: lista.length, mostrando: Math.min(limite, lista.length), registros: lista.slice(0, limite) };
}

module.exports = {
  cargarRegistros, olvidarCache, filtrar, resumen, notaJSON, buscarFolio, agrupar, clientes, productos, productosML, ventas, registros,
  armarRegistros, desdeEntrega, desdeVenta, norm, centavos, pesos, fechaISO, MODULOS
};
