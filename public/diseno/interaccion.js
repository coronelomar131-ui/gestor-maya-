// Interacción: candado contra doble envío, no perder lo capturado, búsquedas que se mantienen,
// errores en español y cancelaciones con motivo. Se carga al final para envolver las funciones ya definidas.

// Las funciones que se envuelven las define el script principal: se espera a que existan
for (let i = 0; i < 200 && !(window.saveVentaMultiLinea && window.cambiarEstatusVenta); i++) await new Promise(r => setTimeout(r, 50));

const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── 1. Un solo envío por botón ──
const enCurso = new Set();
function conCandado(nombre) {
  const original = window[nombre];
  if (typeof original !== 'function') return;
  window[nombre] = async function (...args) {
    const clave = nombre + (nombre === 'cotToVenta' ? ':' + args[0] : '');
    if (enCurso.has(clave)) return;
    enCurso.add(clave);
    const objetivo = window.event && window.event.target;
    const boton = objetivo && objetivo.closest ? objetivo.closest('button') : null;
    const antes = boton ? { html: boton.innerHTML, disabled: boton.disabled } : null;
    if (boton) { boton.disabled = true; boton.innerHTML = 'Guardando…'; }
    // Sin conexión Firebase no responde hasta reconectar: se avisa para que no lo capturen otra vez
    const lento = setTimeout(() => window.toast('Sin respuesta todavía. Se enviará al recuperar la conexión; no lo captures otra vez.', 'info'), 9000);
    try {
      return await original.apply(this, args);
    } catch (e) {
      console.error(nombre, e);
      window.toast('No se pudo completar: ' + (e && e.message || e), 'error');
    } finally {
      clearTimeout(lento);
      enCurso.delete(clave);
      if (boton && boton.innerHTML === 'Guardando…') { boton.innerHTML = antes.html; boton.disabled = antes.disabled; }
      else if (boton) boton.disabled = antes.disabled;
    }
  };
}

// ── 2. No perder lo capturado al tocar fuera o cancelar ──
const conCambios = new WeakSet();
['input', 'change'].forEach(tipo => document.addEventListener(tipo, e => {
  if (!e.isTrusted) return;
  const v = e.target.closest && e.target.closest('.modal-overlay');
  if (v) conCambios.add(v);
}, true));
let bajoEn = null;
document.addEventListener('pointerdown', e => { bajoEn = e.target; }, true);
document.addEventListener('click', e => {
  const ventana = e.target.closest && e.target.closest('.modal-overlay');
  if (!ventana) return;
  const fondo = e.target === ventana;
  // seleccionar texto y soltar fuera no debe cerrar
  if (fondo && bajoEn && bajoEn !== ventana) { e.stopPropagation(); return; }
  const boton = e.target.closest('button');
  const cierra = fondo || (boton && (boton.classList.contains('modal-close') || /^\s*(✕\s*)?(cancelar|cerrar)\s*$/i.test(boton.textContent)));
  if (!cierra || !conCambios.has(ventana)) return;
  if (window.confirm('¿Descartar lo que capturaste?')) conCambios.delete(ventana);
  else { e.stopPropagation(); e.preventDefault(); }
}, true);
const abrirOriginal = window.openModal;
if (typeof abrirOriginal === 'function') {
  window.openModal = function (id, ...resto) {
    const v = document.getElementById(id);
    if (v) conCambios.delete(v);
    return abrirOriginal.call(this, id, ...resto);
  };
}

// ── 3. Búsquedas: sin acentos y se mantienen cuando llegan datos nuevos ──
const terminos = new Map();
function aplicarFiltro(tablaId) {
  const tabla = document.getElementById(tablaId);
  if (!tabla) return;
  const palabras = norm(terminos.get(tablaId)).split(/\s+/).filter(Boolean);
  tabla.querySelectorAll('tbody tr').forEach(fila => {
    const texto = norm([...fila.cells].map(c => {
      const sel = c.querySelector('select');
      return sel ? (sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '') : c.textContent;
    }).join(' '));
    const ver = palabras.every(p => texto.includes(p));
    fila.style.display = ver ? '' : 'none';
  });
}
const observadas = new Set();
window.filterTable = function (tablaId, q) {
  terminos.set(tablaId, q);
  const cuerpo = document.querySelector('#' + tablaId + ' tbody');
  if (cuerpo && !observadas.has(tablaId)) {
    observadas.add(tablaId);
    new MutationObserver(() => aplicarFiltro(tablaId)).observe(cuerpo, { childList: true });
  }
  aplicarFiltro(tablaId);
};

