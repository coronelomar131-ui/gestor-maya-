// Operación de Maya: seguimiento de piezas, facturación (con el XML que timbra CONTPAQi), cobranza y la oficina virtual.
// Usa los datos que la app ya trae en tiempo real (window.data.notasEntrega / ventas / clientes), así que casi no gasta
// lecturas de Firebase. Las facturas viven en la colección "facturas" y solo se escuchan al abrir estos módulos.
import { icono } from './iconos.js';

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
    });
  }
  $$('#fac-tabs [data-tab]', mod).forEach(b => b.classList.toggle('activo', b.dataset.tab === pestanaFac));
  const cuerpo = $('#fac-cuerpo', mod);
  if (pestanaFac === 'pendientes') {
    const pend = registros().filter(facturable).filter(r => r.total > 0);
    const porCliente = {};
    pend.forEach(r => { (porCliente[r.cliente || 'Sin cliente'] = porCliente[r.cliente || 'Sin cliente'] || []).push(r); });
    const elegidas = pend.filter(r => seleccion.has(r.col + ':' + r.id));
    cuerpo.innerHTML = (elegidas.length ? `<div class="m-op-seleccion m-vidrio">${elegidas.length} seleccionadas · ${pesos(elegidas.reduce((s, r) => s + r.total, 0))}
        <button type="button" class="btn btn-secondary btn-sm" data-copiar="1">${icono('clipboard-list', 14)}<span>Copiar datos para CONTPAQi</span></button></div>` : '') +
      (Object.keys(porCliente).length ? Object.entries(porCliente).sort((a, b) => b[1].length - a[1].length).map(([cli, lista]) => `
      <section class="m-op-grupo m-vidrio">
        <header><strong>${escapar(cli)}</strong><span>${lista.length} ${lista.length === 1 ? 'nota' : 'notas'} · ${pesos(lista.reduce((s, r) => s + r.total, 0))}</span></header>
        ${lista.map(r => `<label class="m-op-check">
          <input type="checkbox" data-sel="${r.col}:${escapar(r.id)}"${seleccion.has(r.col + ':' + r.id) ? ' checked' : ''}>
          <span class="m-op-folio">${escapar(r.folio)}</span>
          <span class="m-op-info"><strong>${escapar(r.piezas || '—')}</strong><small>${fechaCorta(r.fecha)}${r.siniestro ? ' · Sin. ' + escapar(r.siniestro) : ''} · ${escapar(nombreEtapa(etapa(r)))}</small></span>
          <span class="m-op-monto">${pesos(r.total)}</span>
        </label>`).join('')}
      </section>`).join('') : `<div class="m-op-vacio">${icono('check', 28)}<p>No hay notas pendientes de facturar.</p></div>`) +
      `<p class="m-op-nota">Las notas en $0 (sin precio a propósito) no aparecen aquí. Selecciona las que vas a facturar para copiar sus datos y capturarlos en CONTPAQi.</p>`;
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
      const cfdi = leerCFDI(await archivo.text(), archivo.name);
      if (facturas.some(f => f.uuid === cfdi.uuid && f.estatus !== 'cancelada')) { aviso(cfdi.serieFolio + ' ya estaba subida', 'warning'); continue; }
      await confirmarFactura(cfdi);
    } catch (e) {
      aviso(e.message, 'error');
    }
  }
}

