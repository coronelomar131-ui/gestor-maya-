// Corregir lo ya capturado: clientes, proveedores, entregas, notas de entrega y cotizaciones.
// Reutiliza las ventanas de alta en "modo edición". Solo se guarda lo que cambió; nunca se tocan folio, código ni createdAt.

import { estaCancelada, ventasLigadas as ligadasDe } from './cancelar.js';

// Las funciones que se envuelven las define el script principal: se espera a que existan
const NECESARIAS = ['openModal', 'closeModal', 'saveCliente', 'saveProveedor', 'saveEntrega', 'saveCotizacion', 'saveNotaEntrega', 'mayaNoCorregible'];
for (let i = 0; i < 200 && !NECESARIAS.every(n => window[n]); i++) await new Promise(r => setTimeout(r, 50));

const el = id => document.getElementById(id);
const val = id => (el(id).type === 'checkbox' ? el(id).checked : String(el(id).value).trim());
const poner = (id, v) => { const c = el(id); if (c.type === 'checkbox') c.checked = !!v; else c.value = v == null ? '' : v; };
const texto = v => String(v == null ? '' : v).trim();
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const pesos = n => '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const D = () => window.data || {};
const rol = () => window.currentRole || 'vendedor';
const puedeModulo = m => (window.mayaRoles ? window.mayaRoles.puedeModulo(rol(), m) : rol() === 'admin');
const usuario = () => (window.auth && window.auth.currentUser) || {};
const miNombre = () => texto(el('user-name-display') && el('user-name-display').textContent) || usuario().email || 'Usuario';
// Los mensajes pueden traer nombres capturados: sin < > sirven igual si el aviso se pinta como texto o como HTML
const aviso = (m, t) => window.toast(String(m).replace(/</g, '‹').replace(/>/g, '›'), t || 'success');
const ref = (col, id) => window.doc(window.db, col, id);
// Historial igual al de las ventas: quién, cuándo, qué cambió y cómo estaba antes (últimas 20)
const historial = (doc, cambios, antes) => (Array.isArray(doc.correcciones) ? doc.correcciones : [])
  .concat([{ por: miNombre(), uid: usuario().uid || '', cuando: Date.now(), motivo: '', cambios, antes }]).slice(-20);
const foto = (doc, campos) => campos.reduce((o, k) => { if (doc[k] !== undefined) o[k] = doc[k]; return o; }, {});

// Select con un valor guardado que no está en la lista (datos viejos o de Pepito): se agrega la opción
function ponerOpcion(id, valor, etiqueta) {
  const s = el(id);
  const v = valor == null ? '' : String(valor);
  if (v && ![...s.options].some(o => o.value === v)) {
    const o = new Option(etiqueta || v, v);
    o.dataset.ed = '1';
    s.add(o);
  }
  s.value = v;
}
const quitarOpciones = id => el(id).querySelectorAll('option[data-ed]').forEach(o => o.remove());

async function leerDoc(col, id) {
  const s = await window.getDoc(ref(col, id));
  if (!s.exists()) throw new Error('Ese registro ya no existe');
  return Object.assign({}, s.data(), { id });
}

// ── Modo edición de cada ventana ──
const VENTANAS = {
  'modal-cliente': { guardar: 'saveCliente', limpiar: limpiarCliente },
  'modal-proveedor': { guardar: 'saveProveedor', limpiar: limpiarProveedor },
  'modal-entrega': { guardar: 'saveEntrega', limpiar: limpiarEntrega },
  'modal-cotizacion': { guardar: 'saveCotizacion', limpiar: limpiarCotizacion },
  'modal-nota-entrega': { guardar: 'saveNotaEntrega', limpiar: () => window.initNotaEntrega() }
};
const editando = {};
const botonDe = id => el(id).querySelector('button[onclick="' + VENTANAS[id].guardar + '()"]');

function entrar(id, titulo, textoBoton, estado) {
  const h = el(id).querySelector('.modal-head h3');
  const b = botonDe(id);
  editando[id] = Object.assign(estado, { tituloAntes: h.innerHTML, botonAntes: b.innerHTML }); // con su ícono
  h.textContent = titulo;
  b.textContent = textoBoton;
  b.disabled = false;
}

// Regresa la ventana a "nuevo" para que nunca se sobrescriba un registro por accidente
function salir(id) {
  const e = editando[id];
  if (!e) return;
  delete editando[id];
  el(id).querySelector('.modal-head h3').innerHTML = e.tituloAntes;
  const b = botonDe(id);
  b.innerHTML = e.botonAntes;
  b.disabled = false;
  el(id).querySelectorAll('.ed-aviso').forEach(x => x.remove());
  el(id).querySelectorAll('[data-ed-oculto]').forEach(x => { x.style.display = 'flex'; delete x.dataset.edOculto; });
  VENTANAS[id].limpiar();
}

['openModal', 'closeModal'].forEach(nombre => {
  const original = window[nombre];
  window[nombre] = function (id, ...resto) {
    if (VENTANAS[id]) salir(id);
    return original.call(this, id, ...resto);
  };
});
// Algunas pantallas cierran las ventanas sin closeModal (al cambiar de módulo)
Object.keys(VENTANAS).forEach(id => {
  const v = el(id);
  if (v) new MutationObserver(() => { if (!v.classList.contains('open')) salir(id); }).observe(v, { attributes: true, attributeFilter: ['class'] });
});

