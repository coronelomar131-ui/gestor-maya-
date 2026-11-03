// Maya Autopartes · capa de experiencia.
// Menú con módulos fijables por usuario, barra inferior y hoja "Más" en el teléfono, saludo y accesos en el Resumen,
// esqueletos de carga, tablas como tarjetas en el teléfono, íconos en lugar de emojis, ventanas y avisos animados y
// recorridos guiados por módulo. Corre después de los scripts de index.html y solo usa lo que ellos exponen en window.
import { icono } from './iconos.js';
import { BIENVENIDA, TUTORIALES } from './tutoriales.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const crear = (etiqueta, clase) => { const e = document.createElement(etiqueta); if (clase) e.className = clase; return e; };
const movimientoReducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const esTelefono = () => matchMedia('(max-width: 1023px)').matches;
const escapar = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Módulos. Los permisos son los mismos que showModule() en index.html: si cambian allá, cámbialos aquí ──
const MODULOS = [
  { id: 'dashboard', nombre: 'Resumen', corto: 'Resumen', icono: 'layout-dashboard', grupo: 'Principal', desc: 'Cómo va el negocio hoy' },
  { id: 'pepito', nombre: 'Pepito', corto: 'Pepito', icono: 'bot', grupo: 'Principal', desc: 'Pídele consultas y tareas a Pepito' },
  { id: 'notas-entrega', nombre: 'Notas de entrega', corto: 'Notas', icono: 'clipboard-check', grupo: 'Ventas', desc: 'Crea, busca y descarga notas de entrega' },
  { id: 'ventas', nombre: 'Ventas', corto: 'Ventas', icono: 'receipt', grupo: 'Ventas', desc: 'Registra ventas y da seguimiento a su estatus' },
  { id: 'cotizaciones', nombre: 'Cotizaciones', corto: 'Cotizar', icono: 'clipboard-list', grupo: 'Ventas', desc: 'Prepara cotizaciones para tus clientes' },
  { id: 'clientes', nombre: 'Clientes', corto: 'Clientes', icono: 'users', grupo: 'Ventas', desc: 'Directorio de clientes y datos fiscales' },
  { id: 'busqueda-ventas', nombre: 'Buscar ventas', corto: 'Buscar', icono: 'search', grupo: 'Ventas', desc: 'Encuentra ventas por siniestro, cliente o monto' },
  { id: 'documentos', nombre: 'Documentos', corto: 'Documentos', icono: 'folder-open', grupo: 'Ventas', desc: 'Notas de venta y facturas' },
  { id: 'inventario', nombre: 'Inventario', corto: 'Inventario', icono: 'package', grupo: 'Almacén', desc: 'Piezas, precios y existencias' },
  { id: 'proveedores', nombre: 'Proveedores', corto: 'Proveedores', icono: 'factory', grupo: 'Almacén', desc: 'Quién te surte y cómo contactarlo' },
  { id: 'mercadolibre', nombre: 'Mercado Libre', corto: 'Mercado L.', icono: 'store', grupo: 'Almacén', desc: 'Publicaciones, órdenes y alertas' },
  { id: 'entregas', nombre: 'Entregas', corto: 'Entregas', icono: 'truck', grupo: 'Logística', desc: 'Entregas a domicilio y su estatus' },
  { id: 'envios', nombre: 'Envíos', corto: 'Envíos', icono: 'send', grupo: 'Logística', desc: 'Paquetes enviados por paquetería' },
  { id: 'visitas-talleres', nombre: 'Visitas a talleres', corto: 'Visitas', icono: 'wrench', grupo: 'Logística', desc: 'Registro de visitas a talleres' },
  { id: 'reportes', nombre: 'Reportes', corto: 'Reportes', icono: 'chart-column', grupo: 'Administración', desc: 'Métricas y análisis del negocio' },
  { id: 'finanzas', nombre: 'Finanzas', corto: 'Finanzas', icono: 'wallet', grupo: 'Administración', desc: 'Préstamos y pagos' },
  { id: 'usuarios', nombre: 'Usuarios', corto: 'Usuarios', icono: 'user-cog', grupo: 'Administración', desc: 'Accesos y roles del equipo' },
  { id: 'configuracion', nombre: 'Configuración', corto: 'Ajustes', icono: 'settings', grupo: 'Administración', desc: 'Datos fiscales y ajustes generales' }
];
const PERMISOS = {
  dashboard: ['admin', 'vendedor', 'almacen'], pepito: ['admin', 'vendedor', 'almacen', 'entregas'], ventas: ['admin', 'vendedor'], inventario: ['admin', 'almacen'],
  clientes: ['admin', 'vendedor'], cotizaciones: ['admin', 'vendedor'], proveedores: ['admin', 'almacen'],
  entregas: ['admin', 'vendedor', 'almacen'], envios: ['admin', 'vendedor', 'almacen'], 'visitas-talleres': ['admin', 'vendedor', 'almacen'],
  reportes: ['admin'], mercadolibre: ['admin'], documentos: ['admin', 'vendedor'], 'notas-entrega': ['admin', 'vendedor', 'almacen'],
  'busqueda-ventas': ['admin', 'vendedor', 'almacen'], usuarios: ['admin'], finanzas: ['admin', 'vendedor', 'almacen'], configuracion: ['admin']
};
const FIJADOS_INICIALES = {
  admin: ['dashboard', 'pepito', 'notas-entrega', 'ventas', 'clientes', 'inventario', 'reportes'],
  vendedor: ['dashboard', 'pepito', 'notas-entrega', 'ventas', 'clientes', 'cotizaciones'],
  almacen: ['dashboard', 'pepito', 'notas-entrega', 'inventario', 'entregas', 'envios']
};
const MAX_FIJADOS = 8;
const EN_BARRA = 4;
const porId = id => MODULOS.find(m => m.id === id);
const rol = () => window.currentRole || 'vendedor';
const permitidos = () => MODULOS.filter(m => (PERMISOS[m.id] || []).includes(rol()));

