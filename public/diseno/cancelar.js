// Cancelar en vez de eliminar: ventas, notas de entrega y cotizaciones. La nota conserva su folio, se sigue viendo
// como "Cancelada" con su motivo y no suma en ningún total. Se puede reactivar. Borrar definitivo: solo Dirección,
// solo lo ya cancelado y guardando antes una copia en "papelera".
// Campos (los mismos que entienden Seguimiento, plazos.js y Pepito): ventas estatus "Cancelado" + etapa "cancelada";
// notas de entrega etapa "cancelada"; cotizaciones estatus "cancelada"; todas con cancelacion { motivo, detalle, por, fecha, antes }.

const LOGISTICA = ['registrada', 'preparacion', 'transito', 'entregada'];
const D = () => (typeof window !== 'undefined' && window.data) || {};
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pesos = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plazos = () => (typeof window !== 'undefined' ? window.mayaPlazos : globalThis.mayaPlazos);

// ── Reglas (sin pantalla) ──
export const estaCancelada = d => !!d && (/^cancel/i.test(d.estatus || '') || d.estado === 'cancelada' || (d.etapa === 'cancelada' && !d.estatus));
export const folioDe = (col, d) => (col === 'ventas' ? (d.notaId ? 'NV #' + d.notaId : d.notaNumero || 'la venta')
  : col === 'cotizaciones' ? 'COT-' + (d.notaId || '') : d.notaId || 'la nota');
const clienteDe = d => d.clienteNombre || d.cliente || '';

const ms = f => (!f ? 0 : f.toMillis ? f.toMillis() : f.seconds ? f.seconds * 1000 : typeof f === 'number' ? f : Date.parse(f) || 0);
// El folio de una nota borrada se vuelve a usar: una venta de otro cliente y anterior a la nota (más de un día) no es suya
const ajena = (v, n) => v.clienteNombre !== n.cliente && !!ms(v.createdAt) && ms(v.createdAt) < ms(n.createdAt) - 86400000;

// Ventas creadas desde la nota. Si el folio estuviera repetido, se distingue por cliente.
export function ventasLigadas(nota, ventas, notas) {
  const l = (ventas || []).filter(v => nota.notaId && v.notaEntregaId === nota.notaId && !ajena(v, nota));
  const repetido = (notas || []).filter(n => n.notaId === nota.notaId).length > 1;
  return repetido ? l.filter(v => v.clienteNombre === nota.cliente) : l;
}
export function notaDeVenta(venta, notas) {
  if (!venta || !venta.notaEntregaId) return null;
  const l = (notas || []).filter(n => n.notaId === venta.notaEntregaId);
  const n = l.length > 1 ? l.find(x => x.cliente === venta.clienteNombre) : l[0];
  return n && !ajena(venta, n) ? n : null;
}
// Una venta no cuenta si está cancelada o si se canceló la nota de entrega con la que se creó
export const anulada = (v, notas) => estaCancelada(v) || estaCancelada(notaDeVenta(v, notas));
export function vigentes(ventas, notas) {
  const todas = notas || D().notasEntrega || [];
  const canceladas = todas.filter(estaCancelada);
  return (ventas || []).filter(v => !estaCancelada(v) && !(canceladas.length && estaCancelada(notaDeVenta(v, todas))));
}

// Qué se cancela junto: la nota con sus ventas; una venta ligada arrastra a su nota si no le queda otra venta activa
export function aCancelar(col, doc, nota, ligadas) {
  let l = [{ col, doc }];
  if (col === 'notasEntrega') l = l.concat((ligadas || []).map(v => ({ col: 'ventas', doc: v })));
  if (col === 'ventas' && nota && !(ligadas || []).some(v => v.id !== doc.id && !estaCancelada(v))) l.push({ col: 'notasEntrega', doc: nota });
  return l.filter(x => !estaCancelada(x.doc));
}
// Qué se reactiva junto: lo que se canceló en el mismo momento; una venta no revive sin su nota
export function aReactivar(col, doc, nota, ligadas) {
  const fecha = doc.cancelacion && doc.cancelacion.fecha;
  const mismas = x => estaCancelada(x.doc) && x.doc.id !== doc.id && !!fecha && !!x.doc.cancelacion && x.doc.cancelacion.fecha === fecha;
  const otras = (ligadas || []).map(v => ({ col: 'ventas', doc: v }));
  if (col === 'ventas' && nota) otras.unshift({ col: 'notasEntrega', doc: nota });
  const l = (estaCancelada(doc) ? [{ col, doc }] : []).concat(otras.filter(mismas));
  if (col === 'ventas' && estaCancelada(nota) && !l.some(x => x.col === 'notasEntrega')) l.push({ col: 'notasEntrega', doc: nota });
  return l;
}