// El botón de guardar de la ventana: en modo edición corrige; si no, hace el alta de siempre
const guardando = new Set();
function envolverGuardado(id, corregir) {
  const nombre = VENTANAS[id].guardar;
  const original = window[nombre];
  window[nombre] = async function (...args) {
    const e = editando[id];
    if (!e) return original.apply(this, args);
    if (guardando.has(id)) return;
    guardando.add(id);
    try { await corregir(e); }
    catch (err) { console.error('corregir', id, err); aviso('No se pudo guardar: ' + err.message, 'error'); }
    finally { guardando.delete(id); }
  };
}
// Si la ventana se cerró o cambió mientras se revisaba, no se guarda nada
const sigue = (id, e) => editando[id] === e;
function terminar(id, mensaje) {
  window.closeModal(id);
  aviso(mensaje);
}
// Campos del formulario que cambiaron respecto a como se abrió
const cambiados = (antes, ahora) => Object.keys(ahora).filter(k => ahora[k] !== antes[k]);

let turno = 0;
const moduloActivo = () => (document.querySelector('.module-view.active') || {}).id;
async function abrir(col, id, llenar) {
  const mio = ++turno, modulo = moduloActivo();
  try {
    const doc = await leerDoc(col, id);
    // Con señal lenta: si mientras tanto tocó otra cosa (otra ventana u otro módulo), no se le encima la edición
    if (mio !== turno || modulo !== moduloActivo() || document.querySelector('.modal-overlay.open:not(.m-cerrando)')) return;
    llenar(doc);
  } catch (e) { console.error('editar', col, e); aviso('No se pudo abrir: ' + e.message, 'error'); }
}

// ═══════════ CLIENTES ═══════════
const CAMPOS_CLIENTE = {
  razonSocial: 'c-razonSocial', rfc: 'c-rfc', email: 'c-email', telefono: 'c-telefono', tipoPersona: 'c-tipo-persona', regimenFiscal: 'c-regimen', usoCfdi: 'c-uso-cfdi',
  calle: 'c-calle', numeroExterior: 'c-numeroExterior', numeroInterior: 'c-numeroInterior', colonia: 'c-colonia', municipio: 'c-municipio', ciudad: 'c-ciudad',
  estado: 'c-estado', pais: 'c-pais', codigoPostal: 'c-codigoPostal', redesSociales: 'c-redes-sociales', notaSinPrecio: 'c-sin-precio', sinEfectosFiscales: 'c-sin-fiscal'
};
const leerCliente = () => Object.keys(CAMPOS_CLIENTE).reduce((o, k) => { o[k] = val(CAMPOS_CLIENTE[k]); return o; }, {});

function pintarDuplicado(mensaje, esParecido) {
  const caja = el('c-duplicado');
  if (caja) { caja.hidden = !mensaje; caja.textContent = mensaje || ''; caja.classList.toggle('es-parecido', !!esParecido); }
  el('c-guardar').disabled = !!mensaje && !esParecido;
}

function limpiarCliente() {
  Object.values(CAMPOS_CLIENTE).concat('c-codigo').forEach(id => poner(id, ''));
  ['c-regimen', 'c-estado', 'c-uso-cfdi'].forEach(quitarOpciones);
  poner('c-pais', 'México');
  poner('c-uso-cfdi', 'G01');
  if (window.llenarRegimenes) window.llenarRegimenes();
  pintarDuplicado('');
}

function editarCliente(id) {
  return abrir('clientes', id, c => {
    window.openModal('modal-cliente');
    limpiarCliente();
    const datos = Object.assign({}, c, {
      razonSocial: c.razonSocial || c.nombre || '', telefono: c.telefono || c.tel || '',
      sinEfectosFiscales: !!c.sinEfectosFiscales || c.usoCfdi === 'S01'
    });
    const S = window.mayaSat;
    poner('c-codigo', c.codigoCliente || c.codigo || '');
    poner('c-tipo-persona', datos.tipoPersona || '');
    if (window.llenarRegimenes) window.llenarRegimenes();
    const uso = el('c-uso-cfdi');
    if (S && uso.options.length < 2) {
      uso.innerHTML = '';
      uso.add(new Option('Elige el uso…', ''));
      Object.entries(S.USOS_CFDI).forEach(([k, v]) => uso.add(new Option(k + ' · ' + v, k)));
    }
    Object.entries(CAMPOS_CLIENTE).forEach(([campo, input]) => {
      if (el(input).tagName === 'SELECT') ponerOpcion(input, datos[campo]);
      else poner(input, datos[campo]);
    });
    entrar('modal-cliente', '✏️ Editar cliente ' + (c.codigoCliente || ''), 'Guardar cambios', { id, antes: leerCliente() });
  });
}

// Al escribir, el propio cliente no cuenta como repetido; solo se revisa lo que cambió
function datosDuplicado(e, f) {
  const o = {};
  ['razonSocial', 'rfc', 'email', 'telefono'].forEach(k => { if (f[k] !== e.antes[k]) o[k] = f[k]; });
  return o;
}
const revisarOriginal = window.revisarClienteDuplicado;
window.revisarClienteDuplicado = function (...args) {
  const e = editando['modal-cliente'];
  if (!e) return revisarOriginal && revisarOriginal.apply(this, args);
  const M = window.mayaDuplicados;
  if (!M) return;
  const nuevo = datosDuplicado(e, leerCliente()), lista = D().clientes || [];
  const d = M.buscarDuplicado(nuevo, lista, e.id);
  const p = d ? null : M.buscarParecido(nuevo, lista, e.id);
  pintarDuplicado(d ? '⚠️ ' + M.mensajeDuplicado(d) : p ? '🤔 ' + M.mensajeParecido(p) : '', !d);
};

