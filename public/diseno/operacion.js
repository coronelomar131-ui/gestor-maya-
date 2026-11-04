// Operación de Maya: seguimiento de piezas, facturación (con el XML que timbra CONTPAQi), cobranza y la oficina virtual.
// Usa los datos que la app ya trae en tiempo real (window.data.notasEntrega / ventas / clientes), así que casi no gasta
// lecturas de Firebase. Las facturas viven en la colección "facturas" y solo se escuchan al abrir estos módulos.
import { icono } from './iconos.js';
import { emparejar } from './emparejar.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const escapar = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const pesos = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ms = f => (!f ? 0 : f.toMillis ? f.toMillis() : f.seconds ? f.seconds * 1000 : (typeof f === 'number' ? f : new Date(f).getTime() || 0));
const DIA = 86400000;
const inicioDia = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const hoy0 = () => inicioDia(Date.now());
const fechaCorta = t => (t ? new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
const fechaISO = t => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const rol = () => window.currentRole || 'vendedor';
const yo = () => (($('#user-name-display') && $('#user-name-display').textContent.trim()) || (window.auth && window.auth.currentUser && window.auth.currentUser.email) || 'Usuario');
const aviso = (m, t) => window.toast && window.toast(m, t || 'success');
const D = () => window.data || {};

// ── Notas de entrega (NE) y notas de venta (NV) en un solo formato, igual que el historial de la app ──
function registros() {
  const ne = (D().notasEntrega || []).map(n => ({
    tipo: 'NE', col: 'notasEntrega', id: n.id, folio: n.notaId || 'NE', raw: n,
    cliente: n.cliente || '', siniestro: n.siniestro || (n.items || []).map(i => i.siniestro).filter(Boolean).join(' | '),
    piezas: (n.items || []).map(i => i.descripcion).filter(Boolean).join(', '),
    fecha: ms(n.fecha) || ms(n.createdAt), total: Number(n.total) || 0
  }));
  const nv = (D().ventas || [])
    .filter(v => !(v.fuente === 'nota_entrega' || v.notaEntregaId) && !/^cancel/.test(norm(v.estatus)))
    .map(v => ({
      tipo: 'NV', col: 'ventas', id: v.id, folio: v.notaId ? 'NV #' + v.notaId : (v.notaNumero || 'NV'), raw: v,
      cliente: v.clienteNombre || v.cliente || '', siniestro: String(v.siniestros || (v.items || []).map(i => i.numSiniestro).filter(Boolean).join(' | ') || v.numeroReporte || ''),
      piezas: (v.items || []).map(i => i.pedido || i.descripcion).filter(Boolean).join(', ') || v.descripcion || '',
      fecha: ms(v.fecha) || ms(v.createdAt), total: Number(v.total) || 0
    }));
  return ne.concat(nv).sort((a, b) => b.fecha - a.fecha);
}

// ── Etapas de una pieza: las de logística se capturan; facturada y pagada salen de la factura ligada ──
const ETAPAS = [
  { id: 'registrada', nombre: 'Registrada', icono: 'clipboard-check' },
  { id: 'preparacion', nombre: 'En preparación', icono: 'package' },
  { id: 'transito', nombre: 'En tránsito', icono: 'truck' },
  { id: 'entregada', nombre: 'Entregada', icono: 'check' },
  { id: 'facturada', nombre: 'Facturada', icono: 'receipt' },
  { id: 'pagada', nombre: 'Pagada', icono: 'wallet' }
];
const LOGISTICA = ['registrada', 'preparacion', 'transito', 'entregada'];
const nombreEtapa = id => (ETAPAS.find(e => e.id === id) || ETAPAS[0]).nombre;

let facturas = [];
let quitarFacturas = null;
const facturaDe = r => r.raw.facturaId && facturas.find(f => f.id === r.raw.facturaId);
function etapa(r) {
  const f = facturaDe(r);
  if (f && f.estatus !== 'cancelada') return f.estatus === 'pagada' ? 'pagada' : 'facturada';
  if (r.raw.facturaId && !facturas.length) return 'facturada';
  if (r.raw.etapa && LOGISTICA.includes(r.raw.etapa)) return r.raw.etapa;
  const e = norm(r.raw.estatus);
  if (e === 'entregado') return 'entregada';
  if (e === 'en proceso') return 'preparacion';
  return 'registrada';
}
const facturable = r => !r.raw.facturaId || (facturaDe(r) && facturaDe(r).estatus === 'cancelada');

function escucharFacturas() {
  if (quitarFacturas || !window.onSnapshot || !window.db) return;
  quitarFacturas = window.onSnapshot(window.collection(window.db, 'facturas'), snap => {
    facturas = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    pintarActivo();
  }, err => console.warn('facturas:', err.message));
}

// ── Plazo de crédito por cliente (campo diasCredito en clientes) ──
function clientePorNombreORfc(nombre, rfc) {
  const lista = D().clientes || [];
  const r = norm(rfc);
  if (r) { const c = lista.find(x => norm(x.rfc) === r); if (c) return c; }
  const n = norm(nombre);
  return lista.find(x => norm(x.razonSocial || x.nombre) === n) ||
    lista.find(x => n && norm(x.razonSocial || x.nombre) && (n.includes(norm(x.razonSocial || x.nombre)) || norm(x.razonSocial || x.nombre).includes(n))) || null;
}
const diasCredito = c => (c && Number(c.diasCredito) >= 0 ? Number(c.diasCredito) : 0);

// ═══════════════════════ SEGUIMIENTO DE PIEZAS ═══════════════════════
let filtroSeg = { texto: '', etapa: 'activas' };
function pintarSeguimiento() {
  const mod = $('#mod-seguimiento');
  if (!mod) return;
  if (!mod.dataset.listo) {
    mod.dataset.listo = '1';
    mod.innerHTML = `
      <div class="m-op">
        <div class="m-op-barra m-vidrio">
          <input type="search" id="seg-buscar" placeholder="Buscar cliente, folio, siniestro o pieza…">
          <div class="m-op-chips" id="seg-etapas"></div>
        </div>
        <div class="m-op-resumen" id="seg-resumen"></div>
        <div class="m-op-lista" id="seg-lista"></div>
      </div>`;
    $('#seg-buscar', mod).addEventListener('input', e => { filtroSeg.texto = e.target.value; pintarSeguimiento(); });
    $('#seg-etapas', mod).addEventListener('click', e => { const b = e.target.closest('[data-etapa]'); if (b) { filtroSeg.etapa = b.dataset.etapa; pintarSeguimiento(); } });
    $('#seg-lista', mod).addEventListener('click', e => { const b = e.target.closest('[data-abrir]'); if (b) abrirPieza(b.dataset.col, b.dataset.abrir); });
  }
  const todos = registros();
  const cuenta = id => todos.filter(r => etapa(r) === id).length;
  $('#seg-etapas', mod).innerHTML = [{ id: 'activas', nombre: 'Por entregar' }, { id: 'todas', nombre: 'Todas' }].concat(ETAPAS)
    .map(e => `<button type="button" data-etapa="${e.id}" class="${filtroSeg.etapa === e.id ? 'activo' : ''}">${escapar(e.nombre)}${ETAPAS.includes(e) ? ' <b>' + cuenta(e.id) + '</b>' : ''}</button>`).join('');
  const q = norm(filtroSeg.texto);
  const lista = todos.filter(r => {
    const et = etapa(r);
    if (filtroSeg.etapa === 'activas' && !['registrada', 'preparacion', 'transito'].includes(et)) return false;
    if (!['activas', 'todas'].includes(filtroSeg.etapa) && et !== filtroSeg.etapa) return false;
    return !q || norm([r.cliente, r.folio, r.siniestro, r.piezas].join(' ')).includes(q);
  });
  $('#seg-resumen', mod).innerHTML = ['preparacion', 'transito', 'entregada'].map(id => {
    const e = ETAPAS.find(x => x.id === id);
    return `<div class="m-op-kpi m-vidrio">${icono(e.icono, 18)}<span>${e.nombre}</span><strong>${cuenta(id)}</strong></div>`;
  }).join('') + `<div class="m-op-kpi m-vidrio">${icono('receipt', 18)}<span>Por facturar</span><strong>${todos.filter(r => facturable(r) && etapa(r) === 'entregada').length}</strong></div>`;
  $('#seg-lista', mod).innerHTML = lista.length ? lista.slice(0, 80).map(r => {
    const et = etapa(r);
    const paso = ETAPAS.findIndex(e => e.id === et);
    return `<button type="button" class="m-op-fila m-vidrio" data-abrir="${escapar(r.id)}" data-col="${r.col}">
      <span class="m-op-folio">${escapar(r.folio)}</span>
      <span class="m-op-info"><strong>${escapar(r.cliente || 'Sin cliente')}</strong><small>${escapar(r.piezas || '—')}${r.siniestro ? ' · Sin. ' + escapar(r.siniestro) : ''}</small></span>
      <span class="m-op-pasos" aria-label="${escapar(nombreEtapa(et))}">${ETAPAS.map((e, i) => `<i class="${i <= paso ? 'hecho' : ''}" title="${e.nombre}"></i>`).join('')}</span>
      <span class="m-op-etapa e-${et}">${escapar(nombreEtapa(et))}</span>
    </button>`;
  }).join('') + (lista.length > 80 ? `<p class="m-op-nota">Mostrando 80 de ${lista.length}. Usa el buscador para encontrar otras.</p>` : '')
    : `<div class="m-op-vacio">${icono('package', 28)}<p>No hay piezas en esta vista.</p></div>`;
}

function abrirPieza(col, id) {
  const r = registros().find(x => x.col === col && x.id === id);
  if (!r) return;
  const et = etapa(r);
  const f = facturaDe(r);
  const hist = (r.raw.seguimiento || []).slice().sort((a, b) => ms(a.fecha) - ms(b.fecha));
  const puedeMover = LOGISTICA.includes(et);
  dialogo(`${r.folio} · ${r.cliente || 'Sin cliente'}`, `
    <p class="m-op-sub">${escapar(r.piezas || '—')}${r.siniestro ? ' · Siniestro ' + escapar(r.siniestro) : ''} · ${pesos(r.total)}</p>
    <ol class="m-op-linea">
      ${ETAPAS.map((e, i) => {
        const ev = hist.filter(h => h.etapa === e.id).pop();
        const hecho = i <= ETAPAS.findIndex(x => x.id === et);
        return `<li class="${hecho ? 'hecho' : ''}${e.id === et ? ' actual' : ''}">${icono(e.icono, 16)}<div><strong>${e.nombre}</strong>
          <small>${ev ? fechaCorta(ms(ev.fecha)) + ' · ' + escapar(ev.por || '') + (ev.nota ? ' · ' + escapar(ev.nota) : '') : (e.id === 'registrada' ? fechaCorta(r.fecha) : e.id === 'facturada' && f ? escapar(f.serieFolio) + ' · ' + fechaCorta(ms(f.fecha)) : '')}</small></div></li>`;
      }).join('')}
    </ol>
    ${puedeMover ? `<div class="m-op-mover">
      <label>Mover a</label>
      <select id="pz-etapa">${LOGISTICA.map(id => `<option value="${id}"${id === et ? ' selected' : ''}>${nombreEtapa(id)}</option>`).join('')}</select>
      <input type="text" id="pz-nota" placeholder="Nota opcional (ej. guía, quién recibió)">
    </div>` : `<p class="m-op-nota">${f ? 'Ligada a la factura ' + escapar(f.serieFolio) + '. ' : ''}Las etapas Facturada y Pagada se actualizan solas desde Facturación y Cobranza.</p>`}`,
  puedeMover ? [{ texto: 'Guardar etapa', principal: true, accion: async () => {
    const nueva = $('#pz-etapa').value;
    const nota = $('#pz-nota').value.trim();
    if (nueva === et && !nota) return true;
    const ev = { etapa: nueva, fecha: Date.now(), por: yo() };
    if (nota) ev.nota = nota;
    await window.updateDoc(window.doc(window.db, col, id), { etapa: nueva, seguimiento: (r.raw.seguimiento || []).concat(ev) });
    aviso(r.folio + ' → ' + nombreEtapa(nueva));
    return true;
  } }] : []);
}

// ═══════════════════════ FACTURACIÓN (XML de CONTPAQi) ═══════════════════════
let pestanaFac = 'pendientes';
let seleccion = new Set();
function pintarFacturacion() {
  const mod = $('#mod-facturacion');
  if (!mod) return;
  if (!mod.dataset.listo) {
    mod.dataset.listo = '1';
    mod.innerHTML = `
      <div class="m-op">
        <section class="m-op-cabeza m-vidrio">
          <div><h2>Facturación</h2><p>Timbra en CONTPAQi como siempre y sube aquí el XML: el gestor lo liga a sus notas y lo pasa a Cobranza.</p></div>
          <label class="btn btn-primary m-op-subir">${icono('file-down', 16)}<span>Subir XML de CONTPAQi</span><input type="file" id="fac-xml" accept=".xml,text/xml,application/xml" multiple hidden></label>
        </section>
        <div class="m-op-tabs" id="fac-tabs">
          <button type="button" data-tab="pendientes">Pendientes de facturar</button>
          <button type="button" data-tab="facturas">Facturas</button>
        </div>
        <div id="fac-cuerpo"></div>
      </div>`;
    $('#fac-tabs', mod).addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { pestanaFac = b.dataset.tab; pintarFacturacion(); } });
    $('#fac-xml', mod).addEventListener('change', e => { subirXML([...e.target.files]); e.target.value = ''; });
    $('#fac-cuerpo', mod).addEventListener('change', e => {
      const c = e.target.closest('[data-sel]');
      if (c) { c.checked ? seleccion.add(c.dataset.sel) : seleccion.delete(c.dataset.sel); pintarFacturacion(); }
    });
    $('#fac-cuerpo', mod).addEventListener('click', e => {
      const cancelar = e.target.closest('[data-cancelar]');
      if (cancelar) return cancelarFactura(cancelar.dataset.cancelar);
      const copiar = e.target.closest('[data-copiar]');
      if (copiar) return copiarParaContpaqi();
      if (e.target.closest('[data-limpiar]')) { seleccion.clear(); previaAbierta = false; pintarFacturacion(); }
      if (e.target.closest('[data-previa]')) { previaAbierta = !previaAbierta; pintarFacturacion(); }
    });
  }
  $$('#fac-tabs [data-tab]', mod).forEach(b => b.classList.toggle('activo', b.dataset.tab === pestanaFac));
  const cuerpo = $('#fac-cuerpo', mod);
  if (pestanaFac === 'pendientes') {
    const pend = registros().filter(facturable).filter(r => r.total > 0);
    const porCliente = {};
    pend.forEach(r => { (porCliente[r.cliente || 'Sin cliente'] = porCliente[r.cliente || 'Sin cliente'] || []).push(r); });
    const elegidas = pend.filter(r => seleccion.has(r.col + ':' + r.id));
    cuerpo.innerHTML = `<div class="m-fac-dos"><div class="m-fac-izq">` +
      (Object.keys(porCliente).length ? Object.entries(porCliente).sort((a, b) => b[1].length - a[1].length).map(([cli, lista]) => `
      <section class="m-op-grupo m-vidrio">
        <header><strong>${escapar(cli)}</strong><span>${lista.length} ${lista.length === 1 ? 'nota' : 'notas'} · ${pesos(lista.reduce((s, r) => s + r.total, 0))}</span></header>
        ${lista.map(r => `<label class="m-op-check">
          <input type="checkbox" data-sel="${r.col}:${escapar(r.id)}"${seleccion.has(r.col + ':' + r.id) ? ' checked' : ''}>
          <span class="m-op-folio">${escapar(r.folio)}</span>
          <span class="m-op-info"><strong>${escapar(r.piezas || '—')}</strong><small>${fechaCorta(r.fecha)}${r.siniestro ? ', siniestro ' + escapar(r.siniestro) : ''}, ${escapar(nombreEtapa(etapa(r)).toLowerCase())}</small></span>
          <span class="m-op-monto">${pesos(r.total)}</span>
        </label>`).join('')}
      </section>`).join('') : `<div class="m-op-vacio">${icono('check', 28)}<p>No hay notas pendientes de facturar.</p></div>`) +
      `<p class="m-op-nota">Las notas en $0 (sin precio a propósito) no aparecen aquí.</p></div>` + previaFactura(elegidas) + `</div>`;
  } else {
    const lista = facturas.slice().sort((a, b) => ms(b.fecha) - ms(a.fecha));
    cuerpo.innerHTML = lista.length ? `<div class="m-op-lista">${lista.map(f => `
      <div class="m-op-fila m-vidrio estatica">
        <span class="m-op-folio">${escapar(f.serieFolio)}</span>
        <span class="m-op-info"><strong>${escapar(f.clienteNombre || f.receptorNombre)}</strong><small>${fechaCorta(ms(f.fecha))} · ${(f.notas || []).map(n => escapar(n.folio)).join(', ') || 'sin notas ligadas'} · UUID ${escapar(String(f.uuid).slice(0, 8))}…</small></span>
        <span class="m-op-monto">${pesos(f.total)}</span>
        <span class="m-op-etapa e-${f.estatus === 'pagada' ? 'pagada' : f.estatus === 'cancelada' ? 'cancelada' : 'facturada'}">${f.estatus === 'pagada' ? 'Pagada' : f.estatus === 'cancelada' ? 'Cancelada' : 'Por cobrar'}</span>
        ${rol() === 'admin' && f.estatus !== 'cancelada' ? `<button type="button" class="m-op-x" data-cancelar="${escapar(f.id)}" title="Marcar como cancelada">${icono('x', 14)}</button>` : ''}
      </div>`).join('')}</div>` : `<div class="m-op-vacio">${icono('receipt', 28)}<p>Todavía no se ha subido ninguna factura. Usa “Subir XML de CONTPAQi”.</p></div>`;
  }
}

