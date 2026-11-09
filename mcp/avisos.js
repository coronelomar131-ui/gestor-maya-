// Avisos para cada persona del equipo: llegan a la campanita del gestor (avisos_usuario/{uid}) y por WhatsApp.
// - Resumen diario por rol, alarmas que se piden a Pepito y avisos al momento (nota nueva, pieza en camino, pago...).
// - WhatsApp: Meta contesta "aceptado" al momento, pero si la persona no le ha escrito a Pepito en 24 horas lo descarta
//   después y solo lo avisa al webhook. Por eso cada envío se anota (whatsapp_enviados) y, si Meta lo rechaza, se usa la
//   plantilla aprobada (WHATSAPP_PLANTILLA_AVISO) o se guarda en whatsapp_pendientes y se entrega cuando la persona escriba.
// Preferencias de cada quien en usuarios/{id}.avisos = { whatsapp, resumen, momento } (todo prendido si no hay nada).
const crypto = require('crypto');
const { fb } = require('./firebase');
const wa = require('./whatsapp');
const datos = require('./datos');

// Un documento por persona con sus últimos 30 avisos: la campanita escucha un solo documento (1 lectura por aviso)
const AVISOS = 'avisos_usuario';
const ENVIADOS = 'whatsapp_enviados';
const PENDIENTES = 'whatsapp_pendientes';
const RECORDATORIOS = 'recordatorios';
const DIA = 86400000;
const norm = datos.norm;
const pesos = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clave = id => crypto.createHash('sha1').update(String(id)).digest('hex');
const primerNombre = u => String((u && (u.nombre || u.email)) || '').split(/[\s@]/)[0];
const prefs = u => Object.assign({ whatsapp: true, resumen: true, momento: true }, (u && u.avisos) || {});
const uidDe = u => u.uid || u.id;

// ── WhatsApp con seguimiento de entrega ──
function plantillaDe(meta, texto) {
  if (meta && meta.plantilla && meta.plantilla.nombre) return meta.plantilla;
  const nombre = String(process.env.WHATSAPP_PLANTILLA_AVISO || '').trim();
  if (!nombre) return null;
  return { nombre, idioma: process.env.WHATSAPP_PLANTILLA_IDIOMA || 'es_MX', params: [String(texto).replace(/\*/g, '')] };
}

async function anotarEnvio(id, para10, texto, meta) {
  if (!id) return;
  const doc = { para10, texto: String(texto).slice(0, 3000), ts: Date.now(), estado: 'aceptado' };
  ['paraNombre', 'de10', 'deNombre', 'plantilla', 'plantillaUsada'].forEach(k => { if (meta && meta[k] !== undefined) doc[k] = meta[k]; });
  await fb().guardar(ENVIADOS, clave(id), doc).catch(e => console.error('avisos: no se pudo anotar el envío', e.message));
}

async function guardarPendiente(para10, texto, meta) {
  const previo = (await fb().obtener(PENDIENTES, para10)) || {};
  const vigentes = (previo.mensajes || []).filter(m => Date.now() - m.ts < 7 * DIA);
  const nuevo = { texto: String(texto).slice(0, 3000), ts: Date.now() };
  ['paraNombre', 'de10', 'deNombre'].forEach(k => { if (meta && meta[k]) nuevo[k] = meta[k]; });
  await fb().guardar(PENDIENTES, para10, { mensajes: vigentes.concat(nuevo).slice(-10) });
}

// Fuera de las 24 horas: plantilla aprobada si hay; si no, queda guardado para cuando la persona escriba
async function fueraDeVentana(para10, texto, meta) {
  const pl = !(meta && meta.plantillaUsada) && plantillaDe(meta, texto);
  if (pl) {
    const r = await wa.enviarPlantilla(para10, pl.nombre, pl.idioma || 'es_MX', pl.params || []);
    if (r.ok) { await anotarEnvio(r.id, para10, texto, Object.assign({}, meta, { plantillaUsada: true })); return { ok: true, via: 'plantilla', id: r.id }; }
  }
  await guardarPendiente(para10, texto, meta);
  return { ok: false, pendiente: true, codigo: 131047, error: 'no le ha escrito a Pepito en las últimas 24 horas; quedó guardado para entregárselo cuando le escriba' };
}

async function mandarWhatsApp(para10, texto, meta) {
  const r = await wa.enviarTexto(para10, texto);
  if (r.ok) { await anotarEnvio(r.id, para10, texto, meta); return { ok: true, via: 'texto', id: r.id }; }
  if (wa.fueraDeVentana(r)) return fueraDeVentana(para10, texto, meta);
  return r;
}

