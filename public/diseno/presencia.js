// Quién está en línea. Cada sesión del gestor escribe presencia/{uid} cada minuto mientras la pantalla está a la vista
// (y una vez al esconderla o cerrarla); Pepito anota ahí cuándo le escribieron por WhatsApp. Solo Dirección lo lee:
// en Usuarios ve a cada integrante en línea, en segundo plano o desconectado, y su última vez por WhatsApp.
// Costo: ~60 escrituras por hora por persona conectada; Dirección lee solo los cambios.
import { icono } from './iconos.js';

const $ = (s, r = document) => r.querySelector(s);
const escapar = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CADA = 60000;              // latido
const EN_LINEA = 150000;         // sin latido en 2.5 min = ya no está
const SEGUNDO_PLANO = 4 * 3600000;
const VENTANA_WA = 24 * 3600000; // ventana de WhatsApp: le llegan avisos sin plantilla
const NOMBRES = { dashboard: 'Resumen', pepito: 'Pepito', oficina: 'Oficina', seguimiento: 'Seguimiento', 'notas-entrega': 'Notas', ventas: 'Ventas', cotizaciones: 'Cotizaciones', clientes: 'Clientes', 'busqueda-ventas': 'Buscar ventas', documentos: 'Documentos', entregas: 'Entregas', envios: 'Envíos', 'visitas-talleres': 'Visitas', inventario: 'Inventario', compras: 'Compras', proveedores: 'Proveedores', mercadolibre: 'Mercado Libre', facturacion: 'Facturación', cobranza: 'Cobranza', reportes: 'Reportes', usuarios: 'Usuarios', finanzas: 'Finanzas', configuracion: 'Configuración' };

const hace = t => {
  if (!t) return 'nunca';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.round(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  return new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ', ' + new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};

// ── Latido de esta sesión ──
let uid = null, timer = null;
const dispositivo = () => (matchMedia('(max-width: 760px)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'teléfono' : 'computadora');
function latir(visible) {
  if (!uid || !window.setDoc) return;
  const yo = ((window.data && window.data.usuarios) || []).find(u => u.uid === uid) || {};
  window.setDoc(window.doc(window.db, 'presencia', uid), {
    uid, nombre: yo.nombre || ($('#user-name-display') || {}).textContent || '', rol: window.currentRole || '',
    gestor: Date.now(), visible, modulo: window.mayaModuloActual || '', dispositivo: dispositivo()
  }, { merge: true }).catch(() => {});
}
function arrancar() {
  const u = window.auth && window.auth.currentUser;
  if (!u || !window.db || !window.currentRole) return false;
  uid = u.uid;
  latir(!document.hidden);
  timer = setInterval(() => { if (!document.hidden) latir(true); }, CADA);
  document.addEventListener('visibilitychange', () => latir(!document.hidden));
  addEventListener('pagehide', () => latir(false));
  if (window.currentRole === 'admin') escuchar();
  return true;
}
const esperar = setInterval(() => { if (arrancar()) clearInterval(esperar); }, 3000);

// El módulo abierto, para decir "en Ventas"
const original = window.showModule;
if (typeof original === 'function') {
  window.showModule = function (n) { window.mayaModuloActual = n; if (uid && !document.hidden) latir(true); return original.apply(this, arguments); };
}

// ── Vista de Dirección (Usuarios) ──
let presencias = {};
function escuchar() {
  if (!window.onSnapshot) return;
  window.onSnapshot(window.collection(window.db, 'presencia'), s => {
    presencias = {};
    s.forEach(d => { presencias[d.id] = d.data(); });
    pintar();
  }, () => {});
  setInterval(pintar, 30000);
}

function estadoDe(p) {
  const ahora = Date.now();
  if (p && p.gestor && p.visible && ahora - p.gestor < EN_LINEA) return { clase: 'en-linea', txt: 'En línea' + (p.modulo && NOMBRES[p.modulo] ? ' · en ' + NOMBRES[p.modulo] : ''), orden: 0 };
  if (p && p.gestor && !p.visible && ahora - p.gestor < SEGUNDO_PLANO) return { clase: 'ausente', txt: 'Gestor abierto en segundo plano · ' + hace(p.gestor), orden: 1 };
  return { clase: 'fuera', txt: 'Desconectado · última vez ' + hace(p && p.gestor), orden: 2 };
}

function pintar() {
  const mod = $('#mod-usuarios');
  if (!mod || window.currentRole !== 'admin') return;
  let caja = $('#m-presencia', mod);
  if (!caja) {
    caja = document.createElement('section');
    caja.id = 'm-presencia';
    caja.className = 'm-presencia m-vidrio';
    const tarjeta = $('.table-card', mod);
    mod.insertBefore(caja, tarjeta || null);
  }
  const usuarios = ((window.data && window.data.usuarios) || []).filter(u => u.uid);
  const filas = usuarios.map(u => ({ u, p: presencias[u.uid], e: estadoDe(presencias[u.uid]) }))
    .sort((a, b) => a.e.orden - b.e.orden || ((b.p && b.p.gestor) || 0) - ((a.p && a.p.gestor) || 0));
  const enLinea = filas.filter(f => f.e.orden === 0).length;
  caja.innerHTML = `<header><h3>${icono('users', 16)} Equipo en línea</h3><span class="m-presencia-n">${enLinea} de ${filas.length} en el gestor ahora</span></header>
    <ul>${filas.map(({ u, p, e }) => {
      const wa = p && p.whatsapp;
      const waTxt = wa ? 'WhatsApp a Pepito ' + hace(wa) + (Date.now() - wa < VENTANA_WA ? ' · le llegan los avisos' : '') : (u.whatsapp10 ? 'No le ha escrito a Pepito' : 'Sin WhatsApp registrado');
      return `<li class="m-presencia-${e.clase}">
        <span class="m-presencia-punto" aria-hidden="true"></span>
        <span class="m-presencia-quien"><b>${escapar(u.nombre || u.email)}</b><small>${escapar((window.mayaRoles && window.mayaRoles.ROLES[u.rol] ? window.mayaRoles.ROLES[u.rol].nombre : u.rol) || '')}${p && p.dispositivo && e.orden < 2 ? ' · ' + escapar(p.dispositivo) : ''}</small></span>
        <span class="m-presencia-estado">${escapar(e.txt)}<small>${escapar(waTxt)}</small></span>
      </li>`;
    }).join('') || '<li class="m-presencia-fuera">Todavía no hay usuarios con cuenta.</li>'}</ul>`;
}
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-module="usuarios"], [onclick*="usuarios"]')) setTimeout(pintar, 50); });
window.mayaPintarPresencia = pintar;