// Motivo por el que no se puede cancelar ('' = sí se puede). facturas: { id: factura }
export function bloqueo(items, facturas) {
  for (const { col, doc } of items) {
    const folio = folioDe(col, doc);
    if (col === 'cotizaciones') {
      if (doc.estatus === 'vendida' || doc.ventaId) return folio + ' ya se convirtió en venta' + (doc.ventaFolio ? ' (' + doc.ventaFolio + ')' : '') + '. Cancela esa venta.';
      continue;
    }
    const f = doc.facturaId && (facturas || {})[doc.facturaId];
    // La orden directa nace con tieneFactura; si ya está ligada por id (o se desligó al cancelar la factura), manda el id
    const marcada = doc.tieneFactura && !(doc.fuente === 'factura_directa' && doc.facturaId !== undefined);
    if ((doc.facturaId && !(f && f.estatus === 'cancelada')) || marcada || doc.facturaURL) return folio + ' ya está facturada. Cancela primero la factura.';
    if ((doc.pagos || []).length) return folio + ' tiene pagos registrados; no se puede cancelar.';
  }
  return '';
}

// El anticipo no impide cancelar: se avisa para devolverlo y queda anotado
export const anticipoDe = items => Math.max(0, ...items.map(x => (x.col === 'cotizaciones' ? 0 : Number(x.doc.anticipo) || 0)));
const avisoAnticipo = n => (n > 0 ? 'Tiene un anticipo de ' + pesos(n) + ': recuerda devolverlo o acordarlo con el cliente. ' : '');

const nombreMotivo = c => (plazos() ? plazos().nombreMotivo(c.motivo) : c.motivo || '');
export const motivoTexto = d => {
  const c = d && d.cancelacion;
  return c ? [nombreMotivo(c), c.detalle].filter(Boolean).join(' · ') : '';
};

// Cambios que se guardan al cancelar. No toca folio ni importes.
export function cambiosCancelar(col, doc, cancelacion, nota) {
  const antes = { etapa: doc.etapa || null, estatus: doc.estatus || null };
  const c = { cancelacion: Object.assign({}, cancelacion, { antes }) };
  if (col === 'cotizaciones') return Object.assign(c, { estatus: 'cancelada' });
  const texto = [nombreMotivo(cancelacion), cancelacion.detalle, nota].filter(Boolean).join(' · ');
  c.etapa = 'cancelada';
  c.seguimiento = (doc.seguimiento || []).concat({ etapa: 'cancelada', fecha: cancelacion.fecha, por: cancelacion.por, nota: texto });
  if (col === 'ventas') c.estatus = 'Cancelado';
  return c;
}
// opciones.etapa: a qué etapa regresa (desde Seguimiento); sin indicarla, a la que tenía
export function cambiosReactivar(col, doc, por, ahora, opciones) {
  const o = opciones || {};
  const antes = (doc.cancelacion && doc.cancelacion.antes) || {};
  const sirve = e => !!e && !/^cancel/i.test(e);
  if (col === 'cotizaciones') return { cancelacion: null, estatus: sirve(antes.estatus) ? antes.estatus : 'vigente' };
  const previa = (doc.seguimiento || []).map(h => h.etapa).filter(e => LOGISTICA.includes(e)).pop();
  const etapa = 'etapa' in o ? o.etapa : (LOGISTICA.includes(antes.etapa) ? antes.etapa : previa || null);
  const c = { cancelacion: null, etapa };
  // Marcas de cancelado de otro origen: si se quedan, el registro nunca revive
  if (/^cancel/i.test(doc.estado || '')) c.estado = 'pendiente';
  if (col === 'notasEntrega' && /^cancel/i.test(doc.estatus || '')) c.estatus = sirve(antes.estatus) ? antes.estatus : null;
  if (col === 'ventas') {
    let estatus = sirve(antes.estatus) ? antes.estatus : (doc.notaEntregaId ? 'Entregado' : 'Pendiente');
    if (o.etapa === 'entregada') estatus = 'Entregado';
    else if (o.etapa && estatus === 'Entregado') estatus = 'Pendiente';
    c.estatus = estatus;
  }
  // La etapa del evento solo es "entregada" si de verdad se movió ahí: de eso depende el plazo para facturar
  c.seguimiento = (doc.seguimiento || []).concat({ etapa: o.etapa || 'reactivada', fecha: ahora, por, nota: 'Reactivada' + (o.nota ? ' · ' + o.nota : '') });
  return c;
}