// Partidas de una nota tal como irían en la factura: pieza, siniestro, cantidad, importe sin IVA e IVA
function partidasFactura(r) {
  const items = r.raw.items || [];
  if (!items.length) return [{ folio: r.folio, pieza: r.piezas || '—', siniestro: r.siniestro || '', cantidad: 1, importe: r.total, iva: 0 }];
  if (r.tipo === 'NE') {
    const sub = items.reduce((s, i) => s + (Number(i.cantidad) || 1) * (Number(i.precioUnit) || 0), 0);
    const ivaNota = Number(r.raw.ivaTotal) || 0;
    return items.map(i => {
      const imp = (Number(i.cantidad) || 1) * (Number(i.precioUnit) || 0);
      const conAnio = i.anio && !String(i.descripcion || '').includes(String(i.anio)) ? (i.descripcion || '') + ' (' + i.anio + ')' : (i.descripcion || '—');
      return { folio: r.folio, pieza: conAnio, siniestro: i.siniestro || '', cantidad: Number(i.cantidad) || 1, importe: imp, iva: sub ? ivaNota * imp / sub : 0 };
    });
  }
  return items.map(i => ({ folio: r.folio, pieza: i.pedido || i.descripcion || '—', siniestro: i.numSiniestro || '', cantidad: 1, importe: Number(i.precio) || 0, iva: Number(i.iva) || 0, ajuste: Number(i.ajuste) || 0 }));
}

