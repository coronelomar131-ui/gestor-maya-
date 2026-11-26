// Seguridad: las llamadas a /api/ml van con la sesión, la ventana para cambiar precio y existencia en Mercado Libre
// y la baja de usuarios por el servidor (api/usuarios.js). El navegador ya no lee los tokens de ML.

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dormir = ms => new Promise(r => setTimeout(r, ms));
// El aviso de maya.js pinta texto y el original inserta HTML: se cambian < y > para que sirva en los dos
const aviso = (mensaje, tipo) => window.toast && window.toast(String(mensaje).replace(/</g, '‹').replace(/>/g, '›'), tipo);

async function sesion() {
  for (let i = 0; i < 300; i++) {
    const u = window.auth && window.auth.currentUser;
    if (u) return u;
    await dormir(50);
  }
  return null;
}

// ── 1. Token de Firebase en las llamadas a /api/ml de este mismo sitio ──
const SIN_SESION = ['login-url', 'exchange']; // conexión OAuth: ocurren antes de iniciar sesión
function llevaSesion(entrada, opciones) {
  let url;
  try { url = new URL(entrada instanceof Request ? entrada.url : String(entrada), location.href); }
  catch (e) { return false; }
  if (url.origin !== location.origin || !/^\/api\/ml\/?$/.test(url.pathname)) return false;
  let accion = url.searchParams.get('action');
  if (!accion && opciones && typeof opciones.body === 'string') {
    try { accion = JSON.parse(opciones.body).action; } catch (e) { /* cuerpo que no es JSON */ }
  }
  return !SIN_SESION.includes(accion);
}
const fetchOriginal = window.fetch;
window.fetch = async function (entrada, opciones) {
  if (!llevaSesion(entrada, opciones)) return fetchOriginal.call(window, entrada, opciones);
  const usuario = await sesion();
  if (!usuario) return fetchOriginal.call(window, entrada, opciones);
  const headers = new Headers((opciones && opciones.headers) || (entrada instanceof Request ? entrada.headers : undefined));
  headers.set('Authorization', 'Bearer ' + await usuario.getIdToken());
  return fetchOriginal.call(window, entrada, Object.assign({}, opciones, { headers }));
};

// ── 2. Cambiar precio y existencia en Mercado Libre ──
let publicaciones = [];
const pintarOriginal = window.renderProductosMLGrid;
if (typeof pintarOriginal === 'function') {
  window.renderProductosMLGrid = function (items, ...resto) {
    publicaciones = items || [];
    return pintarOriginal.call(this, items, ...resto);
  };
}

const pesos = n => '$' + Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Regresa los cambios válidos o el motivo por el que no se pueden enviar
function revisar(antes, textoPrecio, textoCantidad) {
  const precio = Number(textoPrecio), cantidad = Number(textoCantidad);
  if (String(textoPrecio).trim() === '' || !Number.isFinite(precio) || precio <= 0) return { error: 'Escribe un precio mayor a cero, solo con números.' };
  if (String(textoCantidad).trim() === '' || !Number.isInteger(cantidad) || cantidad < 0) return { error: 'Las piezas deben ser un número entero: 0, 1, 2…' };
  const cambios = {};
  if (precio !== Number(antes.price)) cambios.price = precio;
  if (cantidad !== Number(antes.available_quantity)) cambios.quantity = cantidad;
  return { precio, cantidad, cambios };
}

function resumenHTML(antes, r) {
  const fila = (nombre, viejo, nuevo, cambia) => '<tr><td style="padding:6px 8px 6px 0">' + nombre + '</td><td style="padding:6px 8px">' + esc(viejo) +
    '</td><td style="padding:6px 0 6px 8px;font-weight:' + (cambia ? '700' : '400') + '">' + (cambia ? esc(nuevo) : 'Sin cambio') + '</td></tr>';
  const avisos = [];
  const anterior = Number(antes.price);
  if (r.cambios.price !== undefined && anterior > 0 && Math.abs(r.precio - anterior) / anterior >= 0.3) avisos.push('Revisa bien: el precio ' + (r.precio > anterior ? 'sube ' : 'baja ') + Math.round(Math.abs(r.precio - anterior) / anterior * 100) + '%.');
  if (r.cambios.quantity === 0) avisos.push('Con 0 piezas, Mercado Libre pausa la publicación.');
  return '<table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr><th></th><th style="padding:6px 8px">Antes</th><th style="padding:6px 0 6px 8px">Después</th></tr></thead><tbody>' +
    fila('Precio', pesos(antes.price), pesos(r.precio), r.cambios.price !== undefined) +
    fila('Piezas', String(Number(antes.available_quantity) || 0), String(r.cantidad), r.cambios.quantity !== undefined) +
    '</tbody></table>' + avisos.map(a => '<p style="margin-top:8px;color:#fbbf24">' + esc(a) + '</p>').join('');
}