// ── Pantalla ──
const aviso = (m, t) => window.toast(String(m), t || 'success');
const rol = () => window.currentRole || 'vendedor';
const yo = () => {
  const n = document.getElementById('user-name-display');
  return (n && n.textContent.trim()) || (window.auth && window.auth.currentUser && window.auth.currentUser.email) || 'Usuario';
};
const ref = (col, id) => window.doc(window.db, col, id);
const conId = s => Object.assign({}, s.data(), { id: s.id });
async function leer(col, id) {
  const s = await window.getDoc(ref(col, id));
  return s.exists() ? Object.assign({}, s.data(), { id }) : null;
}
const buscar = async (col, campo, valor) => (await window.getDocs(window.query(window.collection(window.db, col), window.where(campo, '==', valor)))).docs.map(conId);

// El registro y los ligados, tal como están guardados ahora mismo
async function cargar(col, id) {
  const doc = await leer(col, id);
  if (!doc) throw new Error('Ese registro ya no existe');
  let nota = null, ligadas = [];
  const folio = col === 'notasEntrega' ? doc.notaId : col === 'ventas' ? doc.notaEntregaId : null;
  if (folio) {
    const [notas, ventas] = await Promise.all([buscar('notasEntrega', 'notaId', folio), buscar('ventas', 'notaEntregaId', folio)]);
    nota = col === 'ventas' ? notaDeVenta(doc, notas) : null;
    const base = col === 'ventas' ? nota : doc;
    ligadas = base ? ventasLigadas(base, ventas, notas) : [];
  }
  return { doc, nota, ligadas };
}
async function facturasDe(items) {
  const ids = [...new Set(items.map(x => x.doc.facturaId).filter(Boolean))];
  const l = await Promise.all(ids.map(id => leer('facturas', id)));
  return ids.reduce((o, id, i) => { o[id] = l[i]; return o; }, {});
}
const lista = items => items.map(x => folioDe(x.col, x.doc)).join(', ');

export function pedirMotivo(titulo, textoBoton, explicacion) {
  const motivos = (plazos() && plazos().MOTIVOS_CANCELACION) || [{ id: 'otra', nombre: 'Otra causa (especificar)' }];
  return new Promise(resolver => {
    const v = document.createElement('div');
    v.className = 'modal-overlay open';
    v.style.zIndex = 4000;
    v.innerHTML = '<div class="modal" role="dialog" aria-modal="true" style="max-width:440px"><div class="modal-head"><h3>' + esc(titulo) + '</h3></div>' +
      '<div class="modal-body">' + (explicacion ? '<p class="mc-explica">' + esc(explicacion) + '</p>' : '') +
      '<div class="form-group"><label>Motivo de la cancelación</label><select data-cv-motivo><option value="">Elige un motivo…</option>' +
      motivos.map(m => '<option value="' + esc(m.id) + '">' + esc(m.nombre) + '</option>').join('') + '</select></div>' +
      '<div class="form-group"><label>Detalle (obligatorio si es otra causa)</label><textarea data-cv-detalle maxlength="300"></textarea></div></div>' +
      '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-cv-no>No cancelar</button><button type="button" class="btn btn-danger" data-cv-si>' + esc(textoBoton || 'Sí, cancelar') + '</button></div></div>';
    // Si otra cosa la cierra (cambiar de módulo quita "open"), cuenta como "No cancelar" y no se queda trabado el registro
    const cierre = new MutationObserver(() => { if (!v.classList.contains('open')) fin(null); });
    const fin = r => { cierre.disconnect(); v.remove(); resolver(r); };
    v.querySelector('[data-cv-no]').onclick = e => { e.stopPropagation(); fin(null); };
    v.addEventListener('click', e => { if (e.target === v) fin(null); }); // tocar fuera = no cancelar
    v.querySelector('[data-cv-si]').onclick = () => {
      const motivo = v.querySelector('[data-cv-motivo]').value, detalle = v.querySelector('[data-cv-detalle]').value.trim();
      if (!motivo) return aviso('Elige el motivo', 'error');
      if (motivo === 'otra' && !detalle) return aviso('Escribe cuál es la otra causa', 'error');
      fin({ motivo, detalle });
    };
    document.body.appendChild(v);
    cierre.observe(v, { attributes: true, attributeFilter: ['class'] });
  });
}