let previaAbierta = false;
function previaFactura(elegidas) {
  if (!elegidas.length) {
    return `<aside class="m-fac-previa vacia m-vidrio" id="fac-previa">${icono('receipt-text', 26)}<strong>Vista previa de la factura</strong><p>Marca las notas que vas a facturar y aquí verás qué piezas lleva, a qué cliente y por cuánto.</p></aside>`;
  }
  const partidas = elegidas.flatMap(partidasFactura);
  const subtotal = partidas.reduce((s, p) => s + p.importe - (p.ajuste || 0), 0);
  const iva = partidas.reduce((s, p) => s + p.iva, 0);
  const total = elegidas.reduce((s, r) => s + r.total, 0);
  const clientes = [...new Set(elegidas.map(r => r.cliente || 'Sin cliente'))];
  const sinIva = iva < 0.01 && subtotal > 0;
  return `<aside class="m-fac-previa m-vidrio${previaAbierta ? ' abierta' : ''}" id="fac-previa" aria-label="Vista previa de la factura">
    <button type="button" class="m-fac-barra" data-previa="1" aria-expanded="${previaAbierta}">
      <span><b>${elegidas.length} ${elegidas.length === 1 ? 'nota' : 'notas'}</b> para ${escapar(clientes[0])}</span>
      <strong>${pesos(total)}</strong>
      <em>${previaAbierta ? 'Ocultar' : 'Ver factura'}</em>
    </button>
    <header>
      <span>Vista previa de la factura</span>
      <strong>${escapar(clientes[0])}</strong>
      ${clientes.length > 1 ? `<p class="m-fac-alerta">${icono('circle-alert', 14)} Marcaste notas de ${clientes.length} clientes; una factura es para uno solo.</p>` : ''}
    </header>
    <ol class="m-fac-partidas">
      ${partidas.map(p => `<li>
        <span class="m-fac-cant">${p.cantidad}×</span>
        <span class="m-fac-pieza"><b>${escapar(p.pieza)}</b><small>${escapar(p.folio)}${p.siniestro ? ', siniestro ' + escapar(p.siniestro) : ''}</small></span>
        <span class="m-fac-imp">${pesos(p.importe)}</span>
      </li>`).join('')}
    </ol>
    <dl class="m-fac-totales">
      <div><dt>Subtotal</dt><dd>${pesos(subtotal)}</dd></div>
      <div><dt>IVA de las notas</dt><dd>${pesos(iva)}</dd></div>
      <div class="total"><dt>Total</dt><dd>${pesos(total)}</dd></div>
      ${sinIva ? `<p class="m-op-nota">Las notas no traen IVA. Si la facturas con IVA 16%, el total sería ${pesos(subtotal * 1.16)}.</p>` : ''}
    </dl>
    <footer>
      <button type="button" class="btn btn-secondary btn-sm" data-limpiar="1">Quitar todas</button>
      <button type="button" class="btn btn-primary btn-sm" data-copiar="1">${icono('clipboard-list', 14)}<span>Copiar para CONTPAQi</span></button>
    </footer>
  </aside>`;
}

function copiarParaContpaqi() {
  const elegidas = registros().filter(r => seleccion.has(r.col + ':' + r.id));
  const texto = elegidas.map(r => {
    const items = r.tipo === 'NE'
      ? (r.raw.items || []).map(i => `  - ${i.cantidad || 1} x ${i.descripcion || ''}${i.siniestro ? ' (Sin. ' + i.siniestro + ')' : ''} @ ${pesos(i.precioUnit)}`)
      : (r.raw.items || []).map(i => `  - ${i.pedido || i.descripcion || ''}${i.numSiniestro ? ' (Sin. ' + i.numSiniestro + ')' : ''}: ${pesos(i.precio)}`);
    return `${r.folio} · ${r.cliente} · ${fechaCorta(r.fecha)} · Total ${pesos(r.total)}\n${items.join('\n') || '  - ' + r.piezas}`;
  }).join('\n\n');
  (navigator.clipboard ? navigator.clipboard.writeText(texto) : Promise.reject()).then(() => aviso('Copiado: pégalo como referencia al capturar en CONTPAQi'), () => {
    dialogo('Datos para CONTPAQi', `<textarea class="m-op-copiar" readonly>${escapar(texto)}</textarea>`, []);
  });
}

