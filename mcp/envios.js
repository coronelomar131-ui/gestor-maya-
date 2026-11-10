// Envíos por paquetería ligados a la nota (Paquete Express, Skydrops, Mercado Envíos…).
// La guía y su estatus viven en la propia nota (nota.envio), así Seguimiento, Facturación y Geraldine Bot ven lo mismo.
// Estatus: sin_guia → guia_generada → en_transito → recibido (o cancelado). Al registrar la guía la pieza pasa a
// "En preparación", en tránsito a "En tránsito" y recibido a "Entregada", con su aviso al vendedor como siempre.
// Rastreo automático con la paquetería: pendiente de que Paquete Express / Skydrops den acceso a su API (ver docs).
const { fb } = require('./firebase');
const datos = require('./datos');
const plazos = require('../public/diseno/plazos.js');

const norm = datos.norm;
const nombreDe = u => (u && (u.nombre || u.email)) || 'Pepito';
const ETAPA_POR_ESTATUS = { guia_generada: 'preparacion', en_transito: 'transito', recibido: 'entregada' };
const ORDEN_ETAPA = ['registrada', 'preparacion', 'transito', 'entregada'];

async function activas() {
  const [ne, nv, fs] = await Promise.all([datos.leer('notasEntrega'), datos.leer('ventas'), datos.leer('facturas')]);
  const porId = new Map(fs.map(f => [f.id, f]));
  const { etapaDe } = require('./facturacion');
  const lista = [];
  ne.forEach(n => lista.push({ col: 'notasEntrega', id: n.id, folio: n.notaId || 'NE', cliente: n.cliente || '', vendedor: n.vendedor || '', piezas: (n.items || []).map(i => i.descripcion).filter(Boolean).join(', '), raw: n, etapa: etapaDe(n, porId) }));
  nv.forEach(v => { if (v.fuente === 'nota_entrega' || v.notaEntregaId || /^cancel/.test(norm(v.estatus))) return;
    lista.push({ col: 'ventas', id: v.id, folio: v.notaId ? 'NV #' + v.notaId : (v.notaNumero || 'NV'), cliente: v.clienteNombre || v.cliente || '', vendedor: v.vendedor || '', piezas: (v.items || []).map(i => i.pedido || i.descripcion).filter(Boolean).join(', '), raw: v, etapa: etapaDe(v, porId) }); });
  return lista;
}