envolverGuardado('modal-cliente', async e => {
  const f = leerCliente();
  if (!f.razonSocial) return aviso('Razón Social es requerida', 'error');
  const claves = cambiados(e.antes, f);
  if (!claves.length) return aviso('No cambiaste nada', 'info');
  const S = window.mayaSat;
  let normal = null;
  if (!f.redesSociales && S) {
    const v = S.validarCliente(f);
    if (v.ok) normal = v.normalizado;
    // Si antes estaba completo no se deja incompleto; si ya venía incompleto se puede corregir lo demás
    else if (S.validarCliente(e.antes).ok) return aviso(S.mensaje(v), 'error');
    else if (!window.confirm(S.mensaje(v) + '\n\n¿Guardar la corrección de todos modos?')) return;
  }
  const M = window.mayaDuplicados;
  if (!M) return aviso('No se pudo revisar si el cliente ya existe. Recarga la página.', 'error');
  const nuevo = datosDuplicado(e, f);
  if (Object.keys(nuevo).length) {
    const lista = (await window.getDocs(window.collection(window.db, 'clientes'))).docs.map(d => Object.assign({}, d.data(), { id: d.id }));
    const d = M.buscarDuplicado(nuevo, lista, e.id);
    if (d) { pintarDuplicado('⚠️ ' + M.mensajeDuplicado(d)); return aviso(M.mensajeDuplicado(d), 'error'); }
    const p = M.buscarParecido(nuevo, lista, e.id);
    if (p && !window.confirm(M.mensajeParecido(p) + '\n\nAcepta solo si es un cliente distinto.')) return;
  }
  if (!sigue('modal-cliente', e)) return;
  const cambios = {};
  claves.forEach(k => { cambios[k] = normal && ['rfc', 'tipoPersona', 'regimenFiscal', 'usoCfdi'].includes(k) ? normal[k] : f[k]; });
  if (claves.includes('usoCfdi') || claves.includes('sinEfectosFiscales')) cambios.sinEfectosFiscales = f.usoCfdi === 'S01' || f.sinEfectosFiscales;
  await window.updateDoc(ref('clientes', e.id), cambios);
  terminar('modal-cliente', '✏️ Cliente corregido' + (claves.includes('razonSocial') ? '. Las notas ya hechas conservan el nombre anterior.' : ''));
});

// ═══════════ PROVEEDORES ═══════════
const CAMPOS_PROV = { nombre: 'pr-nombre', contacto: 'pr-contacto', telefono: 'pr-tel', email: 'pr-email', productos: 'pr-productos' };
const leerProv = () => Object.keys(CAMPOS_PROV).reduce((o, k) => { o[k] = val(CAMPOS_PROV[k]); return o; }, {});
function limpiarProveedor() { Object.values(CAMPOS_PROV).forEach(id => poner(id, '')); }

function editarProveedor(id) {
  return abrir('proveedores', id, p => {
    window.openModal('modal-proveedor');
    Object.entries(CAMPOS_PROV).forEach(([campo, input]) => poner(input, p[campo]));
    entrar('modal-proveedor', '✏️ Editar proveedor', 'Guardar cambios', { id, antes: leerProv() });
  });
}

envolverGuardado('modal-proveedor', async e => {
  const f = leerProv();
  if (!f.nombre) return aviso('Ingresa el nombre', 'error');
  const claves = cambiados(e.antes, f);
  if (!claves.length) return aviso('No cambiaste nada', 'info');
  await window.updateDoc(ref('proveedores', e.id), claves.reduce((o, k) => { o[k] = f[k]; return o; }, {}));
  terminar('modal-proveedor', '✏️ Proveedor corregido');
});

// ═══════════ ENTREGAS ═══════════
const CAMPOS_ENT = { direccion: 'e-dir', monto: 'e-monto', metodoPago: 'e-pago', estatus: 'e-estatus', notas: 'e-notas' };
const leerEnt = () => Object.keys(CAMPOS_ENT).reduce((o, k) => { o[k] = val(CAMPOS_ENT[k]); return o; }, { clienteId: el('e-cliente').value });
function limpiarEntrega() {
  ['e-cliente', 'e-pago', 'e-estatus'].forEach(quitarOpciones);
  ['e-cliente', 'e-dir', 'e-monto', 'e-notas'].forEach(id => poner(id, ''));
  el('e-pago').selectedIndex = 0;
  el('e-estatus').selectedIndex = 0;
}

function editarEntrega(id) {
  return abrir('entregas', id, x => {
    window.openModal('modal-entrega');
    limpiarEntrega();
    // "cliente" manda: las viejas guardaron ahí el id y Pepito cambia solo el nombre (clienteId puede quedar atrasado)
    const lista = D().clientes || [];
    const c = lista.find(k => k.id === x.cliente) || lista.find(k => (k.razonSocial || k.nombre) === x.cliente) || lista.find(k => k.id === x.clienteId);
    if (c) ponerOpcion('e-cliente', c.id, c.razonSocial || c.nombre);
    else ponerOpcion('e-cliente', '__actual', (x.cliente || 'Sin cliente') + ' (como está)');
    poner('e-dir', x.direccion);
    poner('e-monto', x.monto);
    ponerOpcion('e-pago', x.metodoPago || el('e-pago').options[0].value);
    ponerOpcion('e-estatus', x.estatus || 'pending');
    poner('e-notas', x.notas);
    entrar('modal-entrega', '✏️ Editar entrega', 'Guardar cambios', { id, antes: leerEnt() });
  });
}