// Avisos de Meta al webhook: entregado, leído o fallido. Devuelve qué pasó para anotarlo en el diagnóstico.
async function procesarEstados(estados) {
  const notas = [];
  for (const s of estados || []) {
    const id = clave(s.id);
    if (s.status === 'delivered' || s.status === 'read') {
      await fb().actualizar(ENVIADOS, id, { estado: s.status === 'read' ? 'leído' : 'entregado' }).catch(() => {});
      continue;
    }
    if (s.status !== 'failed') continue;
    const err = (s.errors || [])[0] || {};
    const detalle = err.code + ' ' + (err.title || '') + ((err.error_data && err.error_data.details) ? ' · ' + err.error_data.details : '');
    notas.push({ paso: 'WhatsApp no entregado a ...' + String(s.recipient_id || '').slice(-4), detalle });
    const doc = await fb().obtener(ENVIADOS, id);
    if (!doc || doc.estado === 'fallido') continue;
    await fb().actualizar(ENVIADOS, id, { estado: 'fallido', error: detalle.slice(0, 300) }).catch(() => {});
    let r = null;
    if (err.code === 131047) r = await fueraDeVentana(doc.para10, doc.texto, doc);
    if (doc.de10 && doc.de10 !== doc.para10 && !(r && r.ok)) {
      const quien = doc.paraNombre || 'esa persona';
      await wa.enviarTexto(doc.de10, r && r.pendiente
        ? '⚠️ Tu mensaje para ' + quien + ' no le llegó: no le ha escrito a Pepito en las últimas 24 horas (regla de WhatsApp). Lo dejé guardado y se lo entrego en cuanto le escriba a Pepito.'
        : '⚠️ WhatsApp no le entregó tu mensaje a ' + quien + ' (' + (err.title || 'error ' + err.code) + ').').catch(() => {});
    }
  }
  return notas;
}

// Cuando alguien le escribe a Pepito se abre su ventana de 24 horas: se le entrega lo que tenía guardado
async function entregarPendientes(para10) {
  const p = await fb().tomar(PENDIENTES, para10);
  const lista = ((p && p.mensajes) || []).filter(m => Date.now() - m.ts < 7 * DIA);
  for (const m of lista) {
    const r = await mandarWhatsApp(para10, '📬 Te quedó pendiente (' + haceCuanto(m.ts) + '):\n' + m.texto, { paraNombre: m.paraNombre });
    if (r.ok && m.de10 && m.de10 !== para10) await wa.enviarTexto(m.de10, '✅ Ya le llegó a ' + (m.paraNombre || 'la persona') + ' tu mensaje.').catch(() => {});
  }
  return lista.length;
}

function haceCuanto(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 60) return 'hace ' + Math.max(1, min) + ' min';
  const h = Math.round(min / 60);
  if (h < 24) return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
  const d = Math.round(h / 24);
  return 'hace ' + d + (d === 1 ? ' día' : ' días');
}

// ── Un aviso para una persona: campanita + WhatsApp según sus preferencias ──
// tipo: 'resumen' | 'momento' | 'alarma'. Las alarmas las pidió la persona, así que siempre llegan.
async function avisar(persona, aviso, meta) {
  const p = prefs(persona);
  if (aviso.tipo === 'resumen' && !p.resumen) return { omitido: 'resumen apagado' };
  if (aviso.tipo === 'momento' && !p.momento) return { omitido: 'avisos al momento apagados' };
  const r = { para: persona.nombre || persona.email };
  try {
    const previo = (await fb().obtener(AVISOS, uidDe(persona))) || {};
    const nuevo = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), tipo: aviso.tipo, titulo: aviso.titulo || '', texto: String(aviso.texto).slice(0, 3000), ts: Date.now() };
    await fb().guardar(AVISOS, uidDe(persona), { lista: [nuevo].concat(previo.lista || []).slice(0, 30), visto: previo.visto || 0 });
    r.campanita = true;
  } catch (e) { r.campanita = false; console.error('avisos: campanita', e.message); }
  if (persona.whatsapp10 && p.whatsapp && wa.configurado()) {
    const w = await mandarWhatsApp(persona.whatsapp10, aviso.texto, Object.assign({ paraNombre: persona.nombre || persona.email }, meta || {}));
    r.whatsapp = w.ok ? w.via : (w.pendiente ? 'pendiente' : 'error: ' + (w.error || w.status));
  }
  return r;
}