// ── 4. Errores técnicos en español ──
const TRADUCCIONES = [
  [/insufficient permissions|permission-denied/i, 'No tienes permiso para hacer esto. Pídelo a un administrador.'],
  [/offline|unavailable|network|failed to fetch/i, 'No hay conexión. Revisa tu internet e inténtalo de nuevo.'],
  [/quota|resource-exhausted/i, 'Se alcanzó el límite de uso de la base de datos. Intenta más tarde.'],
  [/longer than \d+ bytes|exceeds the maximum/i, 'El archivo o registro es demasiado grande.']
];
const toastOriginal = window.toast;
if (typeof toastOriginal === 'function') {
  window.toast = function (mensaje, tipo, ...resto) {
    if (tipo === 'error') {
      const t = TRADUCCIONES.find(([re]) => re.test(String(mensaje)));
      if (t) { console.warn('Detalle del error:', mensaje); mensaje = t[1]; }
    }
    return toastOriginal.call(this, mensaje, tipo, ...resto);
  };
}

// ── 5. Cancelar una venta pide motivo (igual que en Seguimiento) ──
function pedirMotivo(titulo) {
  const motivos = (window.mayaPlazos && window.mayaPlazos.MOTIVOS_CANCELACION) || [{ id: 'otra', nombre: 'Otra causa (especificar)' }];
  return new Promise(resolver => {
    const v = document.createElement('div');
    v.className = 'modal-overlay open';
    v.style.zIndex = 400;
    v.innerHTML = '<div class="modal" role="dialog" aria-modal="true" style="max-width:440px"><div class="modal-head"><h3>' + esc(titulo) + '</h3></div>' +
      '<div class="modal-body"><div class="form-group"><label>Motivo de la cancelación</label><select data-cv-motivo><option value="">Elige un motivo…</option>' +
      motivos.map(m => '<option value="' + esc(m.id) + '">' + esc(m.nombre) + '</option>').join('') + '</select></div>' +
      '<div class="form-group"><label>Detalle (obligatorio si es otra causa)</label><textarea data-cv-detalle maxlength="300"></textarea></div></div>' +
      '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-cv-no>No cancelar</button><button type="button" class="btn btn-danger" data-cv-si>Cancelar la venta</button></div></div>';
    const fin = r => { v.remove(); resolver(r); };
    v.querySelector('[data-cv-no]').onclick = e => { e.stopPropagation(); fin(null); };
    v.querySelector('[data-cv-si]').onclick = () => {
      const motivo = v.querySelector('[data-cv-motivo]').value, detalle = v.querySelector('[data-cv-detalle]').value.trim();
      if (!motivo) return window.toast('Elige el motivo', 'error');
      if (motivo === 'otra' && !detalle) return window.toast('Escribe cuál es la otra causa', 'error');
      fin({ motivo, detalle });
    };
    document.body.appendChild(v);
  });
}
const ventaPorId = id => ((window.data && window.data.ventas) || []).find(v => v.id === id);
const estaCancelada = v => !!v && (/^cancel/i.test(v.estatus || '') || v.etapa === 'cancelada');
function datosCancelacion(venta, m) {
  const por = (window.auth && window.auth.currentUser && window.auth.currentUser.email) || '';
  const cancelacion = { motivo: m.motivo, detalle: m.detalle, por, fecha: Date.now() };
  return { estatus: 'Cancelado', etapa: 'cancelada', cancelacion, seguimiento: ((venta && venta.seguimiento) || []).concat([{ etapa: 'cancelada', fecha: cancelacion.fecha, por, nota: m.detalle || m.motivo }]) };
}
const guardarVenta = (id, cambios) => window.updateDoc(window.doc(window.db, 'ventas', id), cambios);

