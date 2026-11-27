// Interacción: candado contra doble envío, no perder lo capturado, búsquedas que se mantienen,
// errores en español y cancelaciones con motivo. Se carga al final para envolver las funciones ya definidas.
import { estaCancelada, esAnulada, cancelar, reactivar, borrarDefinitivo } from './cancelar.js';

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
const VENTANAS = '.modal-overlay, .m-op-dialogo';
// Ventanas de solo ver: sus casillas y listas no son captura, cerrarlas nunca pregunta
const SOLO_VER = '#modal-ne-preview, #modal-detalles-venta, #modal-vt-foto, #inv-m-ficha, #inv-m-zoom';
['input', 'change'].forEach(tipo => document.addEventListener(tipo, e => {
  if (!e.isTrusted || !e.target.closest) return;
  const v = e.target.closest(VENTANAS);
  if (v && !v.matches(SOLO_VER) && !e.target.matches('input[type=search], .search-box')) conCambios.add(v);
}, true));
let bajoEn = null;
document.addEventListener('pointerdown', e => { bajoEn = e.target; }, true);
document.addEventListener('click', e => {
  const ventana = e.target.closest && e.target.closest(VENTANAS);
  if (!ventana) return;
  // Ya se está cerrando (p. ej. recién guardada): un segundo toque no vuelve a guardar ni pregunta si descartar
  if (ventana.classList.contains('m-cerrando')) { e.stopPropagation(); e.preventDefault(); return; }
  const fondo = e.target === ventana;
  // seleccionar texto y soltar fuera no debe cerrar
  if (fondo && bajoEn && bajoEn !== ventana) { e.stopPropagation(); return; }
  const boton = e.target.closest('button');
  const cierra = fondo || (boton && (boton.matches('.modal-close, .m-op-x') || /^\s*(✕\s*)?(cancelar|cerrar)\s*$/i.test(boton.textContent)));
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

// ── 5. Cancelar en vez de eliminar (las reglas y el diálogo del motivo están en cancelar.js) ──
const ventaPorId = id => ((window.data && window.data.ventas) || []).find(v => v.id === id);

// Cambiar a "Cancelado" pide motivo; salir de "Cancelado" reactiva (con su nota de entrega). false = no seguir.
async function pasarPorCancelacion(venta, nuevo) {
  if (!venta) return true;
  if (nuevo === 'Cancelado') return estaCancelada(venta) || cancelar('ventas', venta.id);
  // Reactivar pregunta antes: puede revivir también la nota de entrega
  return !esAnulada('ventas', venta.id) || reactivar('ventas', venta.id, { etapa: null });
}

const estatusOriginal = window.cambiarEstatusVenta;
window.cambiarEstatusVenta = async function (id, nuevo) {
  const venta = ventaPorId(id);
  const repintar = () => { if (typeof window.renderVentas === 'function') window.renderVentas(); };
  try {
    // Al cancelar, cancelar.js ya guarda el estatus
    const cancelaAhora = nuevo === 'Cancelado' && venta && !estaCancelada(venta);
    if (!(await pasarPorCancelacion(venta, nuevo)) || cancelaAhora) return repintar();
    return await estatusOriginal.call(this, id, nuevo);
  } catch (e) {
    window.toast('No se pudo cambiar el estatus: ' + e.message, 'error');
    repintar();
  }
};

// La ventana de editar abre con el estatus guardado hoy (la lista de Documentos puede estar atrasada)
const abrirNotaOriginal = window.abrirEditarNota;
if (typeof abrirNotaOriginal === 'function') {
  window.abrirEditarNota = function (id) {
    const r = abrirNotaOriginal.apply(this, arguments);
    const modal = document.getElementById('modal-editar-nota');
    const sel = document.getElementById('editar-nota-estatus');
    const venta = ventaPorId(id);
    if (modal && sel && modal.dataset.ventaId === id) {
      if (venta) sel.value = estaCancelada(venta) ? 'Cancelado' : (venta.estatus || 'Pendiente');
      modal.dataset.estatusAlAbrir = sel.value;
    }
    return r;
  };
}

const notaOriginal = window.guardarCambiosNota;
if (typeof notaOriginal === 'function') {
  window.guardarCambiosNota = async function () {
    const modal = document.getElementById('modal-editar-nota');
    const id = modal && modal.dataset.ventaId;
    const sel = document.getElementById('editar-nota-estatus');
    const nuevo = sel.value;
    try {
      const venta = ventaPorId(id);
      // Solo cambiar observaciones no cancela ni reactiva nada
      if (modal && nuevo === modal.dataset.estatusAlAbrir) {
        if (venta && estaCancelada(venta)) sel.value = 'Cancelado';
      } else if (!(await pasarPorCancelacion(venta, nuevo))) return;
      return await notaOriginal.apply(this, arguments);
    } catch (e) { window.toast('No se pudo guardar: ' + e.message, 'error'); }
  };
}

// ── 6. Los botones de antes (🗑) ahora cancelan; sobre algo ya cancelado, Dirección puede borrarlo definitivamente ──
const cancelarOBorrar = (col, id) => (esAnulada(col, id) ? borrarDefinitivo(col, id) : cancelar(col, id));
window.eliminarNotaEntrega = id => cancelarOBorrar('notasEntrega', id);
const borrarOriginal = window.deleteItem;
window.deleteItem = function (col, id) {
  if (col === 'ventas' || col === 'cotizaciones') return cancelarOBorrar(col, id);
  return borrarOriginal && borrarOriginal.apply(this, arguments);
};

// Lo cancelado no se convierte en venta ni recibe factura
function noSiCancelada(nombre, col, mensaje) {
  const original = window[nombre];
  if (typeof original !== 'function') return;
  window[nombre] = function (id, ...resto) {
    if (esAnulada(col, id)) return window.toast(mensaje, 'error');
    return original.call(this, id, ...resto);
  };
}

['saveVentaMultiLinea', 'saveCotizacionMultiLinea', 'saveCotizacion', 'saveNotaEntrega', 'saveEntrega', 'saveCliente', 'saveProveedor', 'saveProducto',
  'savePrestamo', 'savePago', 'saveUsuario', 'envios_guardar', 'cotToVenta'].forEach(conCandado);
// El formulario de venta no cancela: así no se salta el motivo ni la revisión de factura y pagos
const guardarVentaOriginal = window.saveVentaMultiLinea;
if (typeof guardarVentaOriginal === 'function') {
  window.saveVentaMultiLinea = function (...args) {
    const s = document.getElementById('v-estatus-inicial');
    if (s && s.value === 'Cancelado') return window.toast('Para cancelar una venta usa el botón o el estatus de la lista: pide el motivo. Elige otro estatus.', 'error');
    return guardarVentaOriginal.apply(this, args);
  };
}
noSiCancelada('cotToVenta', 'cotizaciones', 'Esa cotización está cancelada. Reactívala primero.');
noSiCancelada('abrirUploadFactura', 'ventas', 'Esa venta está cancelada; no lleva factura.');
