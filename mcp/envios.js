// Envíos por paquetería ligados a la nota (Paquete Express, Skydrops, Mercado Envíos…).
// La guía y su estatus viven en la propia nota (nota.envio), así Seguimiento, Facturación y Geraldine Bot ven lo mismo.
// Semáforo: En almacén → Recolectado → En movimiento → Entregado (o Incidencia / Cancelado), diseno/plazos.js.
// En almacén la pieza pasa a "En preparación", recolectado o en movimiento a "En tránsito" y entregado a "Entregada",
// con su aviso al vendedor como siempre. Los estatus de antes (sin_guia, guia_generada, en_transito, recibido) se aceptan.
// Rastreo automático con la paquetería: pendiente de que Paquete Express / Skydrops den acceso a su API (ver docs).
const { fb } = require('./firebase');
const datos = require('./datos');
const plazos = require('../public/diseno/plazos.js');

const norm = datos.norm;
const nombreDe = u => (u && (u.nombre || u.email)) || 'Pepito';
const ETAPA_POR_ESTATUS = { almacen: 'preparacion', recoleccion: 'transito', transito: 'transito', entregado: 'entregada' };
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
  const c = await fb().obtener('config', 'geraldine').catch(() => null);
  const desde = (c && c.desde) || plazos.DESDE;
  const envios = [];
  lista.forEach(r => {
    const e = r.raw.envio;
    if (!e) return;
    if (filtro.paqueteria && norm(e.paqueteria) !== norm(filtro.paqueteria)) return;
    const est = plazos.estatusEnvio(e.estatus);
    if (filtro.estatus && est !== plazos.estatusEnvio(filtro.estatus)) return;
    const alerta = plazos.alertaEnvio(r.raw, r.etapa, ahora, desde);
    const sem = plazos.semaforoEnvio(r.raw, ahora);
    envios.push({ col: r.col, id: r.id, folio: r.folio, cliente: r.cliente, vendedor: r.vendedor, piezas: r.piezas, etapa: r.etapa,
      tipo: e.tipo || 'nacional', paqueteria: e.paqueteria || '', guia: e.guia || '', estatus: est, estatus_nombre: plazos.nombreEnvio(est),
      semaforo: sem ? sem.color : null, semaforo_texto: sem ? sem.texto : null, dias_en_paso: sem ? sem.dias : 0,
      fecha_envio: e.fechaEnvio ? new Date(plazosMs(e.fechaEnvio)).toISOString().slice(0, 10) : null, fecha_entrega: e.fechaEntrega ? new Date(plazosMs(e.fechaEntrega)).toISOString().slice(0, 10) : null,
      alerta: alerta ? alerta.clave : null, alerta_texto: alerta ? alerta.texto : null, observaciones: e.observaciones || '' });
  });
  const activos = envios.filter(x => !['entregado', 'cancelado'].includes(x.estatus) && !['entregada', 'facturada', 'pagada', 'cancelada'].includes(x.etapa));
  const cuenta = f => activos.filter(f).length;
  const conteo = {
    almacen: cuenta(x => x.estatus === 'almacen'), recoleccion: cuenta(x => x.estatus === 'recoleccion'), transito: cuenta(x => x.estatus === 'transito'), incidencias: cuenta(x => x.estatus === 'incidencia'),
    verde: cuenta(x => x.semaforo === 'verde'), amarillo: cuenta(x => x.semaforo === 'amarillo'), rojo: cuenta(x => x.semaforo === 'rojo'),
    sin_guia: cuenta(x => x.alerta === 'sin_guia'), quietos: cuenta(x => x.alerta === 'quieto'),
    entregados_hoy: envios.filter(x => x.fecha_entrega === new Date(ahora).toISOString().slice(0, 10)).length
  };
  const porPaq = {};
  activos.forEach(x => { const k = x.paqueteria || 'Sin paquetería'; porPaq[k] = (porPaq[k] || 0) + 1; });
  // Primero lo rojo (incidencias y sin guía antes), luego amarillo, luego verde
  const peso = x => ({ rojo: 0, amarillo: 10, verde: 20 }[x.semaforo] ?? 30) + (x.estatus === 'incidencia' ? 0 : x.alerta === 'sin_guia' ? 1 : 2) - Math.min(x.dias_en_paso || 0, 9) / 10;
  return { ahora: new Date(ahora).toISOString().slice(0, 10), conteo, por_paqueteria: porPaq, activos: activos.sort((a, b) => peso(a) - peso(b)), cerrados_recientes: envios.filter(x => ['entregado', 'cancelado'].includes(x.estatus)).slice(0, 20),
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
  if (a.estatus && !plazos.ESTATUS_ENVIO.some(e => e.id === a.estatus) && !['sin_guia', 'guia_generada', 'en_transito', 'recibido'].includes(a.estatus)) throw new Error('Estatus de envío no válido: ' + a.estatus);
  const estatus = plazos.estatusEnvio(a.estatus || previo.estatus || 'almacen');
  const tipo = a.tipo || previo.tipo || 'nacional';
  if (tipo !== 'local' && ['recoleccion', 'transito'].includes(estatus) && !(a.guia || previo.guia)) throw new Error('Para ' + plazos.nombreEnvio(estatus) + ' hace falta el número de guía.');
  if (estatus === 'incidencia' && !(a.observaciones || previo.observaciones)) throw new Error('Para marcar una incidencia di qué pasó (retenido, dirección incorrecta, dañado, devuelto…).');
  const ahora = Date.now();
  const quien = nombreDe(usuario);
  const pasos = Object.assign({}, previo.pasos || {});
  if (plazos.estatusEnvio(previo.estatus) !== estatus || !pasos[estatus]) pasos[estatus] = Date.now();
  const envio = Object.assign({ tipo: 'nacional', paqueteria: '', guia: '', estatus: 'almacen', fechaEnvio: null, fechaEntrega: null, observaciones: '' }, previo, {
    tipo, pasos, paqueteria: a.paqueteria != null ? String(a.paqueteria).trim() : (previo.paqueteria || ''), guia: a.guia != null ? String(a.guia).trim() : (previo.guia || ''),
    estatus, observaciones: a.observaciones != null ? String(a.observaciones).trim() : (previo.observaciones || ''), actualizado: ahora, por: quien
  });
  if (['recoleccion', 'transito'].includes(estatus) && !envio.fechaEnvio) envio.fechaEnvio = ahora;
  if (envio.guia && !envio.fechaGuia) envio.fechaGuia = ahora;
  if (estatus === 'entregado' && !envio.fechaEntrega) envio.fechaEntrega = ahora;
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
  const sem = plazos.semaforoEnvio({ envio }, ahora);
  return { guardado: true, folio: r.folio, cliente: r.cliente, envio: { tipo: envio.tipo, paqueteria: envio.paqueteria, guia: envio.guia, estatus: envio.estatus, estatus_nombre: plazos.nombreEnvio(envio.estatus), semaforo: sem && sem.color }, etapa: etapaCambio || r.etapa };
}

module.exports = { tablero, guardarGuia, activas };