async function enviarCambio(itemId, cambios) {
  const mlUserId = (window.obtenerMLUserId && await window.obtenerMLUserId()) || localStorage.getItem('ml_user_id');
  if (!mlUserId) throw new Error('Primero hay que conectar Mercado Libre.');
  let r;
  try {
    r = await window.fetch('/api/ml', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ action: 'sync', mlUserId, itemId }, cambios))
    });
  } catch (e) {
    throw new Error('No hay conexión. Revisa tu internet; antes de reintentar, mira en Mercado Libre si el cambio ya se aplicó.');
  }
  const j = await r.json().catch(() => ({}));
  if (j.error === 'token_expired') throw new Error('La conexión con Mercado Libre venció. Vuelve a conectarla en el módulo Mercado Libre.');
  if (!r.ok || j.error) throw new Error(j.error || 'No se pudo enviar el cambio (error ' + r.status + ').');
  return j.data || {};
}

// La lista en vivo es la más reciente; si aún no llega, la que está pintada
const enVivo = () => window._mlProductosEnVivo || [];

// Se ve el cambio de inmediato; la siguiente sincronización confirma lo que diga Mercado Libre
async function reflejar(itemId, cambios, item = {}) {
  const nuevos = {};
  // Manda lo que contestó Mercado Libre; si no lo trae, lo que se envió
  if (cambios.price !== undefined) nuevos.price = typeof item.price === 'number' ? item.price : cambios.price;
  if (cambios.quantity !== undefined) {
    nuevos.available_quantity = typeof item.available_quantity === 'number' ? item.available_quantity : cambios.quantity;
    if (typeof item.status === 'string') nuevos.status = item.status;
  }
  const base = enVivo().length ? enVivo() : publicaciones;
  publicaciones = base.map(p => (p.id === itemId ? Object.assign({}, p, nuevos) : p));
  if (window.renderProductosMLGrid && publicaciones.length) window.renderProductosMLGrid(publicaciones);
  const guardar = (coleccion, id, datos) => Promise.resolve()
    .then(() => window.updateDoc(window.doc(window.db, coleccion, id), datos))
    .catch(e => console.warn(coleccion + ':', e.message));
  await Promise.all([
    guardar('ml_productos', itemId, nuevos),
    // Se borra su huella para que la siguiente sincronización la reescriba con el dato real
    guardar('config', 'ml_firmas', { ['firmas.' + itemId]: '' })
  ]);
}