const estatusOriginal = window.cambiarEstatusVenta;
window.cambiarEstatusVenta = async function (id, nuevo) {
  const venta = ventaPorId(id);
  const repintar = () => { if (typeof window.renderVentas === 'function') window.renderVentas(); };
  try {
    if (nuevo === 'Cancelado' && !estaCancelada(venta)) {
      if (venta && venta.facturaId) { window.toast('Esa venta ya está facturada. Cancela primero la factura.', 'error'); return repintar(); }
      const m = await pedirMotivo('Cancelar venta ' + ((venta && venta.notaId) || ''));
      if (!m) return repintar();
      await guardarVenta(id, datosCancelacion(venta, m));
      return window.toast('Venta cancelada', 'success');
    }
    if (nuevo !== 'Cancelado' && estaCancelada(venta)) await guardarVenta(id, { etapa: null, cancelacion: null });
    return await estatusOriginal.call(this, id, nuevo);
  } catch (e) {
    window.toast('No se pudo cambiar el estatus: ' + e.message, 'error');
    repintar();
  }
};

const notaOriginal = window.guardarCambiosNota;
if (typeof notaOriginal === 'function') {
  window.guardarCambiosNota = async function () {
    const modal = document.getElementById('modal-editar-nota');
    const id = modal && modal.dataset.ventaId;
    const nuevo = document.getElementById('editar-nota-estatus').value;
    const venta = ventaPorId(id);
    let extra = null;
    if (nuevo === 'Cancelado' && !estaCancelada(venta)) {
      if (venta && venta.facturaId) return window.toast('Esa venta ya está facturada. Cancela primero la factura.', 'error');
      const m = await pedirMotivo('Cancelar venta ' + ((venta && venta.notaId) || ''));
      if (!m) return;
      extra = datosCancelacion(venta, m);
    } else if (nuevo !== 'Cancelado' && estaCancelada(venta)) extra = { etapa: null, cancelacion: null };
    try {
      if (extra) await guardarVenta(id, extra);
      return await notaOriginal.apply(this, arguments);
    } catch (e) { window.toast('No se pudo guardar: ' + e.message, 'error'); }
  };
}

// ── 6. Eliminar una nota de entrega avisa de la venta que se creó con ella ──
window.eliminarNotaEntrega = async function (id) {
  const nota = ((window.data && window.data.notasEntrega) || []).find(n => n.id === id);
  if (!nota) return;
  const ligadas = ((window.data && window.data.ventas) || []).filter(v => v.notaEntregaId === nota.notaId && v.clienteNombre === nota.cliente && !estaCancelada(v));
  if (nota.facturaId || ligadas.some(v => v.facturaId)) return window.toast('Esa nota ya está facturada. Cancela primero la factura.', 'error');
  const aviso = ligadas.length ? '\n\nSe creó la venta ' + ligadas.map(v => 'NV #' + v.notaId).join(', ') + ' con esta nota.' : '';
  if (!window.confirm('¿Eliminar la nota ' + nota.notaId + ' de ' + (nota.cliente || 'sin cliente') + '?' + aviso)) return;
  try {
    const cancelar = ligadas.length && window.confirm('¿Cancelar también esa venta para que no se cuente?\n\nAceptar: se marca cancelada.\nCancelar: la venta se queda como está.');
    await window.deleteDoc(window.doc(window.db, 'notasEntrega', id));
    if (cancelar) for (const v of ligadas) await guardarVenta(v.id, datosCancelacion(v, { motivo: 'otra', detalle: 'Se eliminó la nota de entrega ' + nota.notaId }));
    window.toast('Nota eliminada' + (cancelar ? ' y venta cancelada' : ''), 'success');
  } catch (e) { window.toast('Error: ' + e.message, 'error'); }
};

['saveVentaMultiLinea', 'saveCotizacionMultiLinea', 'saveCotizacion', 'saveNotaEntrega', 'saveEntrega', 'saveCliente', 'saveProveedor', 'saveProducto',
  'savePrestamo', 'savePago', 'saveUsuario', 'envios_guardar', 'cotToVenta'].forEach(conCandado);