// Lee un CFDI 4.0/3.3 (el XML que genera CONTPAQi al timbrar)
function leerCFDI(texto, nombre) {
  const x = new DOMParser().parseFromString(texto, 'application/xml');
  if (x.getElementsByTagName('parsererror').length) throw new Error(nombre + ': no es un XML válido');
  const uno = n => x.getElementsByTagNameNS('*', n)[0];
  const comp = uno('Comprobante');
  const tfd = uno('TimbreFiscalDigital');
  if (!comp) throw new Error(nombre + ': no es un CFDI (no trae Comprobante)');
  if (!tfd || !tfd.getAttribute('UUID')) throw new Error(nombre + ': no está timbrado (no trae UUID)');
  const tipo = comp.getAttribute('TipoDeComprobante') || 'I';
  if (tipo !== 'I') throw new Error(nombre + ': es tipo ' + tipo + ' (solo se suben facturas de ingreso, tipo I)');
  const a = (el, k) => (el && el.getAttribute(k)) || '';
  const receptor = uno('Receptor');
  const emisor = uno('Emisor');
  const conceptos = [...x.getElementsByTagNameNS('*', 'Concepto')].map(c => ({
    descripcion: a(c, 'Descripcion'), cantidad: Number(a(c, 'Cantidad')) || 0, importe: Number(a(c, 'Importe')) || 0, clave: a(c, 'NoIdentificacion')
  }));
  const impuestos = [...comp.children].find(c => c.localName === 'Impuestos');
  const serie = a(comp, 'Serie');
  const folio = a(comp, 'Folio');
  return {
    uuid: a(tfd, 'UUID').toUpperCase(), serie, folio, serieFolio: (serie ? serie + '-' : 'F-') + (folio || a(tfd, 'UUID').slice(0, 8)),
    fecha: new Date(a(comp, 'Fecha')).getTime() || Date.now(), fechaTimbrado: a(tfd, 'FechaTimbrado'),
    subtotal: Number(a(comp, 'SubTotal')) || 0, descuento: Number(a(comp, 'Descuento')) || 0,
    iva: Number(a(impuestos, 'TotalImpuestosTrasladados')) || 0, total: Number(a(comp, 'Total')) || 0,
    moneda: a(comp, 'Moneda') || 'MXN', metodoPago: a(comp, 'MetodoPago'), formaPago: a(comp, 'FormaPago'),
    receptorRfc: a(receptor, 'Rfc'), receptorNombre: a(receptor, 'Nombre'), emisorRfc: a(emisor, 'Rfc'),
    conceptos, xmlNombre: nombre
  };
}

async function subirXML(archivos) {
  for (const archivo of archivos) {
    try {
      const texto = await archivo.text();
      const cfdi = leerCFDI(texto, archivo.name);
      cfdi.textoCompleto = texto; // solo para buscar siniestros; no se guarda
      if (facturas.some(f => f.uuid === cfdi.uuid && f.estatus !== 'cancelada')) { aviso(cfdi.serieFolio + ' ya estaba subida', 'warning'); continue; }
      await confirmarFactura(cfdi);
    } catch (e) {
      aviso(e.message, 'error');
    }
  }
}

// Factura nueva: el algoritmo (diseno/emparejar.js, sin IA) propone qué notas cubre por siniestro, pieza, importe y cliente
const RAZON_ICONO = { siniestro: 'clipboard-check', pieza: 'package', importe: 'wallet', cliente: 'users', suma: 'receipt', fecha: 'clock' };
function confirmarFactura(cfdi) {
  return new Promise(listo => {
    const cliente = clientePorNombreORfc(cfdi.receptorNombre, cfdi.receptorRfc);
    const nombreCli = cliente ? (cliente.razonSocial || cliente.nombre) : cfdi.receptorNombre;
    const pend = registros().filter(facturable);
    const porClave = new Map(pend.map(r => [r.col + ':' + r.id, r]));
    const esDelCliente = n => { const r = porClave.get(n.clave); return !!r && (norm(r.cliente) === norm(nombreCli) || (cliente && clientePorNombreORfc(r.cliente) === cliente)); };
    const res = emparejar(cfdi, pend.map(r => ({ clave: r.col + ':' + r.id, folio: r.folio, cliente: r.cliente, fecha: r.fecha, total: r.total, siniestro: r.siniestro, piezas: r.piezas, items: r.raw.items })), esDelCliente);
    // Lo que se marcó en la bandeja antes de subir el XML también cuenta
    const elegidas = new Map(res.elegidas.map(e => [e.clave, e]));
    pend.forEach(r => { const k = r.col + ':' + r.id; if (seleccion.has(k) && !elegidas.has(k)) elegidas.set(k, { clave: k, razones: [{ tipo: 'cliente', texto: 'La marcaste en la bandeja' }] }); });
    const marcadas = new Set(elegidas.keys());
    const extras = new Map(); // notas que la persona agrega a mano desde el buscador
    const plazo = diasCredito(cliente);
    const pue = cfdi.metodoPago === 'PUE';

    const fila = (r, info, marcada) => `
      <label class="m-op-check m-cf-fila${marcada ? ' marcada' : ''}"><input type="checkbox" value="${r.col}:${escapar(r.id)}"${marcada ? ' checked' : ''}>
        <span class="m-op-folio">${escapar(r.folio)}</span>
        <span class="m-op-info"><strong>${escapar(r.piezas || '—')}</strong><small>${escapar(r.cliente)} · ${fechaCorta(r.fecha)}${r.siniestro ? ' · Sin. ' + escapar(r.siniestro) : ''}</small>
          ${info && info.razones && info.razones.length ? `<span class="m-cf-razones">${info.razones.filter(x => x.tipo !== 'fecha' || !marcada).map(x => `<i class="r-${x.tipo}">${icono(RAZON_ICONO[x.tipo] || 'check', 12)}${escapar(x.texto)}</i>`).join('')}</span>` : ''}</span>
        <span class="m-op-monto">${pesos(r.total)}</span></label>`;
    const pintarListas = () => {
      const enc = [...elegidas.values()].map(e => porClave.get(e.clave)).filter(Boolean);
      const man = [...extras.values()].filter(r => !elegidas.has(r.col + ':' + r.id));
      $('#cf-encontradas').innerHTML = enc.length || man.length
        ? enc.map(r => fila(r, elegidas.get(r.col + ':' + r.id), marcadas.has(r.col + ':' + r.id))).join('') + man.map(r => fila(r, { razones: [{ tipo: 'cliente', texto: 'Agregada a mano' }] }, marcadas.has(r.col + ':' + r.id))).join('')
        : `<p class="m-op-nota">No encontré notas con el mismo siniestro, pieza o importe. Búscala abajo por folio, siniestro o pieza.</p>`;
      const otras = res.otras.map(e => porClave.get(e.clave)).filter(r => r && !extras.has(r.col + ':' + r.id));
      $('#cf-otras').hidden = !otras.length;
      $('#cf-otras-lista').innerHTML = otras.map(r => fila(r, res.otras.find(e => e.clave === r.col + ':' + r.id), marcadas.has(r.col + ':' + r.id))).join('');
      $('#cf-otras-n').textContent = otras.length;
      suma();
    };
    dialogo('Factura ' + cfdi.serieFolio, `
      <div class="m-op-cfdi">
        <div><small>Cliente</small><strong>${escapar(cfdi.receptorNombre)}</strong><small>${escapar(cfdi.receptorRfc)}${cliente ? ', en el gestor como ' + escapar(nombreCli) : ', no está en Clientes'}</small></div>
        <div><small>Fecha</small><strong>${fechaCorta(cfdi.fecha)}</strong><small>${escapar(cfdi.metodoPago || '—')}, forma ${escapar(cfdi.formaPago || '—')}</small></div>
        <div><small>Total</small><strong>${pesos(cfdi.total)}</strong><small>Subtotal ${pesos(cfdi.subtotal)} + IVA ${pesos(cfdi.iva)}</small></div>
      </div>
      <details class="m-op-conceptos"><summary>${cfdi.conceptos.length} ${cfdi.conceptos.length === 1 ? 'concepto' : 'conceptos'} en la factura</summary>${cfdi.conceptos.map(c => `<div>${escapar(c.descripcion)} <b>${pesos(c.importe)}</b></div>`).join('')}</details>
      <h4 class="m-cf-titulo">${res.elegidas.length ? 'Notas que cubre esta factura' : 'Notas de esta factura'}</h4>
      <div class="m-op-ligar m-cf-lista" id="cf-encontradas"></div>
      <details class="m-cf-otras" id="cf-otras"><summary>Otras posibles (<span id="cf-otras-n">0</span>)</summary><div class="m-op-ligar m-cf-lista" id="cf-otras-lista"></div></details>
      <div class="m-cf-buscar">
        <input type="search" id="cf-buscar" placeholder="Agregar otra nota: busca por folio, siniestro o pieza" autocomplete="off">
        <div id="cf-resultados" class="m-cf-lista"></div>
      </div>
      <p class="m-op-suma" id="cf-suma"></p>
      <div class="m-op-mover">
        <label><input type="checkbox" id="cf-pagada"${pue ? ' checked' : ''}> Ya está pagada (${pue ? 'la factura es PUE' : 'márcalo si ya la pagaron'})</label>
        <label>Días de crédito <input type="number" id="cf-dias" min="0" max="365" value="${plazo}" style="width:80px"></label>
      </div>`,
    [{ texto: 'Guardar factura', principal: true, accion: async () => {
      const lista = pend.filter(r => marcadas.has(r.col + ':' + r.id));
      const dias = Math.max(0, Number($('#cf-dias').value) || 0);
      const pagada = $('#cf-pagada').checked;
      const { textoCompleto, ...datosCfdi } = cfdi;
      const factura = Object.assign({}, datosCfdi, {
        clienteId: cliente ? cliente.id : '', clienteNombre: nombreCli,
        notas: lista.map(r => ({ tipo: r.tipo, col: r.col, id: r.id, folio: r.folio, total: r.total })),
        diasCredito: dias, vencimiento: inicioDia(cfdi.fecha) + dias * DIA,
        pagos: pagada ? [{ monto: cfdi.total, fecha: cfdi.fecha, forma: cfdi.formaPago || 'PUE', por: yo(), nota: 'Pagada al facturar' }] : [],
        saldo: pagada ? 0 : cfdi.total, estatus: pagada ? 'pagada' : 'por_cobrar',
        subidaPor: yo(), createdAt: window.serverTimestamp()
      });
      const ref = await window.addDoc(window.collection(window.db, 'facturas'), factura);
      await Promise.all(lista.map(r => window.updateDoc(window.doc(window.db, r.col, r.id), {
        facturaId: ref.id, facturaFolio: cfdi.serieFolio, facturaUUID: cfdi.uuid,
        seguimiento: (r.raw.seguimiento || []).concat({ etapa: 'facturada', fecha: Date.now(), por: yo(), nota: cfdi.serieFolio })
      })));
      if (cliente && dias !== plazo) await window.updateDoc(window.doc(window.db, 'clientes', cliente.id), { diasCredito: dias });
      lista.forEach(r => seleccion.delete(r.col + ':' + r.id));
      aviso(cfdi.serieFolio + ' guardada' + (lista.length ? ' y ligada a ' + lista.length + (lista.length === 1 ? ' nota' : ' notas') : ''));
      pestanaFac = 'facturas';
      pintarActivo();
      return true;
    } }], listo);
    const suma = () => {
      const t = pend.filter(r => marcadas.has(r.col + ':' + r.id)).reduce((s, r) => s + r.total, 0);
      const n = pend.filter(r => marcadas.has(r.col + ':' + r.id)).length;
      const cuadra = [cfdi.total, cfdi.subtotal].some(x => Math.abs(x - t) < 1);
      $('#cf-suma').innerHTML = `<b>${n} ${n === 1 ? 'nota' : 'notas'}</b> por <b>${pesos(t)}</b> de ${pesos(cfdi.total)}. ` +
        (cuadra ? '<span class="m-op-ok">Cuadra con la factura</span>' : `<span class="m-op-dif">Faltan ${pesos(cfdi.total - t)} para el total</span>`);
    };
    const caja = $('.m-op-caja:last-of-type') || document;
    caja.addEventListener('change', e => {
      const c = e.target.closest('.m-cf-lista input[type=checkbox]');
      if (!c) return;
      c.checked ? marcadas.add(c.value) : marcadas.delete(c.value);
      c.closest('.m-cf-fila').classList.toggle('marcada', c.checked);
      suma();
    });
    $('#cf-buscar').addEventListener('input', e => {
      const q = norm(e.target.value);
      const box = $('#cf-resultados');
      if (q.length < 2) { box.innerHTML = ''; return; }
      const hall = pend.filter(r => !marcadas.has(r.col + ':' + r.id) && norm([r.folio, r.cliente, r.siniestro, r.piezas].join(' ')).includes(q)).slice(0, 6);
      box.innerHTML = hall.length ? hall.map(r => `<button type="button" class="m-cf-agregar" data-agregar="${r.col}:${escapar(r.id)}">${icono('check', 14)}<span><b>${escapar(r.folio)}</b> ${escapar(r.piezas || '—')}<small>${escapar(r.cliente)} · ${pesos(r.total)}</small></span></button>`).join('') : '<p class="m-op-nota">Sin resultados.</p>';
    });
    $('#cf-resultados').addEventListener('click', e => {
      const b = e.target.closest('[data-agregar]');
      if (!b) return;
      const r = porClave.get(b.dataset.agregar);
      if (!r) return;
      extras.set(b.dataset.agregar, r);
      marcadas.add(b.dataset.agregar);
      $('#cf-buscar').value = ''; $('#cf-resultados').innerHTML = '';
      pintarListas();
    });
    pintarListas();
  });
}