envolverGuardado('modal-entrega', async e => {
  const f = leerEnt();
  // Al llegar datos nuevos la lista de clientes se rehace y quita la opción "como está": eso no es un cambio
  const mismoCliente = e.antes.clienteId === '__actual' && (!f.clienteId || f.clienteId === '__actual');
  if (mismoCliente) f.clienteId = '__actual';
  if (!f.clienteId) return aviso('Elige el cliente', 'error');
  if (!f.direccion && e.antes.direccion) return aviso('Escribe la dirección de entrega', 'error');
  const claves = cambiados(e.antes, f);
  if (!claves.length) return aviso('No cambiaste nada', 'info');
  const cambios = {};
  claves.forEach(k => { cambios[k] = k === 'monto' ? parseFloat(f.monto) || 0 : f[k]; });
  if (claves.includes('clienteId')) {
    const c = (D().clientes || []).find(k => k.id === f.clienteId);
    cambios.cliente = c ? (c.razonSocial || c.nombre || c.id) : f.clienteId;
  }
  await window.updateDoc(ref('entregas', e.id), cambios);
  terminar('modal-entrega', '✏️ Entrega corregida');
});

// ═══════════ COTIZACIONES ═══════════
function limpiarCotizacion() { el('cot-items-body').innerHTML = ''; }
// % de IVA con el que se capturó la partida, sacado de los montos guardados
const pctDe = it => (it.ivaPorcentaje != null ? Number(it.ivaPorcentaje) : Number(it.precio) ? r2((Number(it.iva) || 0) / Number(it.precio) * 100) : 16);
const filasCot = () => [...document.querySelectorAll('#cot-items-body tr')].map(tr => {
  const v = c => tr.querySelector(c).value.trim();
  return { idx: tr.dataset.edIdx, pedido: v('.cot-item-pedido'), numSiniestro: v('.cot-item-siniestro'), precio: parseFloat(v('.cot-item-precio')) || 0,
    pct: v('.cot-item-iva-porcentaje') === '' ? 16 : parseFloat(v('.cot-item-iva-porcentaje')) || 0, ajuste: parseFloat(v('.cot-item-ajuste')) || 0 };
}).filter(f => f.pedido);
const leerCot = () => ({ fecha: val('cot-fecha'), cliente: val('cot-cliente'), vendedor: el('cot-vendedor').value, filas: JSON.stringify(filasCot()) });

function editarCotizacion(id) {
  return abrir('cotizaciones', id, c => {
    if (estaCancelada(c)) return aviso('Esa cotización está cancelada. Reactívala para corregirla.', 'error');
    window.openModal('modal-cotizacion');
    window.inicializarFormularioCotizacion();
    if (c.fecha) poner('cot-fecha', window.mayaDiaVenta(c.fecha));
    const nombre = c.clienteNombre || c.cliente || '';
    poner('cot-cliente', nombre + (c.clienteId && c.clienteId !== nombre ? '|' + c.clienteId : ''));
    ponerOpcion('cot-vendedor', c.vendedor);
    el('cot-items-body').innerHTML = '';
    // Cotizaciones antiguas de una sola pieza no traen "items"
    const items = Array.isArray(c.items) && c.items.length ? c.items
      : c.descripcion ? [{ pedido: c.descripcion, precio: Number(c.subtotal != null ? c.subtotal : c.total) || 0, iva: Number(c.ivaTotal) || 0, ajuste: 0 }] : [];
    items.forEach((it, i) => {
      window.agregarFilaPiezaCot();
      const tr = el('cot-items-body').lastElementChild;
      tr.dataset.edIdx = i;
      const set = (cl, v) => { tr.querySelector(cl).value = v; };
      set('.cot-item-pedido', it.pedido || it.descripcion || '');
      set('.cot-item-siniestro', it.numSiniestro || '');
      set('.cot-item-precio', Number(it.precio) || 0);
      set('.cot-item-iva-porcentaje', pctDe(it));
      set('.cot-item-iva-valor', (Number(it.iva) || 0).toFixed(2));
      set('.cot-item-ajuste', Number(it.ajuste) || 0);
    });
    if (!items.length) window.agregarFilaPiezaCot();
    window.recalcularTotalesCot();
    entrar('modal-cotizacion', '✏️ Editar cotización COT-' + (c.notaId || ''), 'Guardar cambios', { id, doc: c, items, antes: leerCot() });
  });
}