// ── Quién es quién ──
// El vendedor de una nota es texto libre ("Daniel"): se compara con el nombre de cada usuario
function esVendedor(persona, vendedor) {
  const v = norm(vendedor), n = norm(persona.nombre);
  if (!v || !n) return false;
  if (v === n) return true;
  const pv = v.split(' ')[0], pn = n.split(' ')[0];
  return pv.length >= 3 && pv === pn;
}
const conRol = (equipo, ...roles) => equipo.filter(u => roles.includes(u.rol || 'vendedor'));

// ── Etapas de una pieza (igual que diseno/operacion.js) ──
const LOGISTICA = ['registrada', 'preparacion', 'transito', 'entregada'];
function etapaDe(doc, facturas) {
  const f = doc.facturaId && facturas.get(doc.facturaId);
  if (f && f.estatus !== 'cancelada') return f.estatus === 'pagada' ? 'pagada' : 'facturada';
  if (doc.facturaId && !f) return 'facturada';
  if (LOGISTICA.includes(doc.etapa)) return doc.etapa;
  const e = norm(doc.estatus);
  if (e === 'entregado') return 'entregada';
  if (e === 'en proceso') return 'preparacion';
  return 'registrada';
}
const piezasDe = r => r.items.map(it => it.texto).filter(t => t && t !== '-');
const lineaPieza = r => '• ' + r.folio + ' · ' + (r.cliente || 'Sin cliente') + (piezasDe(r).length ? ' · ' + piezasDe(r).slice(0, 2).join(', ') + (piezasDe(r).length > 2 ? '…' : '') : '');
const diaCDMX = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });

// Notas y ventas (sin las ventas que salen de una NE ni las canceladas) con su etapa
async function operaciones() {
  const [ne, nv, fs] = await Promise.all([datos.leer('notasEntrega'), datos.leer('ventas'), datos.leer('facturas')]);
  const facturas = new Map(fs.map(f => [f.id, f]));
  const lista = ne.map(d => Object.assign(datos.desdeEntrega(d), { col: 'notasEntrega', etapa: etapaDe(d, facturas), facturaId: d.facturaId || null }));
  nv.forEach(v => {
    if (v.fuente === 'nota_entrega' || v.notaEntregaId || /^cancel/.test(norm(v.estatus))) return;
    lista.push(Object.assign(datos.desdeVenta(v), { col: 'ventas', etapa: etapaDe(v, facturas), facturaId: v.facturaId || null }));
  });
  return { lista, facturas: fs };
}

// ── Resumen diario por rol ──
async function contextoDiario(ahora = Date.now()) {
  const reporte = require('./reporte');
  const [rep, ops, bajo, alarmas] = await Promise.all([
    reporte.armar(ahora), operaciones(), datos.productos('', true, 6).catch(() => ({ productos: [] })),
    fb().buscarIgual(RECORDATORIOS, 'estado', 'pendiente').catch(() => [])
  ]);
  const desde = d => ahora - d * DIA;
  const fechaMs = r => (r.fecha ? r.fecha.getTime() : 0);
  const nuevas = arr => arr.sort((a, b) => fechaMs(b) - fechaMs(a));
  return {
    rep, ops: ops.lista, facturas: ops.facturas, bajo: bajo.productos || [],
    porPreparar: nuevas(ops.lista.filter(r => ['registrada', 'preparacion'].includes(r.etapa) && fechaMs(r) >= desde(7))),
    enPreparacion: nuevas(ops.lista.filter(r => r.etapa === 'preparacion' && fechaMs(r) >= desde(14))),
    enTransito: nuevas(ops.lista.filter(r => r.etapa === 'transito' && fechaMs(r) >= desde(30))),
    ayer: diaCDMX(ahora - DIA), hoy: diaCDMX(ahora),
    alarmasHoy: alarmas.filter(a => diaCDMX(a.cuando) === diaCDMX(ahora))
  };
}

function lista(titulo, cosas, max = 5) {
  if (!cosas.length) return [];
  return [titulo + ' ' + cosas.length].concat(cosas.slice(0, max).map(lineaPieza), cosas.length > max ? ['   y ' + (cosas.length - max) + ' más'] : []);
}