function cancelarFactura(id) {
  const f = facturas.find(x => x.id === id);
  if (!f) return;
  dialogo('Cancelar ' + f.serieFolio, `<p>Márcala como cancelada solo si ya la cancelaste en CONTPAQi. Sus notas vuelven a “pendientes de facturar” y sale de Cobranza.</p>`,
    [{ texto: 'Sí, marcar cancelada', principal: true, accion: async () => {
      await window.updateDoc(window.doc(window.db, 'facturas', id), { estatus: 'cancelada', saldo: 0, canceladaPor: yo(), canceladaEn: Date.now() });
      const todos = registros();
      await Promise.all((f.notas || []).map(n => {
        const r = todos.find(x => x.col === n.col && x.id === n.id);
        if (!r || r.raw.facturaId !== id) return null;
        return window.updateDoc(window.doc(window.db, n.col, n.id), { facturaId: null, facturaFolio: null, facturaUUID: null });
      }));
      aviso(f.serieFolio + ' cancelada en el gestor');
      return true;
    } }]);
}

// ═══════════════════════ COBRANZA ═══════════════════════
function porCobrar() { return facturas.filter(f => f.estatus === 'por_cobrar' && Number(f.saldo) > 0.009); }
function pintarCobranza() {
  const mod = $('#mod-cobranza');
  if (!mod) return;
  if (!mod.dataset.listo) {
    mod.dataset.listo = '1';
    mod.innerHTML = `<div class="m-op"><div class="m-op-resumen" id="cob-resumen"></div><div id="cob-cuerpo"></div></div>`;
    $('#cob-cuerpo', mod).addEventListener('click', e => {
      const p = e.target.closest('[data-pagar]');
      if (p) return registrarPago(p.dataset.pagar);
      const d = e.target.closest('[data-dias]');
      if (d) return cambiarDias(d.dataset.dias);
    });
  }
  const lista = porCobrar();
  const h = hoy0();
  const vencidas = lista.filter(f => inicioDia(f.vencimiento) < h);
  const semana = lista.filter(f => inicioDia(f.vencimiento) >= h && inicioDia(f.vencimiento) < h + 7 * DIA);
  const total = lista.reduce((s, f) => s + Number(f.saldo), 0);
  $('#cob-resumen', mod).innerHTML = `
    <div class="m-op-kpi m-vidrio">${icono('wallet', 18)}<span>Por cobrar</span><strong>${pesos(total)}</strong></div>
    <div class="m-op-kpi m-vidrio alerta">${icono('circle-alert', 18)}<span>Vencido</span><strong>${pesos(vencidas.reduce((s, f) => s + Number(f.saldo), 0))}</strong><small>${vencidas.length} facturas</small></div>
    <div class="m-op-kpi m-vidrio">${icono('clock', 18)}<span>Vence esta semana</span><strong>${pesos(semana.reduce((s, f) => s + Number(f.saldo), 0))}</strong><small>${semana.length} facturas</small></div>`;
  const grupos = {};
  lista.forEach(f => { (grupos[f.clienteNombre || f.receptorNombre] = grupos[f.clienteNombre || f.receptorNombre] || []).push(f); });
  $('#cob-cuerpo', mod).innerHTML = Object.keys(grupos).length ? Object.entries(grupos)
    .sort((a, b) => b[1].reduce((s, f) => s + Number(f.saldo), 0) - a[1].reduce((s, f) => s + Number(f.saldo), 0))
    .map(([cli, fs]) => {
      const c = clientePorNombreORfc(cli, fs[0].receptorRfc);
      return `<section class="m-op-grupo m-vidrio">
        <header><strong>${escapar(cli)}</strong><span>${pesos(fs.reduce((s, f) => s + Number(f.saldo), 0))}</span>
          ${c && rol() === 'admin' ? `<button type="button" class="m-op-link" data-dias="${escapar(c.id)}">${c.diasCredito != null ? escapar(c.diasCredito) + ' días de crédito' : 'Poner días de crédito'}</button>` : ''}</header>
        ${fs.sort((a, b) => a.vencimiento - b.vencimiento).map(f => {
          const dias = Math.round((inicioDia(f.vencimiento) - h) / DIA);
          const estado = dias < 0 ? `<span class="m-op-etapa e-vencida">Vencida hace ${-dias} d</span>` : dias === 0 ? '<span class="m-op-etapa e-hoy">Vence hoy</span>' : `<span class="m-op-etapa e-facturada">Vence en ${dias} d</span>`;
          return `<div class="m-op-check estatica">
            <span class="m-op-folio">${escapar(f.serieFolio)}</span>
            <span class="m-op-info"><strong>Saldo ${pesos(f.saldo)} de ${pesos(f.total)}</strong><small>${fechaCorta(ms(f.fecha))} · vence ${fechaCorta(f.vencimiento)}${(f.pagos || []).length ? ' · ' + f.pagos.length + ' pago(s)' : ''}</small></span>
            ${estado}
            <button type="button" class="btn btn-secondary btn-sm" data-pagar="${escapar(f.id)}">${icono('wallet', 14)}<span>Registrar pago</span></button>
          </div>`;
        }).join('')}
      </section>`;
    }).join('') : `<div class="m-op-vacio">${icono('wallet', 28)}<p>No hay facturas por cobrar. Las facturas que subas en Facturación aparecen aquí con su vencimiento.</p></div>`;
}