// ── Preferencias por usuario: al instante en este dispositivo y en Firestore (preferencias/{uid}) para los demás ──
const prefs = { uid: null, datos: { fijados: null, tours: {}, editado: 0 } };
const claveLocal = uid => 'maya.diseno.v1.' + uid;
function leerLocal(uid) { try { return JSON.parse(localStorage.getItem(claveLocal(uid)) || 'null'); } catch (e) { return null; } }
function escribirLocal() { try { localStorage.setItem(claveLocal(prefs.uid), JSON.stringify(prefs.datos)); } catch (e) { /* modo privado */ } }
let temporizadorNube = null;
function guardarPrefs() {
  prefs.datos.editado = Date.now();
  escribirLocal();
  clearTimeout(temporizadorNube);
  temporizadorNube = setTimeout(() => {
    try {
      if (!window.setDoc || !window.doc || !window.db || !prefs.uid) return;
      window.setDoc(window.doc(window.db, 'preferencias', prefs.uid), {
        fijados: prefs.datos.fijados, tours: prefs.datos.tours, editado: prefs.datos.editado
      }, { merge: true }).catch(() => { /* sin permiso o sin cuota: se queda en este dispositivo */ });
    } catch (e) { /* idem */ }
  }, 1500);
}
async function traerPrefsNube(uid) {
  try {
    if (!window.getDoc || !window.doc || !window.db) return null;
    const s = await window.getDoc(window.doc(window.db, 'preferencias', uid));
    return s && s.exists() ? s.data() : null;
  } catch (e) { return null; }
}
function fijados() {
  const validos = new Set(permitidos().map(m => m.id));
  let lista = Array.isArray(prefs.datos.fijados) ? prefs.datos.fijados : (FIJADOS_INICIALES[rol()] || FIJADOS_INICIALES.vendedor);
  lista = lista.filter((id, i) => validos.has(id) && lista.indexOf(id) === i).slice(0, MAX_FIJADOS);
  return lista;
}
function alternarFijado(id) {
  const lista = fijados();
  const i = lista.indexOf(id);
  if (i >= 0) lista.splice(i, 1);
  else if (lista.length >= MAX_FIJADOS) { window.toast && window.toast('Puedes fijar hasta ' + MAX_FIJADOS + ' módulos. Quita uno para agregar otro.', 'info'); return; }
  else lista.push(id);
  prefs.datos.fijados = lista;
  guardarPrefs();
  pintarTodo();
}
const tourVisto = clave => !!(prefs.datos.tours && prefs.datos.tours[clave]);
function marcarTour(clave) { prefs.datos.tours = Object.assign({}, prefs.datos.tours, { [clave]: Date.now() }); guardarPrefs(); }