const buscarPorFolio = (lista, texto) => { const t = norm(texto).replace(/[\s#-]+/g, ''); return t ? lista.find(r => norm(r.folio).replace(/[\s#-]+/g, '') === t) || null : null; };

// Tablero de envíos: lo que va por paquetería y sus alertas
async function tablero(ahora = Date.now(), filtro = {}) {
  const lista = await activas();
  const envios = [];
  lista.forEach(r => {
    const e = r.raw.envio;
    if (!e) return;
    if (filtro.paqueteria && norm(e.paqueteria) !== norm(filtro.paqueteria)) return;
    if (filtro.estatus && e.estatus !== filtro.estatus) return;
    const alerta = plazos.alertaEnvio(r.raw, r.etapa, ahora);
    envios.push({ col: r.col, id: r.id, folio: r.folio, cliente: r.cliente, vendedor: r.vendedor, piezas: r.piezas, etapa: r.etapa,
      tipo: e.tipo || 'nacional', paqueteria: e.paqueteria || '', guia: e.guia || '', estatus: e.estatus || 'sin_guia', estatus_nombre: plazos.nombreEnvio(e.estatus || 'sin_guia'),
      fecha_envio: e.fechaEnvio ? new Date(plazosMs(e.fechaEnvio)).toISOString().slice(0, 10) : null, fecha_entrega: e.fechaEntrega ? new Date(plazosMs(e.fechaEntrega)).toISOString().slice(0, 10) : null,
      alerta: alerta ? alerta.clave : null, alerta_texto: alerta ? alerta.texto : null, observaciones: e.observaciones || '' });
  });
  const activos = envios.filter(x => !['recibido', 'cancelado'].includes(x.estatus) && !['entregada', 'facturada', 'pagada', 'cancelada'].includes(x.etapa));
  const conteo = { sin_guia: activos.filter(x => x.alerta === 'sin_guia').length, guia_generada: activos.filter(x => x.estatus === 'guia_generada').length, en_transito: activos.filter(x => x.estatus === 'en_transito').length, quietos: activos.filter(x => x.alerta === 'quieto').length, recibidos_hoy: envios.filter(x => x.fecha_entrega === new Date(ahora).toISOString().slice(0, 10)).length };
  const porPaq = {};
  activos.forEach(x => { const k = x.paqueteria || 'Sin paquetería'; porPaq[k] = (porPaq[k] || 0) + 1; });
  const peso = x => (x.alerta === 'sin_guia' ? 0 : x.alerta === 'quieto' ? 1 : x.estatus === 'en_transito' ? 2 : 3);
  return { ahora: new Date(ahora).toISOString().slice(0, 10), conteo, por_paqueteria: porPaq, activos: activos.sort((a, b) => peso(a) - peso(b)), cerrados_recientes: envios.filter(x => ['recibido', 'cancelado'].includes(x.estatus)).slice(0, 20),
    aviso: 'El rastreo automático con Paquete Express / Skydrops queda pendiente de su acceso a API; por ahora el estatus se actualiza en Seguimiento o con Pepito.' };
}
const plazosMs = v => (!v ? 0 : v.toMillis ? v.toMillis() : v.seconds ? v.seconds * 1000 : v._seconds ? v._seconds * 1000 : typeof v === 'number' ? v : (Date.parse(v) || 0));

// Registrar o actualizar el envío de una nota (gestor, Pepito y, después, la paquetería)
async function guardarGuia(usuario, a) {
  const lista = await activas();
  const r = (a.clave && lista.find(x => x.col + ':' + x.id === a.clave)) || (a.folio && buscarPorFolio(lista, a.folio)) || (a.id && lista.find(x => x.id === a.id));
  if (!r) throw new Error('No encontré esa nota (folio incorrecto o cancelada).');
  if (['entregada', 'facturada', 'pagada', 'cancelada'].includes(r.etapa) && !a.forzar) throw new Error(r.folio + ' ya está ' + r.etapa + '; su envío ya no se cambia.');
  const previo = r.raw.envio || {};
  const estatus = a.estatus || (a.guia ? (previo.estatus && previo.estatus !== 'sin_guia' ? previo.estatus : 'guia_generada') : previo.estatus || 'sin_guia');
  if (!plazos.ESTATUS_ENVIO.some(e => e.id === estatus)) throw new Error('Estatus de envío no válido: ' + estatus);
  if (['guia_generada', 'en_transito'].includes(estatus) && !(a.guia || previo.guia)) throw new Error('Para ' + plazos.nombreEnvio(estatus) + ' hace falta el número de guía.');
  const ahora = Date.now();
  const quien = nombreDe(usuario);
  const envio = Object.assign({ tipo: 'nacional', paqueteria: '', guia: '', estatus: 'sin_guia', fechaEnvio: null, fechaEntrega: null, observaciones: '' }, previo, {
    tipo: a.tipo || previo.tipo || 'nacional', paqueteria: a.paqueteria != null ? String(a.paqueteria).trim() : (previo.paqueteria || ''), guia: a.guia != null ? String(a.guia).trim() : (previo.guia || ''),
    estatus, observaciones: a.observaciones != null ? String(a.observaciones).trim() : (previo.observaciones || ''), actualizado: ahora, por: quien
  });
  if (estatus === 'en_transito' && !envio.fechaEnvio) envio.fechaEnvio = ahora;
  if (estatus === 'guia_generada' && !envio.fechaGuia) envio.fechaGuia = ahora;
  if (estatus === 'recibido' && !envio.fechaEntrega) envio.fechaEntrega = ahora;
  const cambios = { envio };
  // La etapa de la pieza avanza con el envío (nunca retrocede)
  const etapaNueva = ETAPA_POR_ESTATUS[estatus];
  let etapaCambio = null;
  if (etapaNueva && ORDEN_ETAPA.indexOf(etapaNueva) > ORDEN_ETAPA.indexOf(r.etapa)) {
    etapaCambio = etapaNueva;
    cambios.etapa = etapaNueva;
    cambios.seguimiento = (r.raw.seguimiento || []).concat({ etapa: etapaNueva, fecha: ahora, por: quien, nota: (envio.paqueteria ? envio.paqueteria + ' ' : '') + (envio.guia ? 'guía ' + envio.guia : '') + (a.observaciones ? ' · ' + a.observaciones : '') });
    if (r.col === 'ventas' && etapaNueva === 'entregada') cambios.estatus = 'Entregado';
  }
  await fb().actualizar(r.col, r.id, cambios);
  datos.olvidarCache();
  if (etapaCambio) {
    await require('./avisos').porEvento('etapa', { col: r.col, id: r.id, etapa: etapaCambio, nota: (envio.paqueteria ? envio.paqueteria + ' ' : '') + (envio.guia ? 'guía ' + envio.guia : '') }, usuario).catch(e => console.error('envios: aviso', e.message));
  }
  return { guardado: true, folio: r.folio, cliente: r.cliente, envio: { tipo: envio.tipo, paqueteria: envio.paqueteria, guia: envio.guia, estatus: envio.estatus, estatus_nombre: plazos.nombreEnvio(envio.estatus) }, etapa: etapaCambio || r.etapa };
}

module.exports = { tablero, guardarGuia, activas };