function confirmarFactura(cfdi) {
  return new Promise(listo => {
    const cliente = clientePorNombreORfc(cfdi.receptorNombre, cfdi.receptorRfc);
    const nombreCli = cliente ? (cliente.razonSocial || cliente.nombre) : cfdi.receptorNombre;
    const pend = registros().filter(facturable);
    const delCliente = pend.filter(r => norm(r.cliente) === norm(nombreCli) || (cliente && clientePorNombreORfc(r.cliente) === cliente));
    const textoConceptos = norm(cfdi.conceptos.map(c => c.descripcion + ' ' + c.clave).join(' '));
    // Sugerencias: las que se seleccionaron en la bandeja, las que tienen un siniestro que aparece en los conceptos, o la que cuadra con el total
    const sugeridas = new Set(delCliente.filter(r =>
      seleccion.has(r.col + ':' + r.id) ||
      String(r.siniestro).split(/[|,\s]+/).some(s => s.length >= 4 && textoConceptos.includes(norm(s)))
    ).map(r => r.col + ':' + r.id));
    if (!sugeridas.size) { const exacta = delCliente.find(r => Math.abs(r.total - cfdi.total) < 1); if (exacta) sugeridas.add(exacta.col + ':' + exacta.id); }
    const candidatas = delCliente.length ? delCliente : pend.slice(0, 40);
    const plazo = diasCredito(cliente);
    const pue = cfdi.metodoPago === 'PUE';
    dialogo('Factura ' + cfdi.serieFolio, `
      <div class="m-op-cfdi">
        <div><small>Cliente</small><strong>${escapar(cfdi.receptorNombre)}</strong><small>${escapar(cfdi.receptorRfc)}${cliente ? ' · en el gestor como ' + escapar(nombreCli) : ' · no está en Clientes'}</small></div>
        <div><small>Fecha</small><strong>${fechaCorta(cfdi.fecha)}</strong><small>${escapar(cfdi.metodoPago || '—')} · forma ${escapar(cfdi.formaPago || '—')}</small></div>
        <div><small>Total</small><strong>${pesos(cfdi.total)}</strong><small>Subtotal ${pesos(cfdi.subtotal)} · IVA ${pesos(cfdi.iva)}</small></div>
      </div>
      <details class="m-op-conceptos"><summary>${cfdi.conceptos.length} conceptos</summary>${cfdi.conceptos.map(c => `<div>${escapar(c.descripcion)} <b>${pesos(c.importe)}</b></div>`).join('')}</details>
      <p class="m-op-sub">¿Qué notas cubre esta factura?</p>
      <div class="m-op-ligar" id="cf-notas">${candidatas.length ? candidatas.map(r => `
        <label class="m-op-check"><input type="checkbox" value="${r.col}:${escapar(r.id)}"${sugeridas.has(r.col + ':' + r.id) ? ' checked' : ''}>
          <span class="m-op-folio">${escapar(r.folio)}</span><span class="m-op-info"><strong>${escapar(r.piezas || '—')}</strong><small>${escapar(r.cliente)} · ${fechaCorta(r.fecha)}${r.siniestro ? ' · Sin. ' + escapar(r.siniestro) : ''}</small></span>
          <span class="m-op-monto">${pesos(r.total)}</span></label>`).join('') : '<p class="m-op-nota">No hay notas pendientes de facturar.</p>'}</div>
      <p class="m-op-suma" id="cf-suma"></p>
      <div class="m-op-mover">
        <label><input type="checkbox" id="cf-pagada"${pue ? ' checked' : ''}> Ya está pagada (${pue ? 'la factura es PUE' : 'márcalo si ya la pagaron'})</label>
        <label>Días de crédito <input type="number" id="cf-dias" min="0" max="365" value="${plazo}" style="width:80px"></label>
      </div>`,
    [{ texto: 'Guardar factura', principal: true, accion: async () => {
      const elegidas = $$('#cf-notas input:checked').map(i => i.value);
      const lista = registros().filter(r => elegidas.includes(r.col + ':' + r.id));
      const dias = Math.max(0, Number($('#cf-dias').value) || 0);
      const pagada = $('#cf-pagada').checked;
      const factura = Object.assign({}, cfdi, {
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
      const t = registros().filter(r => $$('#cf-notas input:checked').map(i => i.value).includes(r.col + ':' + r.id)).reduce((s, r) => s + r.total, 0);
      const dif = cfdi.total - t;
      $('#cf-suma').innerHTML = `Notas seleccionadas: <b>${pesos(t)}</b> de ${pesos(cfdi.total)}` + (Math.abs(dif) >= 1 ? ` · <span class="m-op-dif">diferencia ${pesos(dif)}</span>` : ' · <span class="m-op-ok">cuadra</span>');
    };
    $('#cf-notas').addEventListener('change', suma);
    suma();
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
let motor3d = null, sim3d = null, vista3d = null, cargando3d = null;
const previos = {};

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

async function abrir3D() {
  const caja = $('#of-3d');
  if (!caja || vista3d) return;
  try {
    if (!cargando3d) cargando3d = cargarThree().then(() => import('./oficina3d.js'));
    motor3d = await cargando3d;
  } catch (e) {
    cargando3d = null;
    caja.innerHTML = '<p class="m-of3d-error">No se pudo cargar la oficina 3D (revisa tu conexión). Las áreas de abajo siguen funcionando.</p>';
    return;
  }
  if (vista3d || !$('#mod-oficina').classList.contains('active')) return;
  sim3d = sim3d || motor3d.nuevaSim();
  vista3d = motor3d.montarOficina3D(caja, sim3d, id => {
    const ag = id && sim3d.agentes.find(a => a.id === id);
    const ir = ag && MODULO_DE_ZONA[ag.area];
    if (ir && puedeAbrir(ir)) setTimeout(() => window.showModule(ir), 0);
  });
  sincronizar3D(estadoAreas(), true);
}

function cerrar3D() {
  if (vista3d) { vista3d.detener(); vista3d = null; }
}

// Lo pendiente de cada área prende "Te necesita" en su agente; cuando llega trabajo nuevo, el área se junta y lo atiende
function sincronizar3D(est, inicio) {
  if (!sim3d || !motor3d) return;
  sim3d.piden = new Set();
  AREAS.forEach(a => {
    const e = est[a.id];
    const [area, agente] = AGENTE_DE_AREA[a.id];
    if (e.alerta) sim3d.piden.add(agente);
    if (e.n > 0 && (inicio ? previos[a.id] == null : e.n > (previos[a.id] || 0))) motor3d.despachar(sim3d, area, e.txt);
    previos[a.id] = e.n;
  });
}

function pintarOficina() {
  const mod = $('#mod-oficina');
  if (!mod) return;
  if (!mod.dataset.listo) {
    mod.dataset.listo = '1';
    mod.innerHTML = `<div class="m-of">
      <section class="m-of3d m-vidrio">
        <div class="m-of3d-escena" id="of-3d"><p class="m-of3d-error">Cargando la oficina…</p></div>
        <p class="m-of3d-ayuda">Toca a un agente para abrir su área. En PC arrastra para girar la oficina. Los que dicen “Te necesita” tienen pendientes.</p>
      </section>
      <div class="m-of-areas" id="of-piso"></div></div>`;
    $('#of-piso', mod).addEventListener('click', e => {
      const b = e.target.closest('[data-ir]');
      if (b) setTimeout(() => window.showModule(b.dataset.ir), 0);
    });
  }
  const est = estadoAreas();
  $('#of-piso', mod).innerHTML = AREAS.filter(a => puedeAbrir(a.ir)).map((a, i) => {
    const e = est[a.id];
    return `<button type="button" class="m-of-area c-${a.color}${e.alerta ? ' trabajando' : ''}${e.rojo ? ' urgente' : ''}" data-ir="${a.ir}" style="--i:${i}">
      <span class="m-of-area-num">${e.n}</span>
      <span class="m-of-placa"><strong>${escapar(a.nombre)}</strong><small>${escapar(a.rolTxt)}</small><em>${escapar(e.txt)}</em></span>
    </button>`;
  }).join('');
  if (vista3d) sincronizar3D(est, false); else abrir3D();
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
window.mayaOperacion = { leerCFDI, registros, etapa };