// ── Fechas y textos ──
function aFecha(v) {
  if (v == null || v === '') return null;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [a, m, d] = v.split('-').map(Number); return new Date(a, m - 1, d, 12); }
  const d = new Date(typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v);
  if (isNaN(d)) return null;
  // Ventas guarda medianoche UTC: se lee en UTC para no caer en el día anterior
  if (typeof v === 'number' && d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
  return d;
}
function saludo() {
  const h = new Date().getHours();
  return h < 5 ? 'Buenas noches' : h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
function nombreUsuario() {
  const t = ($('#user-name-display') || {}).textContent || '';
  const base = t.includes('@') ? t.split('@')[0] : t;
  const n = base.trim().split(/\s+/)[0] || '';
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : '';
}
function fechaLarga() {
  const t = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const ACRONIMOS = new Set(['RFC', 'IVA', 'ID', 'ML', 'NE', 'NV', 'PDF', 'CFDI', 'SAT', 'CP', 'URL', 'CURP']);
function aOracion(texto) {
  const t = texto.trim();
  if (!t || t !== t.toUpperCase() || !/[A-ZÁÉÍÓÚÑ]{3,}/.test(t)) return null;
  const palabras = t.split(/(\s+)/).map(w => (ACRONIMOS.has(w.replace(/[^A-ZÁÉÍÓÚÑ]/g, '')) ? w : w.toLowerCase()));
  const r = palabras.join('');
  return r.charAt(0).toUpperCase() + r.slice(1);
}

// ── Emojis → íconos de línea (botones, títulos, tarjetas del resumen y vacíos) ──
const EMOJI_ICONO = {
  '💰': 'receipt', '📦': 'package', '👥': 'users', '🚚': 'truck', '🛒': 'store', '📝': 'clipboard-check', '📋': 'clipboard-list',
  '📄': 'file-text', '📊': 'chart-column', '📈': 'chart-line', '📉': 'chart-line', '🔧': 'wrench', '⚙': 'settings', '🔍': 'search',
  '🔄': 'refresh-cw', '↻': 'refresh-cw', '🔗': 'link', '📥': 'download', '📤': 'upload', '⬇': 'download', '🗑': 'trash-2',
  '👁': 'eye', '✏': 'pencil', '💾': 'save', '🖨': 'printer', '📧': 'mail', '✕': 'x', '✖': 'x', '❌': 'x', '✅': 'check',
  '➕': 'plus', '💳': 'credit-card', '💵': 'banknote', '📅': 'calendar', '⏳': 'hourglass', 'ℹ': 'info', '⚠': 'triangle-alert',
  '📡': 'radio', '🔔': 'bell', '📷': 'camera', '📸': 'camera', '📁': 'folder', '🗂': 'folder', '🧾': 'receipt-text', '🔐': 'lock',
  '🏭': 'factory', '📱': 'phone', '📞': 'phone', '📍': 'map-pin', '👤': 'user', '🏆': 'chart-column', '👑': 'users', '💲': 'banknote'
};
const NOMBRE_ICONO = { 'trash-2': 'Eliminar', eye: 'Ver', pencil: 'Editar', download: 'Descargar', 'refresh-cw': 'Actualizar', x: 'Cerrar', printer: 'Imprimir' };
const RE_EMOJI = /^\s*((?:\p{Extended_Pictographic}|[✕✖↻])️?(?:‍\p{Extended_Pictographic}️?)*)\s*/u;
const plantilla = document.createElement('template');
function nodoIcono(nombre, tam) { plantilla.innerHTML = icono(nombre, tam); return plantilla.content.firstChild; }
function cambiarEmoji(elemento, tam) {
  if (elemento.firstElementChild && elemento.firstElementChild.classList.contains('m-icono')) return;
  const recorrido = document.createTreeWalker(elemento, NodeFilter.SHOW_TEXT);
  let nodo;
  while ((nodo = recorrido.nextNode())) if (nodo.nodeValue.trim()) break;
  if (!nodo) return;
  const m = RE_EMOJI.exec(nodo.nodeValue);
  if (!m) return;
  const nombre = EMOJI_ICONO[m[1].replace(/️/g, '')];
  if (!nombre) return;
  nodo.nodeValue = nodo.nodeValue.slice(m[0].length);
  nodo.parentNode.insertBefore(nodoIcono(nombre, tam), nodo);
  if (!elemento.textContent.trim()) {
    elemento.classList.add('m-solo-icono');
    if (!elemento.getAttribute('aria-label') && NOMBRE_ICONO[nombre]) { elemento.setAttribute('aria-label', NOMBRE_ICONO[nombre]); elemento.title = elemento.title || NOMBRE_ICONO[nombre]; }
  }
}
function cambiarMas(boton) {
  // "+ Nueva venta" → ícono de más + "Nueva venta"
  if (boton.firstElementChild && boton.firstElementChild.classList.contains('m-icono')) return;
  const primero = boton.firstChild;
  if (!primero || primero.nodeType !== 3 || !/^\s*\+\s/.test(primero.nodeValue)) return;
  primero.nodeValue = primero.nodeValue.replace(/^\s*\+\s*/, '');
  boton.insertBefore(nodoIcono('plus', 17), primero);
}
function pulirTextos(raiz) {
  $$('.btn, .tab-btn', raiz).forEach(b => { cambiarMas(b); cambiarEmoji(b, 17); });
  $$('input[placeholder]', raiz).forEach(i => { const p = i.getAttribute('placeholder'); const sin = p.replace(RE_EMOJI, ''); if (sin !== p) i.setAttribute('placeholder', sin); });
  $$('.table-title, .modal-head h3', raiz).forEach(t => cambiarEmoji(t, 19));
  $$('.stat-icon, .empty-icon', raiz).forEach(t => cambiarEmoji(t, 22));
  $$('th, label', raiz).forEach(t => {
    if (t.children.length) return;
    const o = aOracion(t.textContent);
    if (o) t.textContent = o;
  });
}

// ── Tablas de listas: en el teléfono cada renglón es una tarjeta con sus etiquetas ──
const TABLAS = ['ventas-body', 'notasfacturas-body', 'inv-body', 'cli-body', 'cot-body', 'notas-cot-body', 'prov-body', 'ne-body',
  'vt-body', 'ent-body', 'ml-ordenes-tbody', 'users-body', 'prestamos-body', 'pagos-body', 'envios-tabla'];
function etiquetarTabla(tbody) {
  const tabla = tbody.closest('table');
  if (!tabla) return;
  tabla.classList.add('m-tarjetas');
  const cab = $$('thead th', tabla).map(th => th.textContent.replace(/\s+/g, ' ').trim());
  const principal = Math.max(0, cab.findIndex(t => /cliente|raz[oó]n|descripci[oó]n|nombre|taller|destinatario|concepto/i.test(t)));
  const acciones = cab.findIndex(t => /acci[oó]n/i.test(t));
  $$(':scope > tr', tbody).forEach(tr => {
    const celdas = $$(':scope > td', tr);
    if (celdas.length === 1 && celdas[0].colSpan > 1) return;
    celdas.forEach((td, i) => {
      const etiqueta = cab[i] === '#' ? '' : (cab[i] || '');
      if (td.getAttribute('data-label') !== etiqueta) td.setAttribute('data-label', etiqueta);
      td.classList.toggle('m-principal', i === principal);
      td.classList.toggle('m-acciones', i === acciones);
      td.classList.toggle('m-ocultar-tel', cab[i] === '#');
    });
  });
}

// ── Esqueletos mientras llegan los datos (las listas que se llenan solas al entrar) ──
const ESQUELETOS = { 'ventas-body': 6, 'inv-body': 7, 'cli-body': 7, 'cot-body': 8, 'prov-body': 5, 'ne-body': 9, 'ent-body': 8, 'vt-body': 9, 'users-body': 4 };
const lineaEsq = '<div class="m-esq-linea corta"></div><div class="m-esq-linea media"></div>';
function ponerEsqueletos() {
  Object.entries(ESQUELETOS).forEach(([id, columnas]) => {
    const tb = document.getElementById(id);
    if (tb && tb.querySelector('.empty-state')) tb.innerHTML = Array.from({ length: 4 }, () => `<tr class="m-esq"><td colspan="${columnas}">${lineaEsq}</td></tr>`).join('');
  });
  ['dash-ventas-list', 'dash-entregas-list'].forEach(id => {
    const d = document.getElementById(id);
    if (d && d.querySelector('.empty-state')) d.innerHTML = Array.from({ length: 3 }, () => `<div class="m-esq" style="padding:14px 18px">${lineaEsq}</div>`).join('');
  });
}

// ── Menú lateral (PC) ──
let editandoMenu = false;
let actual = 'dashboard';
function filaMenu(m, fijado) {
  return `<div class="m-nav-fila" data-mod="${m.id}">
    <button type="button" class="m-nav-item" data-ir="${m.id}" title="${escapar(m.desc)}">${editandoMenu && fijado ? icono('grip-vertical', 17) : icono(m.icono, 19)}<span>${escapar(m.nombre)}</span></button>
    <button type="button" class="m-fijar" data-fijar="${m.id}" data-no-arrastrar aria-label="${fijado ? 'Quitar de fijados' : 'Fijar'}: ${escapar(m.nombre)}" title="${fijado ? 'Quitar de fijados' : 'Fijar arriba'}">${icono(fijado ? 'pin-off' : 'pin', 16)}</button>
  </div>`;
}
function agrupar(lista) {
  const grupos = new Map();
  lista.forEach(m => { if (!grupos.has(m.grupo)) grupos.set(m.grupo, []); grupos.get(m.grupo).push(m); });
  return Array.from(grupos.entries());
}
function pintarMenu() {
  const sidebar = $('#sidebar');
  if (!sidebar) return;
  const original = $('.sidebar-nav', sidebar);
  if (original) original.classList.add('m-oculta');
  let nav = $('.m-nav', sidebar);
  if (!nav) {
    nav = crear('nav', 'm-nav');
    nav.setAttribute('aria-label', 'Módulos');
    if (original) original.after(nav); else sidebar.appendChild(nav);
  }
  const fij = fijados();
  const resto = permitidos().filter(m => !fij.includes(m.id));
  nav.classList.toggle('editando', editandoMenu);
  nav.innerHTML = `
    <div class="m-nav-grupo">
      <div class="m-nav-titulo"><span>Fijados</span>${fij.length > 1 ? `<button type="button" data-accion="ordenar-menu">${editandoMenu ? 'Listo' : 'Ordenar'}</button>` : ''}</div>
      <div class="m-lista-fijados">${fij.map(id => filaMenu(porId(id), true)).join('') || '<div class="m-nav-vacio">Fija aquí los módulos que más usas.</div>'}</div>
    </div>
    ${agrupar(resto).map(([g, mods]) => `<div class="m-nav-grupo"><div class="m-nav-titulo"><span>${escapar(g)}</span></div>${mods.map(m => filaMenu(m, false)).join('')}</div>`).join('')}`;
  if (editandoMenu) hacerOrdenable($('.m-lista-fijados', nav), '.m-nav-fila', ordenarFijados);
  // Logo y texto de la marca
  const texto = $('.sidebar-logo-text', sidebar);
  if (texto && !texto.dataset.m) { texto.dataset.m = '1'; texto.innerHTML = '<h2>Maya</h2><span>Autopartes</span>'; }
  const salir = $('.btn-logout', sidebar);
  if (salir && !salir.dataset.m) { salir.dataset.m = '1'; salir.innerHTML = icono('log-out', 16) + '<span>Cerrar sesión</span>'; }
}

// ── Barra inferior y hoja "Más" (teléfono y tableta; en PC la hoja sale al centro) ──
function pintarBarra() {
  let barra = $('#m-tabbar');
  if (!barra) {
    barra = crear('nav');
    barra.id = 'm-tabbar';
    barra.setAttribute('aria-label', 'Módulos fijados');
    document.body.appendChild(barra);
  }
  barra.innerHTML = fijados().slice(0, EN_BARRA).map(id => {
    const m = porId(id);
    return `<button type="button" class="m-tab" data-ir="${m.id}">${icono(m.icono, 22)}<span>${escapar(m.corto)}</span></button>`;
  }).join('') + `<button type="button" class="m-tab" data-accion="abrir-hoja" aria-haspopup="dialog">${icono('layout-grid', 22)}<span>Más</span></button>`;
}
function pintarHoja() {
  let fondo = $('#m-hoja-fondo');
  let hoja = $('#m-hoja');
  if (!hoja) {
    fondo = crear('div');
    fondo.id = 'm-hoja-fondo';
    fondo.dataset.accion = 'cerrar-hoja';
    hoja = crear('div');
    hoja.id = 'm-hoja';
    hoja.setAttribute('role', 'dialog');
    hoja.setAttribute('aria-modal', 'true');
    hoja.setAttribute('aria-labelledby', 'm-hoja-titulo');
    document.body.append(fondo, hoja);
    arrastrarParaCerrar(hoja);
  }
  const fij = fijados();
  const nombre = escapar(($('#user-name-display') || {}).textContent || '');
  const papel = escapar(($('#user-role-display') || {}).textContent || '');
  hoja.innerHTML = `
    <div class="m-hoja-asa" aria-hidden="true"></div>
    <div class="m-hoja-cab"><h3 id="m-hoja-titulo">Módulos</h3><button type="button" class="m-btn-redondo" data-accion="cerrar-hoja" aria-label="Cerrar">${icono('x', 18)}</button></div>
    <div class="m-hoja-usuario">
      <span class="m-btn-redondo m-avatar" aria-hidden="true">${escapar((nombre || 'U').charAt(0).toUpperCase())}</span>
      <div><b>${nombre}</b><small>${papel}</small></div>
      <button type="button" class="btn-logout" data-accion="salir">${icono('log-out', 16)}<span>Salir</span></button>
    </div>
    ${agrupar(permitidos()).map(([g, mods]) => `<div class="m-hoja-grupo"><h4>${escapar(g)}</h4><div class="m-hoja-grid">${mods.map(m => `
      <div class="m-hoja-celda">
        <button type="button" class="m-hoja-mod${fij.includes(m.id) ? ' fijado' : ''}" data-ir="${m.id}">${icono(m.icono, 22)}<span>${escapar(m.nombre)}</span></button>
        <button type="button" class="m-pin" data-fijar="${m.id}" aria-label="${fij.includes(m.id) ? 'Quitar de fijados' : 'Fijar'}: ${escapar(m.nombre)}" title="${fij.includes(m.id) ? 'Quitar de fijados' : 'Fijar'}">${icono('pin', 13)}</button>
      </div>`).join('')}</div></div>`).join('')}
    <p class="m-hoja-nota">Toca el alfiler para fijar un módulo. Los primeros ${EN_BARRA} aparecen en la barra de abajo del teléfono.</p>`;
  marcarActivo(actual);
}
let regresoFoco = null;
function abrirHoja() {
  pintarHoja();
  regresoFoco = document.activeElement;
  document.body.classList.add('m-hoja-abierta');
  document.documentElement.style.overflow = 'hidden';
  setTimeout(() => { const c = $('#m-hoja [data-accion="cerrar-hoja"]'); if (c) c.focus({ preventScroll: true }); }, 60);
}
function cerrarHoja() {
  if (!document.body.classList.contains('m-hoja-abierta')) return;
  document.body.classList.remove('m-hoja-abierta');
  document.documentElement.style.overflow = '';
  if (regresoFoco && regresoFoco.focus) regresoFoco.focus({ preventScroll: true });
}
// Arrastrar la hoja hacia abajo la cierra (sigue al dedo; cierra si se lanzó o pasó la mitad del camino)
function arrastrarParaCerrar(hoja) {
  let inicio = null, dy = 0, t0 = 0;
  hoja.addEventListener('pointerdown', e => {
    if (!esTelefono() || !e.target.closest('.m-hoja-asa, .m-hoja-cab') || e.target.closest('button')) return;
    inicio = e.clientY; dy = 0; t0 = performance.now();
    hoja.setPointerCapture(e.pointerId);
    hoja.style.transition = 'none';
  });
  hoja.addEventListener('pointermove', e => {
    if (inicio == null) return;
    const d = e.clientY - inicio;
    dy = d > 0 ? d : -Math.pow(-d, 0.6); // hacia arriba resiste
    hoja.style.transform = `translateY(${dy}px)`;
  });
  const fin = () => {
    if (inicio == null) return;
    const velocidad = dy / Math.max(1, performance.now() - t0);
    inicio = null;
    hoja.style.transition = '';
    hoja.style.transform = '';
    if (dy > hoja.offsetHeight * 0.35 || velocidad > 0.6) cerrarHoja();
  };
  hoja.addEventListener('pointerup', fin);
  hoja.addEventListener('pointercancel', fin);
}

// ── Barra superior: ayuda y avatar ──
function pintarBarraSuperior() {
  const barra = $('.topbar');
  if (!barra || $('.m-topbar-extra', barra)) return;
  const extra = crear('div', 'm-topbar-extra');
  extra.innerHTML = `<button type="button" class="m-btn-redondo" data-accion="ayuda" aria-label="Cómo usar este módulo" title="Cómo usar este módulo">${icono('circle-help', 20)}</button>
    <button type="button" class="m-btn-redondo m-avatar" data-accion="abrir-hoja" aria-label="Tu cuenta y módulos"></button>`;
  barra.appendChild(extra);
  actualizarAvatar();
}
function actualizarAvatar() {
  const a = $('.m-topbar-extra .m-avatar');
  if (a) a.textContent = (nombreUsuario() || 'U').charAt(0).toUpperCase();
}

// ── Resumen: saludo y accesos fijados (se ordenan arrastrando en modo Editar) ──
let editandoAccesos = false;
function datoDe(id) {
  const d = window.data || {};
  const hoy = new Date();
  const delMes = f => { const x = aFecha(f); return !!x && x.getMonth() === hoy.getMonth() && x.getFullYear() === hoy.getFullYear(); };
  const n = (lista, filtro) => (Array.isArray(lista) ? lista.filter(filtro).length : 0);
  let k = 0;
  switch (id) {
    case 'ventas': k = n(d.ventas, v => !/^cancel/i.test(v.estatus || '') && delMes(v.fecha || v.createdAt)); return k ? `${k} este mes` : '';
    case 'notas-entrega': k = n(d.notasEntrega, x => delMes(x.fecha || x.createdAt)); return k ? `${k} este mes` : '';
    case 'clientes': k = (d.clientes || []).length; return k ? `${k} registrados` : '';
    case 'inventario': k = n(d.productos, p => (Number(p.stock) || 0) <= (Number(p.stockMin) || 0)); return k ? `${k} con poco stock` : '';
    case 'entregas': k = n(d.entregas, e => (e.estatus || 'pending') === 'pending'); return k ? `${k} pendientes` : '';
    case 'cotizaciones': k = n(d.cotizaciones, c => (c.estatus || 'vigente') === 'vigente'); return k ? `${k} vigentes` : '';
    default: return '';
  }
}
function pintarResumen() {
  const mod = $('#mod-dashboard');
  if (!mod) return;
  let cab = $('.m-saludo', mod);
  if (!cab) { cab = crear('div', 'm-saludo'); mod.prepend(cab); }
  const nombre = nombreUsuario();
  cab.innerHTML = `<h2>${saludo()}${nombre ? ', ' + escapar(nombre) : ''}</h2><p>${fechaLarga()}</p>`;
  let acc = $('#m-accesos');
  if (!acc) { acc = crear('section', 'm-accesos'); acc.id = 'm-accesos'; acc.setAttribute('aria-label', 'Tus accesos'); cab.after(acc); }
  const fij = fijados().filter(id => id !== 'dashboard');
  acc.classList.toggle('editando', editandoAccesos);
  acc.innerHTML = `
    <div class="m-seccion-cab"><h3>Tus accesos</h3>
      <button type="button" class="m-enlace${editandoAccesos ? ' activo' : ''}" data-accion="editar-accesos">${icono(editandoAccesos ? 'check' : 'pencil', 15)}<span>${editandoAccesos ? 'Listo' : 'Editar'}</span></button></div>
    <div class="m-accesos-grid">
      ${fij.map(id => {
        const m = porId(id);
        const dato = datoDe(id);
        return `<div class="m-acceso-celda" data-mod="${m.id}">
          <button type="button" class="m-acceso" data-ir="${m.id}">
            <span class="m-acceso-icono">${icono(m.icono, 21)}</span>
            <span><b>${escapar(m.nombre)}</b><small>${escapar(dato || m.desc)}</small></span>
            <span class="m-acceso-mango" aria-hidden="true">${icono('grip-vertical', 16)}</span>
          </button>
          <button type="button" class="m-acceso-quitar" data-fijar="${m.id}" data-no-arrastrar aria-label="Quitar ${escapar(m.nombre)} de tus accesos" title="Quitar de tus accesos">${icono('x', 14)}</button>
        </div>`;
      }).join('')}
      <div class="m-acceso-celda"><button type="button" class="m-acceso m-agregar" data-accion="abrir-hoja"><span class="m-acceso-icono">${icono('plus', 21)}</span><span><b>Agregar</b><small>Fija otro módulo</small></span></button></div>
    </div>
    ${editandoAccesos ? '<p class="m-ayuda-fijar">Arrastra para cambiar el orden. La equis quita un acceso; con Agregar sumas otro.</p>' : ''}`;
  if (editandoAccesos) hacerOrdenable($('.m-accesos-grid', acc), '.m-acceso-celda[data-mod]', orden => ordenarFijados(['dashboard'].filter(x => fijados().includes(x)).concat(orden)));
}
let refresco = 0;
function refrescarDatosResumen() {
  if (refresco) return;
  refresco = requestAnimationFrame(() => {
    refresco = 0;
    $$('#m-accesos .m-acceso-celda[data-mod]').forEach(b => {
      const m = porId(b.dataset.mod);
      const s = $('small', b);
      if (m && s) s.textContent = datoDe(m.id) || m.desc;
    });
  });
}
function ordenarFijados(orden) {
  const actuales = fijados();
  const nuevo = orden.filter(id => actuales.includes(id));
  actuales.forEach(id => { if (!nuevo.includes(id)) nuevo.push(id); });
  prefs.datos.fijados = nuevo;
  guardarPrefs();
  pintarMenu();
  pintarBarra();
}

// ── Ordenar arrastrando: sigue al dedo 1:1 y los demás se acomodan con animación ──
let arrastreReciente = 0;
function hacerOrdenable(contenedor, selector, alTerminar) {
  if (!contenedor || contenedor.dataset.ordenable) return;
  contenedor.dataset.ordenable = '1';
  contenedor.addEventListener('pointerdown', e => {
    const item = e.target.closest(selector);
    if (!item || !contenedor.contains(item) || e.button > 0 || e.target.closest('[data-no-arrastrar]')) return;
    const lista = () => $$(selector, contenedor);
    const r0 = item.getBoundingClientRect();
    const agarre = { x: e.clientX - r0.left, y: e.clientY - r0.top };
    const inicio = { x: e.clientX, y: e.clientY };
    let moviendo = false;
    item.setPointerCapture(e.pointerId);
    const seguir = ev => {
      if (!moviendo) {
        if (Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) < 8) return; // umbral antes de decidir que es arrastre
        moviendo = true;
        item.classList.add('arrastrando');
      }
      ev.preventDefault();
      // Se compara contra la posición de cada elemento en el diseño (offset*), no contra donde se ve: mientras los
      // demás se acomodan con su animación, su rectángulo visible se mueve y el arrastrado rebotaría entre dos lugares.
      const padre = item.offsetParent || document.body;
      const pr = padre.getBoundingClientRect();
      const px = ev.clientX - pr.left - padre.clientLeft;
      const py = ev.clientY - pr.top - padre.clientTop;
      const debajo = lista().find(o => o !== item && px >= o.offsetLeft && px <= o.offsetLeft + o.offsetWidth && py >= o.offsetTop && py <= o.offsetTop + o.offsetHeight);
      if (debajo) {
        const antes = new Map(lista().map(x => [x, x.getBoundingClientRect()]));
        const todos = lista();
        if (todos.indexOf(item) < todos.indexOf(debajo)) debajo.after(item); else debajo.before(item);
        acomodar(antes, lista().filter(x => x !== item));
      }
      item.style.transform = 'none';
      const base = item.getBoundingClientRect();
      item.style.transform = `translate(${ev.clientX - agarre.x - base.left}px, ${ev.clientY - agarre.y - base.top}px) scale(1.03)`;
    };
    const soltar = () => {
      item.removeEventListener('pointermove', seguir);
      item.removeEventListener('pointerup', soltar);
      item.removeEventListener('pointercancel', soltar);
      if (!moviendo) return;
      const desde = item.style.transform;
      item.style.transform = '';
      item.classList.remove('arrastrando');
      if (!movimientoReducido()) item.animate([{ transform: desde }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
      arrastreReciente = Date.now();
      alTerminar(lista().map(x => x.dataset.mod));
    };
    item.addEventListener('pointermove', seguir);
    item.addEventListener('pointerup', soltar);
    item.addEventListener('pointercancel', soltar);
  });
}
function acomodar(antes, elementos) {
  if (movimientoReducido()) return;
  elementos.forEach(el => {
    const a = antes.get(el);
    if (!a) return;
    const d = el.getBoundingClientRect();
    const dx = a.left - d.left, dy = a.top - d.top;
    if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  });
}

// ── Navegación ──
function marcarActivo(id) {
  $$('[data-ir]').forEach(b => {
    const si = b.dataset.ir === id && !b.closest('#m-accesos');
    b.classList.toggle('activo', si);
    if (b.closest('#m-tabbar, .m-nav')) { if (si) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  });
}
function ir(id) {
  cerrarHoja();
  // Fuera del clic: showModule() usa event.currentTarget y aquí el clic se escucha en el documento
  setTimeout(() => { if (typeof window.showModule === 'function') window.showModule(id); }, 0);
}
function trasCambiarModulo(id) {
  actual = id;
  marcarActivo(id);
  const m = porId(id);
  if (m) {
    const t = $('#topbar-title'), s = $('#topbar-subtitle');
    if (t) t.textContent = m.nombre;
    if (s) s.textContent = m.desc;
    document.title = m.nombre + ' · Maya Autopartes';
  }
  if (id === 'dashboard') pintarResumen();
  window.scrollTo(0, 0);
  pulirTextos(document.getElementById('mod-' + id) || document.body);
  avisoTour(id);
}
function envolverFunciones() {
  const mostrar = window.showModule;
  if (typeof mostrar === 'function' && !mostrar.__maya) {
    const envuelta = function () {
      const r = mostrar.apply(this, arguments);
      const activo = $('.module-view.active');
      trasCambiarModulo(activo ? activo.id.replace(/^mod-/, '') : arguments[0]);
      return r;
    };
    envuelta.__maya = true;
    window.showModule = envuelta;
  }
  // Las ventanas se van por donde llegaron (y abrir otra vez cancela el cierre en curso)
  const abrir = window.openModal, cerrar = window.closeModal;
  if (typeof abrir === 'function' && !abrir.__maya) {
    window.openModal = function (id) {
      const o = document.getElementById(id);
      if (o) o.classList.remove('m-cerrando');
      quitarAviso();
      const r = abrir.apply(this, arguments);
      if (o) pulirTextos(o);
      return r;
    };
    window.openModal.__maya = true;
  }
  if (typeof cerrar === 'function' && !cerrar.__maya) {
    window.closeModal = function (id) {
      const o = document.getElementById(id);
      if (!o || !o.classList.contains('open') || movimientoReducido()) return cerrar.apply(this, arguments);
      o.classList.add('m-cerrando');
      setTimeout(() => { if (o.classList.contains('m-cerrando')) { o.classList.remove('m-cerrando'); cerrar.call(window, id); } }, 200);
    };
    window.closeModal.__maya = true;
  }
  // Avisos con ícono de línea, sin el emoji repetido al principio del texto
  window.toast = function (mensaje, tipo = 'info') {
    const caja = document.getElementById('toast-container');
    if (!caja) return;
    const t = crear('div', 'toast ' + tipo);
    t.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
    t.innerHTML = icono({ success: 'circle-check', error: 'circle-x' }[tipo] || 'info', 18) + '<span></span>';
    t.lastChild.innerHTML = String(mensaje == null ? '' : mensaje).replace(RE_EMOJI, '');
    caja.appendChild(t);
    setTimeout(() => {
      if (movimientoReducido() || !t.animate) { t.remove(); return; }
      t.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(0.98)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).finished.then(() => t.remove(), () => t.remove());
    }, 3400);
  };
}

// ── Recorridos ──
let tour = null;
let temporizadorAviso = null;
function visible(e) {
  const r = e.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const cs = getComputedStyle(e);
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
}
function ancestroComun(a, b) { let x = a; while (x && !x.contains(b)) x = x.parentElement; return x; }
function objetivoDe(paso) {
  if (!paso.el) return null;
  for (const s of (Array.isArray(paso.el) ? paso.el : [paso.el])) {
    const candidato = $$(s).find(visible);
    if (!candidato) continue;
    if (paso.junto) { const otro = $$(paso.junto).find(visible); if (otro) return ancestroComun(candidato, otro) || candidato; }
    return candidato;
  }
  return null;
}
function iniciarTour(def, clave) {
  terminarTour(false);
  quitarAviso();
  cerrarHoja();
  const pasos = def.pasos.filter(p => !p.el || objetivoDe(p));
  if (!pasos.length) { window.toast && window.toast('Este módulo todavía no tiene recorrido.', 'info'); return; }
  const raiz = crear('div', 'm-tour');
  raiz.innerHTML = '<div class="m-tour-bloqueo"></div><div class="m-tour-foco"></div><div class="m-tour-pop" role="dialog" aria-modal="true" aria-labelledby="m-tour-titulo"></div>';
  document.body.appendChild(raiz);
  tour = { def, clave, pasos, i: 0, raiz, foco: $('.m-tour-foco', raiz), pop: $('.m-tour-pop', raiz), regreso: document.activeElement };
  tour.pop.addEventListener('click', e => {
    const b = e.target.closest('[data-tour]');
    if (!b) return;
    if (b.dataset.tour === 'siguiente') pasoTour(1);
    else if (b.dataset.tour === 'atras') pasoTour(-1);
    else terminarTour(true);
  });
  window.addEventListener('resize', reubicarTour);
  window.addEventListener('scroll', reubicarTour, true);
  document.addEventListener('keydown', teclaTour);
  pintarPaso();
}
function pasoTour(d) {
  if (!tour) return;
  const i = tour.i + d;
  if (i >= tour.pasos.length) return terminarTour(true);
  if (i < 0) return;
  tour.i = i;
  pintarPaso();
}
function pintarPaso() {
  const p = tour.pasos[tour.i];
  const total = tour.pasos.length;
  const ultimo = tour.i === total - 1;
  tour.pop.innerHTML = `
    <div class="m-tour-paso">${escapar(tour.def.titulo)}: paso ${tour.i + 1} de ${total}</div>
    <h4 id="m-tour-titulo">${escapar(p.titulo)}</h4>
    <p>${p.texto}</p>
    <div class="m-tour-puntos" aria-hidden="true">${tour.pasos.map((_, k) => `<i class="${k === tour.i ? 'activo' : ''}"></i>`).join('')}</div>
    <div class="m-tour-acciones">
      <button type="button" class="m-saltar" data-tour="saltar">${ultimo ? 'Cerrar' : 'Saltar'}</button>
      ${tour.i > 0 ? '<button type="button" class="btn btn-secondary btn-sm" data-tour="atras">Atrás</button>' : ''}
      <button type="button" class="btn btn-primary btn-sm" data-tour="siguiente" style="width:auto">${ultimo ? 'Listo' : 'Siguiente'}</button>
    </div>`;
  const objetivo = objetivoDe(p);
  if (objetivo) objetivo.scrollIntoView({ block: 'center', inline: 'nearest' });
  requestAnimationFrame(() => { ubicarTour(objetivo); const b = $('[data-tour="siguiente"]', tour.pop); if (b) b.focus({ preventScroll: true }); });
}
function ubicarTour(objetivo) {
  if (!tour) return;
  const vw = innerWidth, vh = innerHeight, margen = 12, pad = 6;
  const pop = tour.pop;
  const pr = pop.getBoundingClientRect();
  const barra = $('#m-tabbar');
  const piso = esTelefono() && barra ? barra.getBoundingClientRect().top : vh;
  if (!objetivo) {
    tour.foco.classList.add('sin-objetivo');
    pop.style.left = Math.max(margen, (vw - pr.width) / 2) + 'px';
    pop.style.top = Math.max(margen, (vh - pr.height) / 2) + 'px';
    return;
  }
  tour.foco.classList.remove('sin-objetivo');
  const r = objetivo.getBoundingClientRect();
  const arriba = Math.max(r.top - pad, 4), abajo = Math.min(r.bottom + pad, vh - 4);
  Object.assign(tour.foco.style, { left: (r.left - pad) + 'px', top: arriba + 'px', width: (r.width + pad * 2) + 'px', height: Math.max(0, abajo - arriba) + 'px' });
  let top;
  if (abajo + 12 + pr.height <= piso - margen) top = abajo + 12;
  else if (arriba - 12 - pr.height >= margen) top = arriba - 12 - pr.height;
  else top = Math.max(margen, piso - pr.height - margen);
  const left = Math.max(margen, Math.min(vw - pr.width - margen, r.left + r.width / 2 - pr.width / 2));
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
}
let reubicando = 0;
function reubicarTour() {
  if (!tour || reubicando) return;
  reubicando = requestAnimationFrame(() => { reubicando = 0; if (tour) ubicarTour(objetivoDe(tour.pasos[tour.i])); });
}
function teclaTour(e) {
  if (!tour) return;
  if (e.key === 'Escape') terminarTour(true);
  else if (e.key === 'ArrowRight') pasoTour(1);
  else if (e.key === 'ArrowLeft') pasoTour(-1);
}
function terminarTour(marcar) {
  if (!tour) return;
  const t = tour;
  tour = null;
  window.removeEventListener('resize', reubicarTour);
  window.removeEventListener('scroll', reubicarTour, true);
  document.removeEventListener('keydown', teclaTour);
  if (marcar) {
    marcarTour(t.clave);
    if (t.clave === 'bienvenida') marcarTour('dashboard');
  }
  if (movimientoReducido() || !t.raiz.animate) t.raiz.remove();
  else t.raiz.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in' }).finished.then(() => t.raiz.remove(), () => t.raiz.remove());
  if (t.regreso && t.regreso.focus) t.regreso.focus({ preventScroll: true });
}
function quitarAviso() {
  clearTimeout(temporizadorAviso);
  $$('.m-aviso-tour').forEach(a => a.remove());
}
function avisoTour(id) {
  quitarAviso();
  const def = TUTORIALES[id];
  if (!def || tourVisto(id) || tour || !tourVisto('bienvenida')) return;
  temporizadorAviso = setTimeout(() => {
    if (actual !== id || tour || $('.modal-overlay.open')) return;
    const aviso = crear('div', 'm-aviso-tour');
    aviso.setAttribute('role', 'status');
    aviso.innerHTML = `${icono('sparkles', 18)}<span>¿Primera vez en <b>${escapar(def.titulo)}</b>?</span>
      <button type="button" class="btn btn-primary btn-sm" data-aviso="ver" style="width:auto">Ver recorrido</button>
      <button type="button" class="btn btn-secondary btn-sm" data-aviso="no">Ahora no</button>`;
    aviso.addEventListener('click', e => {
      const b = e.target.closest('[data-aviso]');
      if (!b) return;
      aviso.remove();
      if (b.dataset.aviso === 'ver') iniciarTour(def, id); else marcarTour(id);
    });
    document.body.appendChild(aviso);
    temporizadorAviso = setTimeout(() => aviso.remove(), 15000);
  }, 900);
}

// ── Clics de toda la capa (un solo escucha) ──
document.addEventListener('click', e => {
  const t = e.target.closest('[data-ir], [data-fijar], [data-accion]');
  if (!t) return;
  if (Date.now() - arrastreReciente < 350) { e.preventDefault(); e.stopPropagation(); return; }
  if (t.dataset.fijar) { e.preventDefault(); e.stopPropagation(); alternarFijado(t.dataset.fijar); return; }
  if (t.dataset.ir) { if (t.closest('.editando')) return; e.preventDefault(); ir(t.dataset.ir); return; }
  switch (t.dataset.accion) {
    case 'abrir-hoja': abrirHoja(); break;
    case 'cerrar-hoja': cerrarHoja(); break;
    case 'ayuda': TUTORIALES[actual] ? iniciarTour(TUTORIALES[actual], actual) : iniciarTour(BIENVENIDA, 'bienvenida'); break;
    case 'editar-accesos': editandoAccesos = !editandoAccesos; pintarResumen(); break;
    case 'ordenar-menu': editandoMenu = !editandoMenu; pintarMenu(); break;
    case 'salir': cerrarHoja(); if (typeof window.doLogout === 'function') window.doLogout(); break;
    default: break;
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('m-hoja-abierta')) cerrarHoja();
});

// ── Arranque ──
function pintarTodo() {
  pintarMenu();
  pintarBarra();
  pintarHoja();
  pintarBarraSuperior();
  if (actual === 'dashboard') pintarResumen();
  marcarActivo(actual);
}
let iniciado = false;
async function alMostrarApp() {
  const uid = (window.auth && window.auth.currentUser && window.auth.currentUser.uid) || 'sin-sesion';
  if (iniciado && prefs.uid === uid) return;
  iniciado = true;
  prefs.uid = uid;
  prefs.datos = Object.assign({ fijados: null, tours: {}, editado: 0 }, leerLocal(uid) || {});
  envolverFunciones();
  const activo = $('.module-view.active');
  actual = activo ? activo.id.replace(/^mod-/, '') : 'dashboard';
  pintarTodo();
  trasCambiarModulo(actual);
  actualizarAvatar();
  pulirTextos(document.getElementById('app'));
  TABLAS.forEach(id => { const tb = document.getElementById(id); if (tb) etiquetarTabla(tb); });
  // Un solo momento orquestado al entrar
  if (!movimientoReducido()) { document.body.classList.add('m-revelar'); setTimeout(() => document.body.classList.remove('m-revelar'), 1100); }
  // Preferencias guardadas desde otro dispositivo
  const nube = await traerPrefsNube(uid);
  if (nube && (nube.editado || 0) > (prefs.datos.editado || 0)) {
    prefs.datos = { fijados: Array.isArray(nube.fijados) ? nube.fijados : prefs.datos.fijados, tours: Object.assign({}, nube.tours, prefs.datos.tours), editado: nube.editado };
    escribirLocal();
    pintarTodo();
  }
  if (!tourVisto('bienvenida')) setTimeout(() => { if (!tour && actual === 'dashboard') iniciarTour(BIENVENIDA, 'bienvenida'); }, 1300);
}

// Cambios del DOM: íconos, etiquetas de tablas y datos del resumen, agrupados por cuadro de animación
const pendientes = new Set();
let cuadro = 0;
const observador = new MutationObserver(registros => {
  registros.forEach(r => {
    if (r.target.nodeType === 1) pendientes.add(r.target);
    r.addedNodes.forEach(n => { if (n.nodeType === 1) pendientes.add(n); });
  });
  if (!cuadro) cuadro = requestAnimationFrame(() => {
    cuadro = 0;
    const nodos = Array.from(pendientes);
    pendientes.clear();
    let tocarResumen = false;
    nodos.forEach(n => {
      if (!n.isConnected || n.closest('.m-tour, #m-hoja, #m-tabbar, .m-nav')) return;
      pulirTextos(n);
      const tb = n.matches('tbody') ? n : n.closest('tbody');
      if (tb && TABLAS.includes(tb.id)) etiquetarTabla(tb);
      if (n.closest('#mod-dashboard')) tocarResumen = true;
    });
    if (tocarResumen) refrescarDatosResumen();
  });
});

function vigilarApp() {
  const app = document.getElementById('app');
  if (!app) return;
  const revisar = () => {
    const visibleApp = getComputedStyle(app).display !== 'none';
    if (visibleApp) alMostrarApp();
    else if (iniciado) { iniciado = false; terminarTour(false); quitarAviso(); cerrarHoja(); }
  };
  new MutationObserver(revisar).observe(app, { attributes: true, attributeFilter: ['style', 'class'] });
  observador.observe(app, { childList: true, subtree: true });
  revisar();
}

const estado = $('.m-carga-estado');
if (estado) estado.textContent = 'Revisando tu sesión…';
// Logo transparente en lugar del JPG con fondo oscuro (carga, login y menú)
$$('#loading-logo, .login-logo img, .sidebar-logo img').forEach(img => { img.src = '/diseno/logo-maya.png'; img.style.filter = ''; });
ponerEsqueletos();
pulirTextos(document.getElementById('login-screen') || document.body);
$$('.modal-overlay').forEach(m => pulirTextos(m));
vigilarApp();