window.abrirSyncML = function (itemId, titulo, precio, cantidad) {
  const rol = window.currentRole || 'vendedor';
  if (window.mayaRoles && !window.mayaRoles.puedeModulo(rol, 'mercadolibre')) return aviso('Tu rol no puede cambiar publicaciones de Mercado Libre.', 'error');
  const lista = enVivo().concat(publicaciones);
  const antes = lista.find(p => p.id === itemId) || { id: itemId, title: titulo, price: precio, available_quantity: cantidad };

  const previa = document.getElementById('modal-sync-ml');
  if (previa) previa.remove();
  const v = document.createElement('div');
  v.id = 'modal-sync-ml';
  v.className = 'modal-overlay open';
  v.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-label="Cambiar en Mercado Libre" style="max-width:460px">' +
    '<div class="modal-head"><h3>Cambiar en Mercado Libre</h3><button type="button" class="modal-close" aria-label="Cerrar" data-ml-no>×</button></div>' +
    '<div class="modal-body"><p style="margin-bottom:14px;font-weight:600">' + esc(antes.title || itemId) + '</p>' +
    '<div class="form-group"><label for="ml-sync-precio">Precio (pesos)</label><input type="number" id="ml-sync-precio" inputmode="decimal" min="0.01" step="0.01" value="' + esc(antes.price) + '"></div>' +
    '<div class="form-group"><label for="ml-sync-cantidad">Piezas disponibles</label><input type="number" id="ml-sync-cantidad" inputmode="numeric" min="0" step="1" value="' + esc(antes.available_quantity) + '"></div>' +
    '<div data-ml-resumen aria-live="polite"></div><p data-ml-error role="alert" style="margin-top:10px;color:#f87171"></p></div>' +
    '<div class="modal-footer"><button type="button" class="btn btn-secondary" data-ml-no>Cancelar</button><button type="button" class="btn btn-primary" data-ml-si>Enviar a Mercado Libre</button></div></div>';

  const campoPrecio = v.querySelector('#ml-sync-precio'), campoCantidad = v.querySelector('#ml-sync-cantidad');
  const resumen = v.querySelector('[data-ml-resumen]'), error = v.querySelector('[data-ml-error]'), enviar = v.querySelector('[data-ml-si]');
  let enviando = false;
  const actualizar = () => {
    const r = revisar(antes, campoPrecio.value, campoCantidad.value);
    error.textContent = r.error || '';
    resumen.innerHTML = r.error ? '' : resumenHTML(antes, r);
    bloquear(!!r.error || !Object.keys(r.cambios).length);
  };
  // El botón apagado se tiene que notar
  const bloquear = si => { enviar.disabled = si; enviar.style.opacity = si ? '0.45' : ''; };
  const mandar = async () => {
    const r = revisar(antes, campoPrecio.value, campoCantidad.value);
    if (enviando || r.error || !Object.keys(r.cambios).length) return;
    enviando = true;
    bloquear(true);
    campoPrecio.disabled = campoCantidad.disabled = true;
    enviar.textContent = 'Enviando…';
    error.textContent = '';
    try {
      const item = await enviarCambio(itemId, r.cambios);
      v.remove();
      aviso('Cambio enviado a Mercado Libre', 'success');
      await reflejar(itemId, r.cambios, item);
    } catch (e) {
      console.error('Sync ML:', e);
      campoPrecio.disabled = campoCantidad.disabled = false;
      enviar.textContent = 'Enviar a Mercado Libre';
      bloquear(false);
      error.textContent = e.message;
      if (!v.isConnected) aviso(e.message, 'error');
    } finally {
      enviando = false;
    }
  };
  [campoPrecio, campoCantidad].forEach(c => {
    c.addEventListener('input', actualizar);
    c.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); mandar(); } });
  });
  enviar.addEventListener('click', mandar);
  v.addEventListener('click', e => { if (e.target === v || e.target.closest('[data-ml-no]')) v.remove(); });
  document.body.appendChild(v);
  actualizar();
};
// La versión anterior leía el token de ML en el navegador
window.syncInventarioML = async function (itemId, cantidad, precio) {
  try {
    const item = await enviarCambio(itemId, { quantity: cantidad, price: precio });
    aviso('Cambio enviado a Mercado Libre', 'success');
    await reflejar(itemId, { quantity: cantidad, price: precio }, item);
  } catch (e) { aviso(e.message, 'error'); }
};

// ── 3. Dar de baja usuarios ──
const enBaja = new Set();
async function bajaUsuario(id) {
  const u = ((window.data && window.data.usuarios) || []).find(x => x.id === id);
  if (!u || enBaja.has(id)) return;
  const yo = window.auth && window.auth.currentUser;
  if (!yo) return aviso('Inicia sesión de nuevo', 'error');
  if (u.uid === yo.uid) return aviso('No puedes darte de baja a ti mismo', 'error');
  const nombre = u.nombre || u.email || 'este usuario';
  const correo = u.email && u.email !== nombre ? ' (' + u.email + ')' : '';
  if (!window.confirm('¿Dar de baja a ' + nombre + correo + '?\n\nYa no podrá entrar al gestor ni usar Pepito o Claude. Sus notas y ventas se conservan.\nPara regresarle el acceso, créalo de nuevo con el mismo correo.')) return;
  enBaja.add(id);
  aviso('Dando de baja a ' + nombre + '…', 'info');
  try {
    const r = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await yo.getIdToken() },
      body: JSON.stringify({ accion: 'baja', id })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo dar de baja (error ' + r.status + ')');
    aviso(nombre + ' quedó dado de baja', 'success');
  } catch (e) {
    aviso(/failed to fetch|network/i.test(e.message) ? 'No hay conexión. Revisa tu internet e inténtalo de nuevo.' : e.message, 'error');
  } finally {
    enBaja.delete(id);
  }
}

// deleteItem lo define el script principal: se espera a que exista
for (let i = 0; i < 200 && !window.deleteItem; i++) await dormir(50);
const borrarOriginal = window.deleteItem;
if (typeof borrarOriginal === 'function') {
  window.deleteItem = function (coleccion, id) {
    return coleccion === 'usuarios' ? bajaUsuario(id) : borrarOriginal.apply(this, arguments);
  };
}