function registrarPago(id) {
  const f = facturas.find(x => x.id === id);
  if (!f) return;
  dialogo('Pago de ' + f.serieFolio, `
    <p class="m-op-sub">${escapar(f.clienteNombre)} · saldo ${pesos(f.saldo)}</p>
    <div class="m-op-form">
      <label>Monto<input type="number" id="pg-monto" min="0.01" step="0.01" value="${Number(f.saldo).toFixed(2)}"></label>
      <label>Fecha<input type="date" id="pg-fecha" value="${fechaISO(Date.now())}"></label>
      <label>Forma<select id="pg-forma"><option>Transferencia</option><option>Efectivo</option><option>Cheque</option><option>Tarjeta</option></select></label>
      <label>Referencia<input type="text" id="pg-nota" placeholder="Opcional"></label>
    </div>
    <p class="m-op-nota">Si el cliente paga una factura PPD, recuerda emitir el complemento de pago en CONTPAQi.</p>`,
  [{ texto: 'Guardar pago', principal: true, accion: async () => {
    const monto = Math.round((Number($('#pg-monto').value) || 0) * 100) / 100;
    if (!(monto > 0)) { aviso('Escribe el monto', 'error'); return false; }
    if (monto - Number(f.saldo) > 0.009) { aviso('El pago es mayor que el saldo (' + pesos(f.saldo) + ')', 'error'); return false; }
    const [a, m, d] = $('#pg-fecha').value.split('-').map(Number);
    const pago = { monto, fecha: new Date(a, m - 1, d, 12).getTime(), forma: $('#pg-forma').value, por: yo() };
    const nota = $('#pg-nota').value.trim();
    if (nota) pago.nota = nota;
    const saldo = Math.round((Number(f.saldo) - monto) * 100) / 100;
    await window.updateDoc(window.doc(window.db, 'facturas', id), { pagos: (f.pagos || []).concat(pago), saldo, estatus: saldo <= 0.009 ? 'pagada' : 'por_cobrar' });
    aviso(saldo <= 0.009 ? f.serieFolio + ' quedó pagada' : 'Pago guardado; saldo ' + pesos(saldo));
    return true;
  } }]);
}

function cambiarDias(clienteId) {
  const c = (D().clientes || []).find(x => x.id === clienteId);
  if (!c) return;
  dialogo('Crédito de ' + (c.razonSocial || c.nombre), `<div class="m-op-form"><label>Días de crédito<input type="number" id="dc-dias" min="0" max="365" value="${diasCredito(c)}"></label></div>
    <p class="m-op-nota">Se usa para calcular el vencimiento de las facturas nuevas de este cliente. 0 = contado.</p>`,
  [{ texto: 'Guardar', principal: true, accion: async () => {
    await window.updateDoc(window.doc(window.db, 'clientes', clienteId), { diasCredito: Math.max(0, Number($('#dc-dias').value) || 0) });
    aviso('Plazo guardado');
    return true;
  } }]);
}

// ═══════════════════════ OFICINA VIRTUAL ═══════════════════════
let pendientesBuzon = 0;
let quitarBuzon = null;
function escucharBuzon() {
  if (quitarBuzon || !window.onSnapshot || !window.db) return;
  quitarBuzon = window.onSnapshot(window.query(window.collection(window.db, 'buzon_pepito'), window.where('estado', '==', 'pendiente')), s => {
    pendientesBuzon = s.size;
    pintarActivo();
  }, () => {});
}

const AREAS = [
  { id: 'pepito', nombre: 'Pepito Junior', rolTxt: 'Agente principal', color: 'faro', ir: 'pepito' },
  { id: 'entregas', nombre: 'Entregas', rolTxt: 'Seguimiento de piezas', color: 'ambar', ir: 'seguimiento' },
  { id: 'facturacion', nombre: 'Facturación', rolTxt: 'CONTPAQi y notas', color: 'azul', ir: 'facturacion' },
  { id: 'cobranza', nombre: 'Cobranza', rolTxt: 'Saldos y vencimientos', color: 'verde', ir: 'cobranza' },
  { id: 'reportes', nombre: 'Reportes', rolTxt: 'Panel de dirección', color: 'morado', ir: 'reportes' }
];

function estadoAreas() {
  const regs = registros();
  const h = hoy0();
  const pc = porCobrar();
  const venc = pc.filter(f => inicioDia(f.vencimiento) < h);
  const hoyRegs = regs.filter(r => r.fecha >= h);
  const enCamino = regs.filter(r => ['preparacion', 'transito'].includes(etapa(r)));
  const porFacturar = regs.filter(r => facturable(r) && r.total > 0 && etapa(r) === 'entregada');
  return {
    pepito: { n: pendientesBuzon, txt: pendientesBuzon ? pendientesBuzon + (pendientesBuzon === 1 ? ' pedido en el buzón' : ' pedidos en el buzón') : 'Buzón al día', alerta: pendientesBuzon > 0 },
    entregas: { n: enCamino.length, txt: enCamino.length ? enCamino.length + ' piezas en preparación o en camino' : 'Sin piezas en camino', alerta: enCamino.length > 0 },
    facturacion: { n: porFacturar.length, txt: porFacturar.length ? porFacturar.length + ' entregadas por facturar · ' + pesos(porFacturar.reduce((s, r) => s + r.total, 0)) : 'Nada pendiente de facturar', alerta: porFacturar.length > 0 },
    cobranza: { n: venc.length, txt: venc.length ? venc.length + ' vencidas · ' + pesos(venc.reduce((s, f) => s + Number(f.saldo), 0)) : pc.length ? pesos(pc.reduce((s, f) => s + Number(f.saldo), 0)) + ' por cobrar, nada vencido' : 'Sin saldos por cobrar', alerta: venc.length > 0, rojo: venc.length > 0 },
    reportes: { n: hoyRegs.length, txt: hoyRegs.length + (hoyRegs.length === 1 ? ' nota hoy · ' : ' notas hoy · ') + pesos(hoyRegs.reduce((s, r) => s + r.total, 0)), alerta: false }
  };
}