function resumenDe(persona, ctx) {
  const reporte = require('./reporte');
  const rol = persona.rol || 'vendedor';
  let partes;
  if (rol === 'admin' || rol === 'facturacion') {
    partes = [reporte.texto(ctx.rep, persona)];
    if (rol === 'admin' && ctx.enTransito.length) partes.push('', '🚚 *En tránsito:* ' + ctx.enTransito.length);
  } else {
    const l = ['Buenos días, ' + primerNombre(persona) + '. Esto es lo tuyo para hoy:'];
    if (rol === 'almacen') {
      l.push('', ...(lista('📦 *Por preparar:*', ctx.porPreparar).length ? lista('📦 *Por preparar:*', ctx.porPreparar) : ['📦 Nada pendiente por preparar.']));
      if (ctx.bajo.length) l.push('', '⚠️ *Stock bajo:*', ...ctx.bajo.slice(0, 5).map(p => '• ' + p.descripcion + ' (' + p.stock + ' de ' + p.stock_minimo + ' mín.)'));
    } else if (rol === 'entregas') {
      const a = lista('📦 *Listas para salir:*', ctx.enPreparacion), b = lista('🚚 *En tránsito:*', ctx.enTransito);
      l.push('', ...(a.length || b.length ? a.concat(a.length && b.length ? [''] : [], b) : ['🚚 No hay piezas en camino ni por salir.']));
    } else {
      const mias = ctx.ops.filter(r => esVendedor(persona, r.vendedor));
      const deAyer = mias.filter(r => r.fecha && diaCDMX(r.fecha.getTime()) === ctx.ayer);
      const total = deAyer.reduce((s, r) => s + r.total, 0) / 100;
      l.push('', '🧾 *Tus ventas de ayer:* ' + (deAyer.length ? deAyer.length + (deAyer.length === 1 ? ' nota' : ' notas') + ' por ' + pesos(total) : 'ninguna'));
      const camino = mias.filter(r => r.etapa === 'transito');
      if (camino.length) l.push('', ...lista('🚚 *Tuyas en camino:*', camino));
      const ids = new Set(mias.map(r => r.col + ':' + r.id));
      const hoy0 = new Date(ctx.hoy + 'T00:00:00-06:00').getTime();
      const vencidas = ctx.facturas.filter(f => f.estatus === 'por_cobrar' && Number(f.saldo) > 0.009 && Number(f.vencimiento) < hoy0 && (f.notas || []).some(n => ids.has(n.col + ':' + n.id)));
      if (vencidas.length) l.push('', '💰 *Tus clientes con saldo vencido:*', ...vencidas.slice(0, 5).map(f => '• ' + f.serieFolio + ' · ' + f.clienteNombre + ' · ' + pesos(f.saldo) + ' (' + Math.round((hoy0 - Number(f.vencimiento)) / DIA) + ' días)'));
    }
    partes = [l.join('\n')];
  }
  const alarmas = ctx.alarmasHoy.filter(a => a.para === uidDe(persona)).sort((a, b) => a.cuando - b.cuando);
  if (alarmas.length) partes.push('', '⏰ *Tus alarmas de hoy:*', ...alarmas.map(a => '• ' + horaCDMX(a.cuando) + ' ' + a.texto));
  return partes.join('\n');
}