envolverGuardado('modal-cotizacion', async e => {
  const f = leerCot();
  if (!f.fecha || !f.cliente) return aviso('Completa fecha y cliente', 'error');
  const claves = cambiados(e.antes, f);
  if (!claves.length) return aviso('No cambiaste nada', 'info');
  const cambios = {}, lista = [];
  if (claves.includes('fecha')) { cambios.fecha = new Date(f.fecha + 'T12:00:00').getTime(); lista.push('Fecha → ' + f.fecha); }
  if (claves.includes('cliente')) {
    const [nombre, id] = f.cliente.split('|');
    const c = (D().clientes || []).find(k => k.id === id) || (D().clientes || []).find(k => (k.razonSocial || k.nombre) === nombre);
    cambios.clienteNombre = nombre;
    cambios.clienteId = id || (c ? c.id : nombre);
    lista.push('Cliente → ' + nombre);
  }
  if (claves.includes('vendedor')) { cambios.vendedor = f.vendedor; lista.push('Vendedor → ' + (f.vendedor || '—')); }
  if (claves.includes('filas')) {
    const items = filasCot().map(x => {
      const viejo = x.idx != null ? e.items[x.idx] : null;
      // Si no cambió el precio ni el %, se respeta el IVA guardado al centavo
      const igual = viejo && r2(viejo.precio) === r2(x.precio) && pctDe(viejo) === x.pct;
      const it = Object.assign({}, viejo, { pedido: x.pedido, numSiniestro: x.numSiniestro, precio: x.precio, iva: igual ? Number(viejo.iva) || 0 : r2(x.precio * x.pct / 100), ajuste: x.ajuste });
      if (it.ivaPorcentaje != null) it.ivaPorcentaje = x.pct;
      return it;
    });
    if (!items.length) return aviso('Agrega al menos una pieza', 'error');
    const suma = k => r2(items.reduce((s, i) => s + (Number(i[k]) || 0), 0));
    Object.assign(cambios, { items, siniestros: items.map(i => i.numSiniestro).filter(Boolean).join(' | '), subtotal: suma('precio'), ivaTotal: suma('iva'), ajusteTotal: suma('ajuste') });
    cambios.total = r2(cambios.subtotal + cambios.ivaTotal - cambios.ajusteTotal);
    lista.push(r2(e.doc.total) !== cambios.total ? 'Total: ' + pesos(e.doc.total) + ' → ' + pesos(cambios.total) : 'Piezas o siniestros');
  }
  const actual = await leerDoc('cotizaciones', e.id);
  if (estaCancelada(actual)) return aviso('Esta cotización ya está cancelada; no se corrige.', 'error');
  const huella = c => JSON.stringify([c.items, c.total, c.clienteNombre, c.vendedor, (c.correcciones || []).length]);
  if (huella(actual) !== huella(e.doc)) return aviso('Alguien más cambió esta cotización. Ciérrala y ábrela de nuevo.', 'error');
  if (!sigue('modal-cotizacion', e)) return;
  cambios.correcciones = historial(e.doc, lista, foto(e.doc, ['fecha', 'clienteId', 'clienteNombre', 'vendedor', 'items', 'siniestros', 'subtotal', 'ivaTotal', 'ajusteTotal', 'total']));
  cambios.actualizado = Date.now();
  await window.updateDoc(ref('cotizaciones', e.id), cambios);
  terminar('modal-cotizacion', '✏️ COT-' + (e.doc.notaId || '') + ' corregida');
});

// ═══════════ NOTAS DE ENTREGA (y su venta ligada) ═══════════
// Debe incluir todos los campos que revisa "Deshacer la última corrección" (app y Pepito): los que falten ahí se vacían
const CAMPOS_ANTES_VENTA = ['items', 'siniestros', 'subtotal', 'ivaTotal', 'ajusteTotal', 'total', 'clienteId', 'clienteNombre', 'fecha', 'vendedor', 'estatus',
  'incluyeDatosFiscales', 'contacto', 'impuestoNota', 'formaPago', 'diasCredito', 'precioConIva', 'ivaModo', 'costoTotal', 'utilidad', 'utilidadPct', 'utilidadSinIva', 'costoCompleto', 'anticipo', 'resta'];
// Campos que la corrección puede estrenar: se guardan como vacíos para que "Deshacer" también los quite
const fotoVenta = v => Object.assign({ ivaModo: null, anticipo: null, resta: null }, foto(v, CAMPOS_ANTES_VENTA));
const CAMPOS_ANTES_NOTA = ['fecha', 'cliente', 'vendedor', 'items', 'siniestro', 'siniestros', 'subtotal', 'ivaTotal', 'total', 'anticipo', 'resta', 'ocultarPrecios'];

// Ventas creadas desde la nota (la regla está en cancelar.js)
const ventasLigadas = (nota, ventas) => ligadasDe(nota, ventas, D().notasEntrega);

// Motivo por el que no se puede corregir la nota ('' = sí se puede)
function noCorregible(nota, ligadas) {
  if (estaCancelada(nota)) return (nota.notaId || 'La nota') + ' está cancelada; no se corrige.';
  const activa = ligadas.find(v => !estaCancelada(v));
  const propia = window.mayaNoCorregible({
    notaId: nota.notaId, vendedor: nota.vendedor, createdBy: nota.createdBy || (activa && activa.createdBy),
    facturaId: nota.facturaId, estatus: ''
  });
  if (propia) return propia.replace('NV #', '');
  if (nota.facturaId) return nota.notaId + ' ya está facturada. Cancela primero la factura.';
  for (const v of ligadas) {
    const folio = 'NV #' + (v.notaId || '');
    if (v.facturaId || v.tieneFactura || v.facturaURL) return 'La venta ' + folio + ' de esta nota ya está facturada; no se puede corregir.';
    if ((v.pagos || []).length) return 'La venta ' + folio + ' de esta nota ya tiene pagos registrados; no se puede corregir.';
  }
  if (ligadas.filter(v => !estaCancelada(v)).length > 1) return 'Hay más de una venta ligada a ' + nota.notaId + '. Pídele a Dirección que cancele la repetida.';
  return activa ? window.mayaNoCorregible(activa) : '';
}