// La escena 3D es la misma de la "Oficina 3D" del artifact (diseno/oficina3d.js). Solo se carga al abrir este
// módulo (three.js pesa ~600 KB) y se detiene al salir para no gastar batería.
const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
const AGENTE_DE_AREA = { pepito: ['direccion', 'pepito-junior'], entregas: ['entregas', 'preparacion'], facturacion: ['facturacion', 'cfdi'], cobranza: ['cobranza', 'alertas'], reportes: ['reportes', 'ventas'] };
const MODULO_DE_ZONA = { direccion: 'pepito', entregas: 'seguimiento', facturacion: 'facturacion', cobranza: 'cobranza', reportes: 'reportes' };
const AREA_DE_ZONA = { direccion: 'pepito', entregas: 'entregas', facturacion: 'facturacion', cobranza: 'cobranza', reportes: 'reportes' };
const QUE_HACE = {
  direccion: 'Recibe los pedidos del equipo por el gestor y WhatsApp, y los reparte a cada área.',
  entregas: 'Preparación, salidas, taller y evidencias: que cada pieza llegue a su cliente.',
  facturacion: 'Notas por facturar, XML de CONTPAQi y notas de venta.',
  cobranza: 'Plazos de crédito, saldos, pagos parciales y facturas vencidas.',
  reportes: 'Ventas del día y de la semana, rankings y consultas del gestor.'
};
const TRABAJANDO = ['junta', 'volver', 'yendo', 'trabaja'];
let motor3d = null, sim3d = null, vista3d = null, cargando3d = null, quitarActividad = null;
const previos = {};
let actividad = [];
let ultimoEvento = 0;
let actividadCargada = false;

function cargarThree() {
  if (window.THREE) return Promise.resolve();
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = THREE_URL; s.async = true; s.onload = ok;
    s.onerror = () => mal(new Error('No se pudo cargar three.js'));
    document.head.appendChild(s);
  });
}
const puedeAbrir = id => { const p = window.__permisosMaya || {}; return !p[id] || p[id].includes(rol()); };
const horaCDMX = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false })) % 24;

async function abrir3D() {
  const caja = $('#of-3d');
  if (!caja || vista3d) return;
  try {
    if (!cargando3d) cargando3d = cargarThree().then(() => import('./oficina3d.js'));
    motor3d = await cargando3d;
  } catch (e) {
    cargando3d = null;
    caja.innerHTML = '<p class="m-of3d-error">No se pudo cargar la oficina 3D. Revisa tu conexión; las áreas de abajo siguen funcionando.</p>';
    return;
  }
  if (vista3d || !$('#mod-oficina').classList.contains('active')) return;
  sim3d = sim3d || motor3d.nuevaSim();
  vista3d = motor3d.montarOficina3D(caja, sim3d, id => mostrarAgente(id));
  window.__oficina3d = { sim: sim3d, mostrarAgente }; // para revisar desde la consola
  sincronizar3D(estadoAreas(), true);
  escucharActividad();
  // En el teléfono la escena es más ancha que la pantalla (como en el artifact): se centra y se desliza de lado
  const marco = $('#of-marco');
  if (marco && marco.scrollWidth > marco.clientWidth) marco.scrollLeft = (marco.scrollWidth - marco.clientWidth) / 2;
  clearInterval(abrir3D.reloj);
  abrir3D.reloj = setInterval(pintarEstado3D, 700);
  pintarEstado3D();
}

// Letrero de la escena + qué áreas están trabajando ahora (se prende su tarjeta de abajo)
function pintarEstado3D() {
  const el = $('#of-estado');
  if (!el || !sim3d) return;
  const h = horaCDMX();
  const saludo = h >= 5 && h < 12 ? 'Buenos días' : h >= 12 && h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const ocupados = sim3d.agentes.filter(a => TRABAJANDO.includes(a.fase));
  const piden = sim3d.piden ? sim3d.piden.size : 0;
  const nombres = [...new Set(ocupados.map(a => a.id))].slice(0, 3).join(', ');
  el.innerHTML = `<strong>${saludo}</strong><span>${ocupados.length ? '<i class="m-of3d-vivo"></i>' + escapar(nombres) + (ocupados.length > 3 ? ' y ' + (ocupados.length - 3) + ' más' : '') + ' trabajando' : 'Todos en su lugar'}${piden ? ', ' + piden + (piden === 1 ? ' te necesita' : ' te necesitan') : ''}</span>`;
  const activas = new Set(ocupados.map(a => AREA_DE_ZONA[a.area]).filter(Boolean));
  $$('#of-piso [data-area]').forEach(b => b.classList.toggle('en-curso', activas.has(b.dataset.area)));
}

function cerrar3D() {
  clearInterval(abrir3D.reloj);
  if (quitarActividad) { quitarActividad(); quitarActividad = null; actividadCargada = false; }
  if (vista3d) { vista3d.detener(); vista3d = null; }
}

function agregarActividad(ev) {
  actividad = [ev].concat(actividad).slice(0, 6);
  pintarActividad();
}
function pintarActividad() {
  const lista = $('#of-actividad');
  if (!lista) return;
  lista.innerHTML = actividad.length ? actividad.map(ev => `
    <li class="c-${escapar(ev.color || 'faro')}">
      <time>${new Date(ev.ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' })}</time>
      <span>${ev.html}</span>
    </li>`).join('') : '<li class="vacio"><span>Cuando alguien le pida algo a Pepito, aquí verás qué área lo atendió.</span></li>';
}

// Lo que Pepito hace de verdad (gestor o WhatsApp) mueve al agente del área que trabajó
const ACCION = { 'consultó': 'consultó', 'propuso': 'preparó', 'guardó': 'guardó' };
function escucharActividad() {
  if (quitarActividad || !window.onSnapshot) return;
  quitarActividad = window.onSnapshot(window.doc(window.db, 'config', 'pepito_actividad'), s => {
    const eventos = (s.exists() && s.data().eventos) || [];
    const nuevos = eventos.filter(e => e.ts > ultimoEvento).sort((a, b) => a.ts - b.ts);
    const primera = !actividadCargada;
    actividadCargada = true;
    if (eventos.length) ultimoEvento = Math.max(ultimoEvento, ...eventos.map(e => e.ts));
    (primera ? nuevos.slice(-4) : nuevos).forEach(e => {
      const area = AREAS.find(a => a.id === AREA_DE_ZONA[e.area]) || AREAS[0];
      if (!primera && sim3d && motor3d) motor3d.despachar(sim3d, e.area, e.titulo);
      agregarActividad({ ts: e.ts, color: area.color, html: `<strong>${escapar(area.nombre)}</strong> ${escapar(ACCION[e.accion] || e.accion)} ${escapar(String(e.titulo || '').toLowerCase())} para ${escapar(e.quien)}${e.canal === 'whatsapp' ? ' <em>por WhatsApp</em>' : ''}` });
    });
  }, () => {});
}

// Lo pendiente de cada área prende "Te necesita" en su agente; cuando llega trabajo nuevo, el área se junta y lo atiende
function sincronizar3D(est, inicio) {
  if (!sim3d || !motor3d) return;
  sim3d.piden = new Set();
  AREAS.forEach(a => {
    const e = est[a.id];
    const [area, agente] = AGENTE_DE_AREA[a.id];
    if (e.alerta) sim3d.piden.add(agente);
    if (e.n > 0 && (inicio ? previos[a.id] == null : e.n > (previos[a.id] || 0))) {
      motor3d.despachar(sim3d, area, e.txt);
      if (!inicio) agregarActividad({ ts: Date.now(), color: a.color, html: `<strong>${escapar(a.nombre)}</strong> tiene trabajo nuevo: ${escapar(e.txt)}` });
    }
    previos[a.id] = e.n;
  });
}