// ── Avisos al momento ──
// evento: nota_nueva {col, id} · etapa {col, id, etapa, nota} · factura {id} · pago {id, monto}
async function porEvento(evento, d, actor) {
  const equipo = await fb().leerColeccion('usuarios');
  const fuera = u => actor && uidDe(u) === uidDe(actor);
  const destinos = new Map();
  const a = (u, texto) => { if (!fuera(u) && !destinos.has(uidDe(u))) destinos.set(uidDe(u), { u, texto }); };
  const quien = actor ? ' (' + primerNombre(actor) + ')' : '';
  if (evento === 'nota_nueva' || evento === 'etapa') {
    if (!['notasEntrega', 'ventas'].includes(d.col)) throw new Error('Colección no válida');
    const doc = await fb().obtener(d.col, String(d.id));
    if (!doc) throw new Error('No encontré esa nota');
    if (d.col === 'ventas' && (doc.fuente === 'nota_entrega' || doc.notaEntregaId)) return [];
    const r = (d.col === 'ventas' ? datos.desdeVenta : datos.desdeEntrega)(Object.assign({ id: d.id }, doc));
    const piezas = piezasDe(r);
    const detalle = piezas.length ? '\n' + piezas.slice(0, 4).map(p => '• ' + p).join('\n') + (piezas.length > 4 ? '\n…y ' + (piezas.length - 4) + ' más' : '') : '';
    const vendedores = equipo.filter(u => esVendedor(u, r.vendedor));
    if (evento === 'nota_nueva') {
      conRol(equipo, 'almacen').forEach(u => a(u, '📦 Nueva ' + r.folio + ' de ' + (r.cliente || 'sin cliente') + quien + ': ' + (piezas.length || 'sin') + (piezas.length === 1 ? ' pieza' : ' piezas') + ' por preparar.' + detalle));
    } else {
      const nota = d.nota ? ' · ' + String(d.nota).slice(0, 200) : '';
      if (d.etapa === 'preparacion') conRol(equipo, 'entregas').forEach(u => a(u, '📦 ' + r.folio + ' de ' + (r.cliente || 'sin cliente') + ' está en preparación; pronto sale a ruta' + nota + '.' + detalle));
      if (d.etapa === 'transito') vendedores.forEach(u => a(u, '🚚 Tu ' + r.folio + ' de ' + (r.cliente || 'sin cliente') + ' ya va en camino' + nota + '.'));
      if (d.etapa === 'entregada') {
        vendedores.forEach(u => a(u, '✅ Tu ' + r.folio + ' de ' + (r.cliente || 'sin cliente') + ' ya se entregó' + nota + '.'));
        if (r.total > 0) conRol(equipo, 'facturacion').forEach(u => a(u, '🧾 ' + r.folio + ' de ' + (r.cliente || 'sin cliente') + ' ya se entregó: lista para facturar (' + pesos(r.total / 100) + ').'));
      }
    }
  } else if (evento === 'factura' || evento === 'pago') {
    const f = await fb().obtener('facturas', String(d.id));
    if (!f) throw new Error('No encontré esa factura');
    const docs = await Promise.all((f.notas || []).filter(n => ['notasEntrega', 'ventas'].includes(n.col)).map(n => fb().obtener(n.col, n.id).catch(() => null)));
    const vendedores = equipo.filter(u => docs.some(x => x && esVendedor(u, x.vendedor)));
    const folios = (f.notas || []).map(n => n.folio).join(', ');
    if (evento === 'factura') {
      vendedores.forEach(u => a(u, '🧾 Se facturó ' + (folios || 'tu nota') + ' de ' + f.clienteNombre + ' con la ' + f.serieFolio + ' (' + pesos(f.total) + (f.estatus === 'pagada' ? ', ya pagada' : ', vence en ' + (f.diasCredito || 0) + ' días') + ').'));
    } else {
      const texto = '💰 ' + f.clienteNombre + ' pagó ' + pesos(d.monto) + ' de la ' + f.serieFolio + '. ' + (Number(f.saldo) <= 0.009 ? 'Quedó pagada ✅' : 'Saldo: ' + pesos(f.saldo) + '.');
      vendedores.forEach(u => a(u, texto));
      conRol(equipo, 'admin').forEach(u => a(u, texto));
    }
  } else throw new Error('Evento desconocido');
  const resultados = [];
  for (const { u, texto } of destinos.values()) resultados.push(await avisar(u, { tipo: 'momento', titulo: 'Aviso', texto }));
  return resultados;
}

// ── Alarmas (recordatorios que se le piden a Pepito) ──
// La Ciudad de México está en UTC−6 todo el año (sin horario de verano desde 2022)
const OFFSET = 6 * 3600000;
const horaCDMX = ms => new Date(ms - OFFSET).toISOString().slice(11, 16);
function fechaLarga(ms) {
  const d = new Date(ms - OFFSET);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}
function cuandoDe(a, ahora) {
  if (a.en_minutos != null && a.en_minutos !== '') {
    const m = Number(a.en_minutos);
    if (!(m > 0)) return { error: 'en_minutos debe ser mayor que 0' };
    return { ms: ahora + Math.round(m) * 60000 };
  }
  const h = /^(\d{1,2}):(\d{2})$/.exec(String(a.hora || '').trim());
  if (!h) return { error: 'Falta la hora (HH:MM, 24 horas) o en_minutos' };
  const fecha = String(a.fecha || diaCDMX(ahora)).trim();
  const f = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!f) return { error: 'La fecha va como AAAA-MM-DD' };
  return { ms: Date.UTC(+f[1], +f[2] - 1, +f[3], +h[1], +h[2]) + OFFSET };
}

