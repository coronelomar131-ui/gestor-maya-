// Ventas de Mercado Libre al gestor, solas.
// Usa la misma conexión que ya tiene Inventario (tokens en ml_tokens/{mlUserId}, los guarda api/ml.js al conectar ML).
// Cada orden pagada se registra una sola vez como nota de venta (colección ventas, fuente 'mercadolibre') con el comprador,
// las piezas, el precio, el número de orden y el envío de Mercado Envíos; al almacén le llega el aviso de nota nueva.
// Se corre en cada tick de /api/avisos (cada 5 min con cron-job.org), con el botón "Importar ventas" del módulo
// Mercado Libre, y al instante si en la app de ML se configura la URL de notificaciones (POST /api/ml, tema orders_v2).
const { fb } = require('./firebase');
const datos = require('./datos');

const API = 'https://api.mercadolibre.com';
const CONFIG = 'ml_importacion';
const IVA = 0.16;
const ML_APP_ID = () => process.env.ML_APP_ID || '6541042886481524';

async function tokens() {
  const lista = await fb().leerColeccion('ml_tokens');
  return lista.find(t => t.access_token) || null;
}
const msDe = v => (!v ? 0 : v.toMillis ? v.toMillis() : v.toDate ? v.toDate().getTime() : v._seconds ? v._seconds * 1000 : typeof v === 'number' ? v : (Date.parse(v) || 0));