// Tarjeta del agente que tocaste: qué hace, en qué está y su área
function mostrarAgente(id) {
  const tarjeta = $('#of-agente');
  if (!tarjeta) return;
  const ag = id && sim3d && sim3d.agentes.find(a => a.id === id);
  if (!ag || ag.libre) { tarjeta.hidden = true; return; }
  const areaId = AREA_DE_ZONA[ag.area];
  const area = AREAS.find(a => a.id === areaId);
  const est = estadoAreas()[areaId] || { txt: '' };
  const ir = MODULO_DE_ZONA[ag.area];
  const ocupado = TRABAJANDO.includes(ag.fase);
  tarjeta.className = 'm-of3d-agente m-vidrio c-' + (area ? area.color : 'faro');
  tarjeta.innerHTML = `
    <button type="button" class="m-op-x" data-cerrar-agente aria-label="Cerrar">${icono('x', 14)}</button>
    <strong>${escapar(ag.id)}</strong>
    <small>${escapar(area ? area.nombre : '')}</small>
    <p>${escapar(QUE_HACE[ag.area] || '')}</p>
    <p class="m-of3d-agente-estado${ocupado ? ' vivo' : ''}">${ocupado ? '<i class="m-of3d-vivo"></i>' + escapar(ag.tarea || 'Trabajando') : escapar(est.txt || 'Sin pendientes')}</p>
    ${ir && puedeAbrir(ir) ? `<button type="button" class="btn btn-primary btn-sm" data-ir-agente="${ir}">Abrir ${escapar(area ? area.nombre.replace('Pepito Junior', 'Pepito') : '')}</button>` : ''}`;
  tarjeta.hidden = false;
}

function pintarOficina() {
  const mod = $('#mod-oficina');
  if (!mod) return;
  if (!mod.dataset.listo) {
    mod.dataset.listo = '1';
    mod.innerHTML = `<div class="m-of">
      <section class="m-of3d m-vidrio">
        <div class="m-of3d-marco" id="of-marco">
          <div class="m-of3d-escena" id="of-3d"><p class="m-of3d-error">Cargando la oficina…</p></div>
        </div>
        <div class="m-of3d-estado" id="of-estado" aria-live="polite"></div>
        <div class="m-of3d-giro" role="group" aria-label="Girar la oficina">
          <button type="button" data-giro="-1" aria-label="Girar a la izquierda">${icono('rotate-ccw', 18)}</button>
          <button type="button" data-giro="0" aria-label="Vista inicial">${icono('locate', 18)}</button>
          <button type="button" data-giro="1" aria-label="Girar a la derecha">${icono('rotate-cw', 18)}</button>
        </div>
        <div class="m-of3d-agente" id="of-agente" hidden></div>
        <p class="m-of3d-ayuda">Toca a un agente para ver en qué está. Gira la oficina con los botones o, en PC, arrastrándola.</p>
      </section>
      <div class="m-of-areas" id="of-piso"></div>
      <section class="m-of-actividad m-vidrio">
        <h3>Actividad</h3>
        <ol id="of-actividad"></ol>
      </section></div>`;
    $('#of-piso', mod).addEventListener('click', e => {
      const b = e.target.closest('[data-ir]');
      if (b) setTimeout(() => window.showModule(b.dataset.ir), 0);
    });
    // Mantener presionado sigue girando; un toque gira 45°
    let reloj = null;
    const parar = () => { clearInterval(reloj); reloj = null; };
    $('.m-of3d-giro', mod).addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-giro]');
      if (!b || !vista3d) return;
      const dir = Number(b.dataset.giro);
      if (!dir) { vista3d.centrar(); return; }
      vista3d.girar(dir * Math.PI / 4);
      parar();
      reloj = setTimeout(() => { reloj = setInterval(() => vista3d && vista3d.girar(dir * 0.09), 60); }, 380);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('.m-of3d-giro', mod).addEventListener(ev, parar));
    $('.m-of3d-giro', mod).addEventListener('keydown', e => {
      const b = e.target.closest('[data-giro]');
      if (!b || !vista3d || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      const dir = Number(b.dataset.giro);
      if (dir) vista3d.girar(dir * Math.PI / 4); else vista3d.centrar();
    });
    $('#of-agente', mod).addEventListener('click', e => {
      if (e.target.closest('[data-cerrar-agente]')) { $('#of-agente').hidden = true; return; }
      const b = e.target.closest('[data-ir-agente]');
      if (b) setTimeout(() => window.showModule(b.dataset.irAgente), 0);
    });
    pintarActividad();
  }
  const est = estadoAreas();
  $('#of-piso', mod).innerHTML = AREAS.filter(a => puedeAbrir(a.ir)).map((a, i) => {
    const e = est[a.id];
    return `<button type="button" class="m-of-area c-${a.color}${e.alerta ? ' trabajando' : ''}${e.rojo ? ' urgente' : ''}" data-ir="${a.ir}" data-area="${a.id}" style="--i:${i}">
      <span class="m-of-area-num">${e.n}</span>
      <span class="m-of-placa"><strong>${escapar(a.nombre)}</strong><small>${escapar(a.rolTxt)}</small><em>${escapar(e.txt)}</em></span>
      <span class="m-of-area-curso" aria-hidden="true"></span>
    </button>`;
  }).join('');
  if (vista3d) sincronizar3D(est, false); else abrir3D();
  pintarEstado3D();
}

// ═══════════════════════ Utilidades ═══════════════════════
function dialogo(titulo, html, botones, alCerrar) {
  const fondo = document.createElement('div');
  fondo.className = 'm-op-dialogo';
  fondo.innerHTML = `<div class="m-op-caja m-vidrio" role="dialog" aria-modal="true" aria-label="${escapar(titulo)}">
    <header><h3>${escapar(titulo)}</h3><button type="button" class="m-op-x" data-cerrar aria-label="Cerrar">${icono('x', 16)}</button></header>
    <div class="m-op-contenido">${html}</div>
    <footer><button type="button" class="btn btn-secondary" data-cerrar>${botones.length ? 'Cancelar' : 'Cerrar'}</button>${botones.map((b, i) => `<button type="button" class="btn ${b.principal ? 'btn-primary' : 'btn-secondary'}" data-boton="${i}">${escapar(b.texto)}</button>`).join('')}</footer>
  </div>`;
  const cerrar = () => { fondo.remove(); document.removeEventListener('keydown', tecla); alCerrar && alCerrar(); };
  const tecla = e => { if (e.key === 'Escape') cerrar(); };
  fondo.addEventListener('click', async e => {
    if (e.target === fondo || e.target.closest('[data-cerrar]')) return cerrar();
    const b = e.target.closest('[data-boton]');
    if (!b) return;
    b.disabled = true;
    try { if (await botones[Number(b.dataset.boton)].accion()) cerrar(); }
    catch (err) { aviso('No se pudo guardar: ' + err.message, 'error'); }
    finally { b.disabled = false; }
  });
  document.addEventListener('keydown', tecla);
  document.body.appendChild(fondo);
  const primero = $('input, select, textarea, .btn-primary', fondo);
  primero && primero.focus();
}

const PINTORES = { seguimiento: pintarSeguimiento, facturacion: pintarFacturacion, cobranza: pintarCobranza, oficina: pintarOficina };
function activo() { return Object.keys(PINTORES).find(id => { const m = document.getElementById('mod-' + id); return m && m.classList.contains('active'); }); }
function pintarActivo() { const id = activo(); if (id) PINTORES[id](); }

// Se vuelve a pintar cuando llegan datos nuevos de los listeners de la app (cambian los arreglos de window.data)
let firma = '';
setInterval(() => {
  const id = activo();
  if (!id) return;
  const d = D();
  const f = [d.notasEntrega, d.ventas, d.clientes].map(x => (x ? x.length : 0)).join(':');
  const refs = [d.notasEntrega, d.ventas, d.clientes];
  if (f !== firma || refs.some((r, i) => r !== pintarActivo['r' + i])) {
    firma = f;
    refs.forEach((r, i) => { pintarActivo['r' + i] = r; });
    PINTORES[id]();
  }
}, 1500);

Object.keys(PINTORES).forEach(id => {
  const m = document.getElementById('mod-' + id);
  if (!m) return;
  new MutationObserver(() => {
    if (!m.classList.contains('active')) { if (id === 'oficina') cerrar3D(); return; }
    escucharFacturas();
    if (id === 'oficina') escucharBuzon();
    PINTORES[id]();
  }).observe(m, { attributes: true, attributeFilter: ['class'] });
});

// Para pruebas y para Pepito en el futuro
window.mayaOperacion = { leerCFDI, registros, etapa, estadoAreas, AREAS };