const enCurso = new Set();
// Un solo proceso por registro; los errores se avisan y devuelven false
async function conCandado(clave, hacer) {
  if (enCurso.has(clave)) return false;
  enCurso.add(clave);
  try { return await hacer(); }
  catch (e) { console.error('cancelar', clave, e); aviso('No se pudo completar: ' + e.message, 'error'); return false; }
  finally { enCurso.delete(clave); }
}

// opciones: { motivo, detalle, nota } si ya se capturaron (Seguimiento)
export function cancelar(col, id, opciones) {
  const o = opciones || {};
  return conCandado(col + id, async () => {
    const revisar = async () => {
      const g = await cargar(col, id);
      if (estaCancelada(g.doc)) { aviso(folioDe(col, g.doc) + ' ya está cancelada', 'info'); return null; }
      const items = aCancelar(col, g.doc, g.nota, g.ligadas);
      const no = bloqueo(items, await facturasDe(items));
      if (no) { aviso(no, 'error'); return null; }
      return items;
    };
    let items = await revisar();
    if (!items) return false;
    let m = o.motivo ? { motivo: o.motivo, detalle: o.detalle || '' } : null;
    if (m && anticipoDe(items) > 0 && !window.confirm(avisoAnticipo(anticipoDe(items)) + '¿Cancelar de todos modos?')) return false;
    if (!m) {
      const d = items[0].doc;
      m = await pedirMotivo('Cancelar ' + folioDe(col, d) + (clienteDe(d) ? ' · ' + clienteDe(d) : ''), col === 'cotizaciones' ? 'Cancelar la cotización' : col === 'ventas' ? 'Cancelar la venta' : 'Cancelar la nota',
        avisoAnticipo(anticipoDe(items)) + (items.length > 1 ? 'También se cancela ' + lista(items.slice(1)) + '. ' : '') + 'Conserva su folio, se sigue viendo como Cancelada y deja de sumar.');
      if (!m) return false;
      items = await revisar(); // pudo facturarse mientras elegían el motivo
      if (!items) return false;
    }
    const cancelacion = { motivo: m.motivo, detalle: m.detalle, por: yo(), fecha: Date.now() };
    if (anticipoDe(items) > 0) cancelacion.anticipo = anticipoDe(items);
    const lote = window.writeBatch(window.db);
    items.forEach(x => lote.update(ref(x.col, x.doc.id), cambiosCancelar(x.col, x.doc, cancelacion, o.nota)));
    await lote.commit();
    const paraAviso = items.find(x => x.col === 'notasEntrega') || items.find(x => x.col === 'ventas');
    if (paraAviso && window.mayaAvisar) window.mayaAvisar('etapa', { col: paraAviso.col, id: paraAviso.doc.id, etapa: 'cancelada', nota: [nombreMotivo(cancelacion), cancelacion.detalle].filter(Boolean).join(' · ') });
    aviso(lista(items) + (items.length > 1 ? ' canceladas' : ' cancelada'));
    return true;
  });
}

// opciones: { sinPreguntar, etapa, nota }
export function reactivar(col, id, opciones) {
  const o = opciones || {};
  return conCandado(col + id, async () => {
    const g = await cargar(col, id);
    const items = aReactivar(col, g.doc, g.nota, g.ligadas);
    if (!items.length) { aviso(folioDe(col, g.doc) + ' no está cancelada', 'info'); return false; }
    const siguen = g.ligadas.filter(v => estaCancelada(v) && !items.some(x => x.doc.id === v.id));
    let resto = col === 'notasEntrega' && siguen.length ? ' (' + siguen.map(v => folioDe('ventas', v)).join(', ') + ' sigue cancelada)' : '';
    if (col === 'ventas' && g.doc.notaEntregaId && !g.nota) resto = ' (su nota ' + g.doc.notaEntregaId + ' ya no existe: no saldrá en Notas ni en pendientes de facturar)';
    if (!o.sinPreguntar && !window.confirm('¿Reactivar ' + lista(items) + '?\n\nVuelve a contar en los totales.' + resto)) return false;
    const ahora = Date.now(), por = yo();
    const lote = window.writeBatch(window.db);
    items.forEach(x => {
      const propio = x.doc.id === id && x.col === col;
      const extra = propio ? o : {};
      lote.update(ref(x.col, x.doc.id), cambiosReactivar(x.col, x.doc, por, ahora, extra));
    });
    await lote.commit();
    aviso(lista(items) + (items.length > 1 ? ' reactivadas' : ' reactivada') + resto);
    return true;
  });
}