async function crearRecordatorio(usuario, a, ahora = Date.now()) {
  const texto = String(a.mensaje || '').trim();
  if (!texto) return { error: true, texto: 'Falta qué te recuerdo.' };
  const c = cuandoDe(a, ahora);
  if (c.error) return { error: true, texto: c.error };
  if (c.ms <= ahora + 30000) return { error: true, texto: 'Esa hora ya pasó: ahora son las ' + horaCDMX(ahora) + ' del ' + fechaLarga(ahora) + '.' };
  if (c.ms > ahora + 366 * DIA) return { error: true, texto: 'Solo puedo programar alarmas a menos de un año.' };
  let para = usuario;
  if (a.para && !['yo', 'mi', 'mí'].includes(norm(a.para))) {
    const q = norm(a.para);
    const equipo = await fb().leerColeccion('usuarios');
    const exactos = equipo.filter(u => norm(u.nombre) === q || norm(u.email) === q);
    const hallados = exactos.length ? exactos : equipo.filter(u => norm(u.nombre).includes(q) || norm(u.email).includes(q));
    if (!hallados.length) return { error: true, texto: 'No encontré a "' + a.para + '" en el equipo.' };
    if (hallados.length > 1) return { error: true, texto: 'Hay varias personas que coinciden con "' + a.para + '": ' + hallados.map(u => u.nombre || u.email).join(', ') + '. ¿A cuál?' };
    para = hallados[0];
  }
  const otro = uidDe(para) !== uidDe(usuario);
  const id = await fb().agregar(RECORDATORIOS, {
    uid: uidDe(usuario), deNombre: usuario.nombre || usuario.email || '', para: uidDe(para), paraNombre: para.nombre || para.email || '',
    texto: texto.slice(0, 500), cuando: c.ms, estado: 'pendiente', creado: ahora
  });
  return { error: false, texto: JSON.stringify({ creada: true, id, para: otro ? para.nombre || para.email : 'tú', cuando: fechaLarga(c.ms) + ' a las ' + horaCDMX(c.ms), aviso: 'Llega a la campanita del gestor' + (para.whatsapp10 ? ' y por WhatsApp' : '') }) };
}

async function misRecordatorios(usuario) {
  const mios = (await fb().buscarIgual(RECORDATORIOS, 'estado', 'pendiente')).filter(r => r.uid === uidDe(usuario) || r.para === uidDe(usuario)).sort((a, b) => a.cuando - b.cuando);
  return { error: false, texto: JSON.stringify({ alarmas: mios.map(r => ({ id: r.id, cuando: fechaLarga(r.cuando) + ' ' + horaCDMX(r.cuando), mensaje: r.texto, para: r.para === uidDe(usuario) ? 'tú' : r.paraNombre, de: r.uid === uidDe(usuario) ? 'tú' : r.deNombre })) }) };
}

async function cancelarRecordatorio(usuario, a) {
  const r = await fb().obtener(RECORDATORIOS, String(a.id || ''));
  if (!r || (r.uid !== uidDe(usuario) && r.para !== uidDe(usuario))) return { error: true, texto: 'No encontré esa alarma entre las tuyas.' };
  if (r.estado !== 'pendiente') return { error: true, texto: 'Esa alarma ya no está pendiente (' + r.estado + ').' };
  await fb().actualizar(RECORDATORIOS, String(a.id), { estado: 'cancelado' });
  return { error: false, texto: JSON.stringify({ cancelada: true, mensaje: r.texto }) };
}

// Manda las alarmas que ya tocan (lo llama el tick de /api/avisos cada 5 minutos)
async function alarmasVencidas(ahora = Date.now()) {
  const vencidas = (await fb().buscarIgual(RECORDATORIOS, 'estado', 'pendiente')).filter(r => r.cuando <= ahora);
  if (!vencidas.length) return [];
  const equipo = await fb().leerColeccion('usuarios');
  const resultados = [];
  for (const r of vencidas) {
    if (!(await fb().reservar(RECORDATORIOS, r.id, 'estado', 'enviado'))) continue;
    const persona = equipo.find(u => uidDe(u) === r.para);
    if (!persona) { resultados.push({ id: r.id, error: 'la persona ya no está en el equipo' }); continue; }
    const de = r.uid !== r.para ? ' (de ' + r.deNombre + ')' : '';
    resultados.push(Object.assign({ id: r.id }, await avisar(persona, { tipo: 'alarma', titulo: '⏰ Alarma', texto: '⏰ *Recordatorio*' + de + ':\n' + r.texto })));
  }
  return resultados;
}

module.exports = {
  avisar, mandarWhatsApp, procesarEstados, entregarPendientes, porEvento, contextoDiario, resumenDe,
  crearRecordatorio, misRecordatorios, cancelarRecordatorio, alarmasVencidas, esVendedor, etapaDe, cuandoDe, horaCDMX, prefs, clave
};