const itemNE = it => ({ descripcion: texto(it.descripcion), siniestro: texto(it.siniestro), anio: texto(it.anio), cantidad: Number(it.cantidad) || 1, precioUnit: Number(it.precioUnit) || 0 });
const filasNE = () => [...document.querySelectorAll('#ne-items-body tr')].map(tr => {
  const v = c => tr.querySelector(c).value;
  return Object.assign({ idx: tr.dataset.edIdx }, itemNE({ descripcion: v('.ne-desc'), siniestro: v('.ne-sin'), anio: v('.ne-anio'), cantidad: parseFloat(v('.ne-cant')), precioUnit: parseFloat(v('.ne-precio')) }));
}).filter(f => f.descripcion);
const leerNE = () => ({
  cliente: val('ne-cliente'), fecha: val('ne-fecha'), vendedor: val('ne-vendedor'), conIva: val('ne-iva'), anticipo: r2(parseFloat(val('ne-anticipo'))),
  ocultarPrecios: val('ne-ocultar-precios'), filas: JSON.stringify(filasNE().map(({ idx, ...x }) => x))
});
// Texto de la partida en la venta, igual que al crearla
const pedidoDe = it => it.descripcion + (it.anio ? ' (' + it.anio + ')' : '') + (it.cantidad > 1 ? ' x' + it.cantidad : '');

function editarNota(id) {
  return abrir('notasEntrega', id, n => {
    const ligadas = ventasLigadas(n, D().ventas || []);
    const no = noCorregible(n, ligadas);
    if (no) return aviso(no, 'error');
    window.openModal('modal-nota-entrega');
    window.initNotaEntrega();
    poner('ne-cliente', n.cliente);
    poner('ne-fecha', /^\d{4}-\d{2}-\d{2}/.test(n.fecha || '') ? n.fecha.slice(0, 10) : n.fecha ? window.mayaDiaVenta(n.fecha) : '');
    poner('ne-vendedor', n.vendedor);
    poner('ne-iva', Number(n.ivaTotal) > 0);
    poner('ne-anticipo', Number(n.anticipo) > 0 ? n.anticipo : '');
    poner('ne-ocultar-precios', n.ocultarPrecios);
    el('ne-items-body').innerHTML = '';
    (n.items || []).forEach((it, i) => {
      window.agregarItemNE();
      const tr = el('ne-items-body').lastElementChild;
      tr.dataset.edIdx = i;
      const x = itemNE(it);
      [['.ne-desc', x.descripcion], ['.ne-sin', x.siniestro], ['.ne-anio', x.anio], ['.ne-cant', x.cantidad], ['.ne-precio', x.precioUnit]]
        .forEach(([c, v]) => { tr.querySelector(c).value = v; });
    });
    if (!(n.items || []).length) window.agregarItemNE();
    window.calcTotalesNE();
    // La venta ya existe (o no): en una corrección no se registra otra
    const casilla = el('ne-registrar-venta').parentElement;
    casilla.dataset.edOculto = '1';
    casilla.style.display = 'none';
    const activa = ligadas.find(v => !estaCancelada(v));
    const ult = (n.correcciones || []).slice(-1)[0];
    const nota = document.createElement('p');
    nota.className = 'ed-aviso';
    nota.textContent = 'El folio ' + (n.notaId || '') + ' no cambia. ' + (activa ? 'La venta NV #' + (activa.notaId || '') + ' se actualiza junto con la nota.' : 'Esta nota no tiene venta ligada.') +
      (ult ? ' Última corrección: ' + ult.por + ', ' + new Date(ult.cuando).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) + '.' : '');
    casilla.parentElement.insertBefore(nota, casilla);
    entrar('modal-nota-entrega', '✏️ Corregir nota ' + (n.notaId || ''), 'Guardar corrección + PDF', { id, doc: n, antes: leerNE() });
  });
}

// Partidas y totales de la venta a partir de la nota corregida, conservando proveedor, costo y ajuste
function dineroVenta(venta, notaAntes, filas, conIva) {
  const viejas = venta.items || [], usadas = new Set();
  const items = filas.map(it => {
    const original = it.idx != null ? notaAntes[it.idx] : null;
    let j = original ? viejas.findIndex((v, k) => !usadas.has(k) && v.pedido === pedidoDe(itemNE(original))) : -1;
    if (j < 0 && original && viejas.length === notaAntes.length && !usadas.has(Number(it.idx))) j = Number(it.idx);
    const v = j >= 0 ? viejas[j] : null;
    if (v) usadas.add(j);
    const linea = it.cantidad * it.precioUnit;
    const nuevo = Object.assign({}, v, { pedido: pedidoDe(it), numSiniestro: it.siniestro, precio: linea, iva: conIva ? r2(linea * 0.16) : 0, ajuste: Number(v && v.ajuste) || 0 });
    delete nuevo.ivaPorcentaje; // la nota captura sin IVA y se le suma el 16 %
    const fuente = v || original || {};
    ['proveedor', 'costo', 'costoDesglose'].forEach(k => { if (fuente[k] != null) nuevo[k] = fuente[k]; });
    return nuevo;
  });
  const suma = k => items.reduce((s, i) => s + (Number(i[k]) || 0), 0);
  const subtotal = r2(suma('precio')), ivaTotal = r2(conIva ? suma('precio') * 0.16 : 0), ajusteTotal = r2(suma('ajuste'));
  const total = r2(subtotal + ivaTotal - ajusteTotal);
  const conCosto = items.filter(i => i.costo != null);
  const costoTotal = conCosto.length ? r2(conCosto.reduce((s, i) => s + Number(i.costo), 0)) : null;
  const utilidad = costoTotal == null ? null : r2(total - costoTotal);
  return {
    items, siniestros: items.map(i => i.numSiniestro).filter(Boolean).join(' | '), subtotal, ivaTotal, ajusteTotal, total,
    precioConIva: false, ivaModo: conIva ? 'mas_iva' : 'sin_iva', costoTotal, utilidad,
    utilidadPct: utilidad == null || total <= 0 ? null : r2(utilidad / total * 100),
    utilidadSinIva: costoTotal == null ? null : r2(subtotal - ajusteTotal - costoTotal),
    costoCompleto: conCosto.length === items.length
  };
}