// Token vigente; si venció, se renueva con el refresh_token (igual que api/ml.js) y se guarda
async function tokenValido() {
  const t = await tokens();
  if (!t) throw Object.assign(new Error('Mercado Libre no está conectado en el gestor (Inventario → Conectar ML).'), { sinConexion: true });
  if (msDe(t.expires_at) > Date.now() + 60000) return { token: t.access_token, mlUserId: t.id };
  const secreto = String(process.env.ML_SECRET_KEY || '').trim();
  if (!secreto || !t.refresh_token) throw new Error('El token de Mercado Libre venció y no se puede renovar (falta ML_SECRET_KEY o refresh_token). Reconecta ML en Inventario.');
  const cuerpo = new URLSearchParams({ grant_type: 'refresh_token', client_id: ML_APP_ID(), client_secret: secreto, refresh_token: t.refresh_token });
  const r = await fetch(API + '/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: cuerpo });
  if (!r.ok) throw new Error('Mercado Libre no renovó el token (' + r.status + '). Reconecta ML en Inventario.');
  const j = await r.json();
  const expiresAt = new Date(Date.now() + (Number(j.expires_in) || 21600) * 1000);
  await fb().guardar('ml_tokens', String(t.id), Object.assign({}, t, { id: undefined, access_token: j.access_token, refresh_token: j.refresh_token || t.refresh_token, expires_at: expiresAt, updated_at: new Date() }));
  return { token: j.access_token, mlUserId: t.id };
}

async function pedirML(ruta, token) {
  const r = await fetch(API + ruta, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
  if (!r.ok) {
    const texto = await r.text().catch(() => '');
    throw new Error('Mercado Libre contestó ' + r.status + ' en ' + ruta.split('?')[0] + (texto ? ': ' + texto.slice(0, 160) : ''));
  }
  return r.json();
}

// Órdenes del vendedor desde una fecha (ML pagina de 50 en 50)
async function ordenesDesde(desdeMs, token, mlUserId) {
  const desde = new Date(desdeMs).toISOString();
  const todas = [];
  for (let offset = 0; offset < 500; offset += 50) {
    const j = await pedirML('/orders/search?seller=' + encodeURIComponent(mlUserId) + '&order.date_created.from=' + encodeURIComponent(desde) + '&sort=date_asc&limit=50&offset=' + offset, token);
    const lote = j.results || [];
    todas.push(...lote);
    if (lote.length < 50 || todas.length >= (j.paging && j.paging.total || 0)) break;
  }
  return todas;
}

const nombreComprador = o => {
  const b = o.buyer || {};
  const nombre = [b.first_name, b.last_name].filter(Boolean).join(' ').trim();
  return (nombre || b.nickname || 'Comprador Mercado Libre') + (b.nickname && nombre ? ' (' + b.nickname + ')' : '');
};
const redondear = n => Math.round((Number(n) || 0) * 100) / 100;

// La orden de ML como nota de venta del gestor (los precios de ML ya traen IVA: se desglosa a 16 %)
function ventaDesdeOrden(o, notaId) {
  const items = (o.order_items || []).map(it => {
    const cantidad = Number(it.quantity) || 1;
    const conIva = redondear((Number(it.unit_price) || 0) * cantidad);
    const precio = redondear(conIva / (1 + IVA));
    return { pedido: ((it.item && it.item.title) || 'Artículo de Mercado Libre') + (cantidad > 1 ? ' x' + cantidad : ''), numSiniestro: '', precio, iva: redondear(conIva - precio), ajuste: 0, mlItemId: it.item && it.item.id || '', mlSku: it.item && it.item.seller_sku || '', cantidad };
  });
  const subtotal = redondear(items.reduce((s, i) => s + i.precio, 0));
  const ivaTotal = redondear(items.reduce((s, i) => s + i.iva, 0));
  const total = redondear(Number(o.total_amount) || subtotal + ivaTotal);
  const fecha = Date.parse(o.date_created) || Date.now();
  const envioId = o.shipping && o.shipping.id ? String(o.shipping.id) : '';
  return {
    notaId, fecha, clienteId: '', clienteNombre: nombreComprador(o), vendedor: 'Mercado Libre',
    items, siniestros: '', subtotal, ivaTotal, ajusteTotal: redondear(subtotal + ivaTotal - total), total,
    incluyeDatosFiscales: false, estado: 'pendiente', estatus: 'Pendiente', etapa: 'registrada',
    fuente: 'mercadolibre', canal: 'mercadolibre', mlOrderId: String(o.id), mlPackId: o.pack_id ? String(o.pack_id) : '', mlEstatus: o.status || '',
    mlComprador: { id: o.buyer && o.buyer.id || null, nickname: o.buyer && o.buyer.nickname || '' },
    envio: { tipo: 'nacional', paqueteria: 'Mercado Envíos', guia: envioId, estatus: envioId ? 'guia_generada' : 'sin_guia', fechaEnvio: null, fechaEntrega: null, observaciones: 'Orden ML #' + o.id },
    tieneFactura: false, facturaURL: '', creadoPor: 'Mercado Libre',
    seguimiento: [{ etapa: 'registrada', fecha: Date.now(), por: 'Mercado Libre', nota: 'Venta de Mercado Libre, orden #' + o.id }],
    createdAt: fb().marcaTiempo()
  };
}

// Importa lo pagado que falte. Vuelve a mirar 7 días hacia atrás por si una orden se pagó después de creada.
async function importar(opciones = {}) {
  const ahora = opciones.ahora || Date.now();
  const { token, mlUserId } = await tokenValido();
  const cfg = (await fb().obtener('config', CONFIG)) || {};
  const desde = opciones.desde || Math.max(msDe(cfg.ultimaOrden) - 7 * 86400000, ahora - 30 * 86400000);
  const ordenes = await ordenesDesde(desde, token, mlUserId);
  const ventas = await fb().leerColeccion('ventas');
  const yaEstan = new Set(ventas.filter(v => v.mlOrderId).map(v => String(v.mlOrderId)));
  let siguiente = ventas.reduce((m, v) => Math.max(m, parseInt(String(v.notaId || v.notaNumero || '').replace(/\D/g, ''), 10) || 0), 0);
  const importadas = [], omitidas = [];
  let ultima = msDe(cfg.ultimaOrden) || 0;
  for (const o of ordenes) {
    ultima = Math.max(ultima, Date.parse(o.date_created) || 0);
    if (yaEstan.has(String(o.id))) continue;
    if (o.status !== 'paid') { omitidas.push({ orden: String(o.id), estatus: o.status }); continue; }
    if ((o.tags || []).includes('test_order')) { omitidas.push({ orden: String(o.id), estatus: 'prueba' }); continue; }
    siguiente += 1;
    const venta = ventaDesdeOrden(o, String(siguiente));
    const id = await fb().agregar('ventas', venta);
    yaEstan.add(String(o.id));
    importadas.push({ id, folio: 'NV #' + venta.notaId, orden: venta.mlOrderId, comprador: venta.clienteNombre, total: venta.total, piezas: venta.items.map(i => i.pedido) });
  }
  await fb().guardar('config', CONFIG, { ultimaOrden: new Date(ultima || ahora), ultimaRevision: new Date(ahora), importadas: (cfg.importadas || 0) + importadas.length, mlUserId: String(mlUserId) }).catch(() => {});
  if (importadas.length) {
    datos.olvidarCache();
    const avisos = require('./avisos');
    for (const v of importadas) await avisos.porEvento('nota_nueva', { col: 'ventas', id: v.id }, null).catch(e => console.error('ml: aviso', e.message));
  }
  return { revisadas: ordenes.length, importadas, omitidas: omitidas.length, desde: new Date(desde).toISOString() };
}

// Notificación de ML (tema orders_v2): { resource: '/orders/123', topic, user_id }. Trae esa orden y la importa si está pagada.
async function notificacion(cuerpo) {
  const m = /\/orders\/(\d+)/.exec(String(cuerpo && cuerpo.resource || ''));
  if (!m || !/orders/.test(String(cuerpo.topic || ''))) return { ignorada: true };
  const { token } = await tokenValido();
  const o = await pedirML('/orders/' + m[1], token);
  const ventas = await fb().buscarIgual('ventas', 'mlOrderId', String(o.id));
  if (ventas.length) return { yaEstaba: true, orden: String(o.id) };
  if (o.status !== 'paid') return { pendiente: true, orden: String(o.id), estatus: o.status };
  const todas = await fb().leerColeccion('ventas');
  const notaId = String(todas.reduce((mx, v) => Math.max(mx, parseInt(String(v.notaId || v.notaNumero || '').replace(/\D/g, ''), 10) || 0), 0) + 1);
  const venta = ventaDesdeOrden(o, notaId);
  const id = await fb().agregar('ventas', venta);
  datos.olvidarCache();
  await require('./avisos').porEvento('nota_nueva', { col: 'ventas', id }, null).catch(() => {});
  return { importada: { id, folio: 'NV #' + notaId, orden: String(o.id) } };
}

module.exports = { importar, notificacion, ventaDesdeOrden, tokenValido, CONFIG };