export function borrarDefinitivo(col, id) {
  return conCandado(col + id, async () => {
    if (rol() !== 'admin') { aviso('Solo Dirección puede borrar definitivamente', 'error'); return false; }
    const g = await cargar(col, id);
    if (!(col === 'ventas' ? estaCancelada(g.doc) || estaCancelada(g.nota) : estaCancelada(g.doc))) { aviso('Primero cancélala. Solo se borran registros cancelados.', 'error'); return false; }
    // Si una nota cancelada dejó activa su venta (cancelada desde Pepito), se cancela para que no vuelva a sumar
    const activas = col === 'notasEntrega' ? g.ligadas.filter(v => !estaCancelada(v)).map(v => ({ col: 'ventas', doc: v })) : [];
    const no = bloqueo([{ col, doc: g.doc }].concat(activas), await facturasDe([{ col, doc: g.doc }].concat(activas)));
    if (no) { aviso(no, 'error'); return false; }
    const folio = folioDe(col, g.doc);
    if (!window.confirm('¿Borrar definitivamente ' + folio + (clienteDe(g.doc) ? ' de ' + clienteDe(g.doc) : '') + '?\n\nDesaparece de las listas y no se puede deshacer desde la app (queda una copia en la papelera).' +
      (activas.length ? '\nSu venta ' + lista(activas) + ' quedará cancelada.' : ''))) return false;
    const ahora = Date.now();
    const lote = window.writeBatch(window.db);
    const datos = Object.assign({}, g.doc);
    delete datos.id;
    const u = (window.auth && window.auth.currentUser) || {};
    lote.set(ref('papelera', col + '_' + id + '_' + ahora), {
      coleccion: col, idOriginal: id, datos, eliminadoPor: u.email || '', eliminadoPorNombre: yo(), eliminadoEn: new Date(ahora).toISOString(), origen: 'gestor'
    });
    lote.delete(ref(col, id));
    const cancelacion = Object.assign({ motivo: 'otra', detalle: 'Se borró ' + folio }, g.doc.cancelacion, { por: yo(), fecha: ahora });
    activas.forEach(x => lote.update(ref(x.col, x.doc.id), cambiosCancelar(x.col, x.doc, cancelacion)));
    await lote.commit();
    aviso(folio + ' borrada (copia en la papelera)');
    return true;
  });
}

// ── Para pintar las listas (index.html) ──
const porId = (col, id) => (D()[col] || []).find(x => x.id === id);
export function esAnulada(col, id) {
  const d = porId(col, id);
  return !!d && (col === 'ventas' ? anulada(d, D().notasEntrega) : estaCancelada(d));
}
const clase = (col, id) => (esAnulada(col, id) ? 'mc-cancelada' : '');
function etiqueta(col, id) {
  if (!esAnulada(col, id)) return '';
  const d = porId(col, id);
  const nota = col === 'ventas' && !estaCancelada(d) ? notaDeVenta(d, D().notasEntrega) : null;
  const motivo = nota ? ('Se canceló la nota ' + nota.notaId) : motivoTexto(d);
  return '<span class="mc-etiqueta">Cancelada</span>' + (motivo ? '<small class="mc-motivo">' + esc(motivo) + '</small>' : '');
}
// Botones de Dirección: Cancelar, o Reactivar y Borrar si ya está cancelada
function botones(col, id) {
  if (rol() !== 'admin') return '';
  const b = (fn, texto, titulo, c) => '<button type="button" class="btn ' + c + ' btn-sm" title="' + titulo + '" onclick="mayaCancelar.' + fn + '(\'' + col + '\',\'' + esc(id) + '\')">' + texto + '</button>';
  return esAnulada(col, id)
    ? b('reactivar', '↩️<span class="ne-txt"> Reactivar</span>', 'Reactivar', 'btn-secondary') + ' ' + b('borrarDefinitivo', '🗑<span class="ne-txt"> Borrar</span>', 'Borrar definitivamente', 'btn-danger')
    : b('cancelar', '🚫<span class="ne-txt"> Cancelar</span>', 'Cancelar', 'btn-danger');
}

if (typeof window !== 'undefined') {
  window.mayaCancelar = {
    estaCancelada, anulada, vigentes, esAnulada, motivoTexto, clase, etiqueta, botones, pedirMotivo,
    cancelar: (col, id, o) => cancelar(col, id, o), reactivar: (col, id, o) => reactivar(col, id, o), borrarDefinitivo
  };
}