envolverGuardado('modal-nota-entrega', async e => {
  const f = leerNE();
  if (!f.cliente) return aviso('Ingresa el cliente', 'error');
  const filas = filasNE();
  if (!filas.length) return aviso('Agrega al menos un item', 'error');
  const claves = cambiados(e.antes, f);
  if (!claves.length) return aviso('No cambiaste nada', 'info');

  // Se revisa contra lo guardado ahora mismo (pudo facturarse o cambiar mientras estaba abierta)
  const actual = await leerDoc('notasEntrega', e.id);
  const snap = await window.getDocs(window.query(window.collection(window.db, 'ventas'), window.where('notaEntregaId', '==', actual.notaId || '')));
  const ligadas = ventasLigadas(actual, snap.docs.map(d => Object.assign({}, d.data(), { id: d.id })));
  const no = noCorregible(actual, ligadas);
  if (no) return aviso(no, 'error');
  const huella = n => JSON.stringify([(n.items || []).map(itemNE), n.cliente, n.total, (n.correcciones || []).length]);
  if (huella(actual) !== huella(e.doc)) return aviso('Alguien más cambió esta nota. Ciérrala y ábrela de nuevo.', 'error');

  const cambiaDinero = claves.includes('filas') || claves.includes('conIva');
  const nota = {}, lista = [];
  let total = Number(actual.total) || 0;
  if (claves.includes('cliente')) { nota.cliente = f.cliente; lista.push('Cliente: ' + (actual.cliente || '—') + ' → ' + f.cliente); }
  if (claves.includes('fecha')) {
    if (!f.fecha) return aviso('Pon la fecha', 'error');
    nota.fecha = f.fecha; lista.push('Fecha → ' + f.fecha);
  }
  if (claves.includes('vendedor')) { nota.vendedor = f.vendedor; lista.push('Vendedor: ' + (actual.vendedor || '—') + ' → ' + (f.vendedor || '—')); }
  if (claves.includes('ocultarPrecios')) { nota.ocultarPrecios = f.ocultarPrecios; lista.push(f.ocultarPrecios ? 'PDF sin precios' : 'PDF con precios'); }
  if (cambiaDinero) {
    const items = filas.map(({ idx, ...x }) => Object.assign({}, idx != null ? (actual.items || [])[idx] : null, x));
    const subtotal = items.reduce((s, it) => s + it.cantidad * it.precioUnit, 0);
    const ivaTotal = f.conIva ? subtotal * 0.16 : 0;
    total = subtotal + ivaTotal;
    Object.assign(nota, {
      items, siniestro: items.map(i => i.siniestro).filter(Boolean).join(' | '),
      siniestros: items.filter(i => i.siniestro).map(i => ({ num: i.siniestro, anio: i.anio })), subtotal, ivaTotal, total
    });
    lista.push(r2(actual.total) !== r2(total) ? 'Total: ' + pesos(actual.total) + ' → ' + pesos(total) : 'Piezas o siniestros');
  }
  if (f.anticipo < 0 || f.anticipo > total + 0.005) return aviso('El anticipo no puede ser mayor que el total', 'error');
  const cambiaAnticipo = claves.includes('anticipo') || (cambiaDinero && f.anticipo > 0);
  if (cambiaAnticipo) {
    nota.anticipo = f.anticipo > 0 ? f.anticipo : null;
    nota.resta = f.anticipo > 0 ? r2(total - f.anticipo) : null;
    if (claves.includes('anticipo')) lista.push('Anticipo: ' + pesos(actual.anticipo) + ' → ' + pesos(f.anticipo));
  }

  const venta = ligadas.find(v => !estaCancelada(v));
  const cv = {};
  if (venta) {
    // Solo se pasa a la venta lo que cambió en la nota
    if (claves.includes('cliente')) {
      const c = (D().clientes || []).find(k => (k.razonSocial || k.nombre) === f.cliente);
      cv.clienteNombre = f.cliente; cv.clienteId = c ? c.id : '';
    }
    if (claves.includes('fecha')) cv.fecha = new Date(f.fecha + 'T12:00:00').getTime();
    if (claves.includes('vendedor')) cv.vendedor = f.vendedor;
    if (cambiaDinero) {
      const distinta = (venta.items || []).length !== (actual.items || []).length ||
        (venta.items || []).some((v, k) => texto(v.pedido) !== texto(pedidoDe(itemNE(actual.items[k])))) || Math.abs((Number(venta.total) || 0) + (Number(venta.ajusteTotal) || 0) - (Number(actual.total) || 0)) > 0.01;
      if (distinta && !window.confirm('La venta NV #' + venta.notaId + ' no coincide con la nota (se corrigió por separado).\n\nSi guardas, la venta queda con las piezas y precios de esta nota. ¿Continuar?')) return;
      Object.assign(cv, dineroVenta(venta, actual.items || [], filas, f.conIva));
      if (window.mayaAlertas) {
        const alertas = window.mayaAlertas.revisar({ id: venta.id, clienteId: cv.clienteId || venta.clienteId, clienteNombre: cv.clienteNombre || venta.clienteNombre, items: cv.items, total: cv.total, utilidad: cv.utilidad },
          D().ventas || [], D().compras || [], { repetida: false });
        if (alertas.length && !window.confirm('Revisa esto antes de guardar:\n\n' + alertas.map((a, i) => (i + 1) + ') ' + a).join('\n') + '\n\n¿Está bien así y la guardo?')) return;
      }
    }
    if (cambiaAnticipo) {
      const totalVenta = cv.total != null ? cv.total : Number(venta.total) || 0;
      cv.anticipo = nota.anticipo;
      cv.resta = f.anticipo > 0 ? r2(totalVenta - f.anticipo) : null;
    }
  }
  if (!sigue('modal-nota-entrega', e)) return;

  const ahora = Date.now();
  const lote = window.writeBatch(window.db);
  lote.update(ref('notasEntrega', e.id), Object.assign({}, nota, { correcciones: historial(actual, lista.length ? lista : ['Datos de la nota'], foto(actual, CAMPOS_ANTES_NOTA)), actualizado: ahora }));
  if (venta && Object.keys(cv).length) {
    const deNota = ['Corrección de la nota ' + actual.notaId].concat(lista);
    lote.update(ref('ventas', venta.id), Object.assign(cv, { correcciones: historial(venta, deNota, fotoVenta(venta)), actualizado: ahora }));
  }
  await lote.commit();
  terminar('modal-nota-entrega', '✏️ ' + (actual.notaId || 'Nota') + ' corregida' + (venta && Object.keys(cv).length ? ' (y la venta NV #' + venta.notaId + ')' : ''));
  window.generarNotaEntregaPDF(Object.assign({}, actual, nota));
});

// ═══════════ Botones ✏️ en las listas ═══════════
// Las listas se vuelven a pintar solas: se observa cada una y se agrega el botón
const LISTAS = [
  { cuerpo: 'cli-body', col: 'clientes', modulo: 'clientes', editar: editarCliente },
  { cuerpo: 'prov-body', col: 'proveedores', modulo: 'proveedores', editar: editarProveedor },
  { cuerpo: 'ent-body', col: 'entregas', modulo: 'entregas', editar: editarEntrega, marca: /updateEntregaStatus\('([^']+)'/ },
  { cuerpo: 'cot-body', col: 'cotizaciones', modulo: 'cotizaciones', editar: editarCotizacion, marca: /generarCotizacionPDFById\('([^']+)'/ },
  { cuerpo: 'ne-body', col: 'notasEntrega', modulo: 'notas-entrega', editar: editarNota, marca: /previewNotaEntregaPDFById\('([^']+)'/, donde: '.ne-acc' }
];

function idDeFila(lista, tr, i) {
  if (lista.marca) { const m = lista.marca.exec(tr.innerHTML.replace(/&#39;/g, "'")); return m ? m[1] : null; }
  // Clientes y proveedores se pintan en el mismo orden que los datos; el botón de la fila, si lo hay, confirma el id
  const m = /(?:toggleClienteRedes\(|deleteItem\('(?:clientes|proveedores)',)'([^']+)'/.exec(tr.innerHTML);
  if (m) return m[1];
  const d = (D()[lista.col] || [])[i];
  return d ? d.id : null;
}

function ponerBotones(lista) {
  const cuerpo = el(lista.cuerpo);
  if (!cuerpo || !puedeModulo(lista.modulo)) return;
  [...cuerpo.children].forEach((tr, i) => {
    if (!tr.cells || tr.cells.length < 2 || tr.querySelector('.ed-btn')) return;
    const id = idDeFila(lista, tr, i);
    const donde = lista.donde ? tr.querySelector(lista.donde) : tr.cells[tr.cells.length - 1];
    if (!id || !donde) return;
    // Lo cancelado no se corrige: primero se reactiva
    if (['cotizaciones', 'notasEntrega'].includes(lista.col) && estaCancelada((D()[lista.col] || []).find(x => x.id === id))) return;
    if (lista.col === 'notasEntrega') {
      // Solo a quien puede corregir esa nota; si está facturada o con pagos, al tocar se explica por qué
      const n = (D().notasEntrega || []).find(x => x.id === id);
      if (!n) return;
      const admin = ['admin', 'facturacion'].includes(rol());
      if (!admin && noCorregible(n, ventasLigadas(n, D().ventas || []))) return;
    }
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-secondary btn-sm ed-btn';
    b.title = 'Corregir';
    b.setAttribute('aria-label', 'Corregir');
    b.innerHTML = '✏️<span class="ne-txt"> Editar</span>';
    b.addEventListener('click', () => lista.editar(id));
    const borrar = donde.querySelector('.btn-danger');
    donde.insertBefore(b, borrar);
    if (borrar) donde.insertBefore(document.createTextNode(' '), borrar);
  });
}

LISTAS.forEach(lista => {
  const cuerpo = el(lista.cuerpo);
  if (!cuerpo) return;
  new MutationObserver(() => ponerBotones(lista)).observe(cuerpo, { childList: true });
  ponerBotones(lista);
});

window.mayaEdicion = { editarCliente, editarProveedor, editarEntrega, editarCotizacion, editarNota, noCorregible, ventasLigadas };
