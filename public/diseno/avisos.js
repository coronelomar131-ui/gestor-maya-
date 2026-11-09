// Campanita de avisos del gestor y avisos al momento.
// - Cada persona tiene sus últimos 30 avisos en avisos_usuario/{uid} (resumen diario, alarmas de Pepito, avisos al momento);
//   se escucha ese único documento, así cada aviso nuevo cuesta una lectura.
// - window.mayaAvisar(evento, datos) le avisa al servidor de un cambio (nota nueva, etapa, factura, pago) para que
//   /api/avisos les mande el aviso a quien le toca. Si falla, no interrumpe lo que la persona estaba haciendo.
// - Preferencias de cada quien en su perfil: usuarios/{id}.avisos = { whatsapp, resumen, momento }.
import { icono } from './iconos.js';

const $ = (s, r = document) => r.querySelector(s);
const escapar = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// El texto viene con el formato de WhatsApp (*negritas*): aquí se ve igual
const formato = s => escapar(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
const hace = t => {
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.round(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  return new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) + ' · ' + new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
};
const ICONO = { resumen: 'sun', momento: 'bell', alarma: 'clock', grupo: 'users' };
const PREFS = [
  ['whatsapp', 'También por WhatsApp', 'Si tu número está registrado en Usuarios'],
  ['resumen', 'Resumen de cada mañana', 'Lo de tu rol: ventas, por preparar, en camino, por cobrar'],
  ['momento', 'Avisos al momento', 'Nota nueva, pieza en camino o entregada, factura y pagos']
];

let estado = { lista: [], visto: 0 };
let quitar = null;
let uid = null;
let abierto = false;
const inicio = Date.now();

async function llamarApi(evento, datos) {
  const u = window.auth && window.auth.currentUser;
  if (!u) throw new Error('Inicia sesión de nuevo');
  const token = await u.getIdToken();
  const r = await fetch('/api/avisos', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(Object.assign({ evento }, datos)) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) throw new Error(j.error || 'No se pudo (' + r.status + ')');
  return j;
}

// ── Avisos al momento ──
window.mayaAvisar = async function (evento, datos) {
  try { await llamarApi(evento, datos); } catch (e) { console.warn('avisos:', e.message); }
};

// ── Grupo Entregas y cobranza (los mensajes pasan por Pepito: le llegan a cada quien por WhatsApp y aquí) ──
let grupo = null;
async function cargarGrupo(evento = 'grupo_ver', datos) {
  const caja = $('.m-avisos-grupo');
  if (!caja) return;
  if (!grupo) caja.innerHTML = '<p class="m-avisos-tip">Cargando el grupo…</p>';
  try { grupo = await llamarApi(evento, datos); pintarGrupo(); return true; }
  catch (e) {
    if (window.toast) window.toast(e.message, 'error');
    if (!grupo) caja.innerHTML = '<p class="m-avisos-tip">No se pudo abrir el grupo: ' + escapar(e.message) + '</p>';
    return false;
  }
}
function pintarGrupo() {
  const caja = $('.m-avisos-grupo');
  if (!caja || !grupo) return;
  const g = grupo;
  const miembros = g.miembros.length ? g.miembros.map(m => escapar(m.nombre) + (m.whatsapp ? '' : ' <small>(sin WhatsApp)</small>')).join(', ') : 'Nadie todavía';
  let html = `<h4>${icono('users', 16)} ${escapar(g.grupo)}</h4><p class="m-avisos-tip">En el grupo: ${miembros}</p>`;
  if (g.soy_miembro) {
    html += `<form class="m-grupo-form"><textarea rows="2" maxlength="1500" placeholder="Escribe al grupo… (ej. ya salió la guía de la NE-245)" aria-label="Mensaje para el grupo"></textarea>
      <button type="submit" class="btn btn-primary btn-sm">Mandar</button></form>
      <p class="m-avisos-tip">Por WhatsApp: escríbele a Pepito empezando con <em>grupo:</em> y se lo pasa a los demás.</p>
      <ul class="m-grupo-mensajes">${g.mensajes.length ? g.mensajes.map(m => `<li><strong>${escapar(m.de)}</strong><p>${formato(m.texto)}</p><small>${hace(m.ts)}</small></li>`).join('') : '<li class="vacio"><p>Todavía no hay mensajes.</p></li>'}</ul>`;
  } else html += '<p class="m-avisos-tip">No estás en este grupo.' + (g.equipo ? '' : ' Pídele al admin que te agregue.') + '</p>';
  if (g.equipo) {
    const dentro = new Set(g.miembros.map(m => m.id));
    html += `<details class="m-grupo-admin"${g.miembros.length ? '' : ' open'}><summary>Quién está en el grupo (máximo 8)</summary>
      ${g.equipo.map(u => `<label class="m-avisos-pref"><span><strong>${escapar(u.nombre)}</strong><small>${escapar(u.rol)}${u.whatsapp ? '' : ' · sin WhatsApp registrado'}</small></span>
        <input type="checkbox" data-miembro="${escapar(u.id)}"${dentro.has(u.id) ? ' checked' : ''}></label>`).join('')}
      <button type="button" class="btn btn-secondary btn-sm m-grupo-guardar">Guardar miembros</button></details>`;
  }
  caja.innerHTML = html;
  const form = $('.m-grupo-form', caja);
  if (form) form.addEventListener('submit', async e => {
    e.preventDefault();
    const area = $('textarea', form);
    const texto = area.value.trim();
    if (!texto) return;
    const boton = $('button', form);
    boton.disabled = true;
    if (await cargarGrupo('grupo_mensaje', { texto })) { area.value = ''; if (window.toast) window.toast('Mandado al grupo', 'success'); }
    boton.disabled = false;
  });
  const guardar = $('.m-grupo-guardar', caja);
  if (guardar) guardar.addEventListener('click', async () => {
    const ids = [...caja.querySelectorAll('[data-miembro]:checked')].map(x => x.dataset.miembro);
    if (ids.length > 8) { if (window.toast) window.toast('Máximo 8 personas', 'error'); return; }
    guardar.disabled = true;
    if (await cargarGrupo('grupo_miembros', { miembros: ids }) && window.toast) window.toast('Grupo actualizado', 'success');
    guardar.disabled = false;
  });
}

// ── Campanita ──
const nuevos = () => estado.lista.filter(a => a.ts > (estado.visto || 0)).length;

function pintarBoton() {
  const b = $('.m-campana');
  if (!b) return;
  const n = nuevos();
  b.querySelector('.m-campana-n').textContent = n > 9 ? '9+' : String(n);
  b.classList.toggle('con-nuevos', n > 0);
  b.setAttribute('aria-label', n ? 'Avisos: ' + n + ' sin ver' : 'Avisos');
}

function pintarPanel() {
  const p = $('.m-avisos-panel');
  if (!p) return;
  const perfil = window.miPerfil || {};
  const pr = Object.assign({ whatsapp: true, resumen: true, momento: true }, perfil.avisos || {});
  const visto = estado.vistoAntes || 0;
  p.querySelector('.m-avisos-lista').innerHTML = estado.lista.length
    ? estado.lista.map(a => `<li class="${a.ts > visto ? 'nuevo' : ''}">
        <span class="m-avisos-ico t-${escapar(a.tipo)}">${icono(ICONO[a.tipo] || 'bell', 16)}</span>
        <div><p>${formato(a.texto)}</p><small>${hace(a.ts)}</small></div></li>`).join('')
    : `<li class="vacio">${icono('bell', 22)}<p>Aquí te llegan el resumen de cada mañana, tus alarmas y los avisos de lo que pasa en el día.</p></li>`;
  p.querySelector('.m-avisos-prefs').innerHTML = PREFS.map(([k, t, d]) => `<label class="m-avisos-pref">
      <span><strong>${t}</strong><small>${k === 'whatsapp' && !perfil.whatsapp10 ? 'Primero registra tu WhatsApp en Usuarios' : d}</small></span>
      <input type="checkbox" role="switch" data-pref="${k}"${pr[k] ? ' checked' : ''}${k === 'whatsapp' && !perfil.whatsapp10 ? ' disabled' : ''}></label>`).join('') +
    '<p class="m-avisos-tip">⏰ Para una alarma, pídesela a Pepito: <em>"recuérdame mañana a las 10 cobrarle a LATAM"</em>.</p>';
}

async function marcarVisto() {
  if (!uid || !nuevos()) return;
  try { await window.setDoc(window.doc(window.db, 'avisos_usuario', uid), { visto: Date.now() }, { merge: true }); }
  catch (e) { console.warn('avisos: no se pudo marcar como visto', e.message); }
}

function abrir() {
  let p = $('.m-avisos-panel');
  if (!p) {
    p = document.createElement('div');
    p.className = 'm-avisos-panel m-vidrio';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Avisos');
    p.innerHTML = `<header><strong>Avisos</strong><button type="button" class="m-avisos-ajustes m-avisos-btn-grupo" aria-expanded="false">${icono('users', 16)} Grupo</button>
      <button type="button" class="m-avisos-ajustes m-avisos-btn-prefs" aria-expanded="false">${icono('settings', 16)} Preferencias</button>
      <button type="button" class="m-btn-redondo m-avisos-cerrar" aria-label="Cerrar">${icono('x', 18)}</button></header>
      <div class="m-avisos-grupo" hidden></div><div class="m-avisos-prefs" hidden></div><ul class="m-avisos-lista"></ul>`;
    document.body.appendChild(p);
    p.querySelector('.m-avisos-cerrar').addEventListener('click', cerrar);
    p.querySelector('.m-avisos-btn-prefs').addEventListener('click', e => {
      const prefs = p.querySelector('.m-avisos-prefs');
      prefs.hidden = !prefs.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!prefs.hidden));
    });
    p.querySelector('.m-avisos-btn-grupo').addEventListener('click', e => {
      const caja = p.querySelector('.m-avisos-grupo');
      caja.hidden = !caja.hidden;
      e.currentTarget.setAttribute('aria-expanded', String(!caja.hidden));
      if (!caja.hidden) cargarGrupo();
    });
    p.querySelector('.m-avisos-prefs').addEventListener('change', guardarPref);
  }
  estado.vistoAntes = estado.visto || 0;
  pintarPanel();
  requestAnimationFrame(() => p.classList.add('abierto'));
  abierto = true;
  marcarVisto();
}
function cerrar() {
  const p = $('.m-avisos-panel');
  if (p) p.classList.remove('abierto');
  abierto = false;
}

async function guardarPref(e) {
  const k = e.target.dataset.pref;
  const perfil = window.miPerfil;
  if (!k || !perfil || !perfil.id) return;
  const nuevas = Object.assign({ whatsapp: true, resumen: true, momento: true }, perfil.avisos || {}, { [k]: e.target.checked });
  try {
    await window.updateDoc(window.doc(window.db, 'usuarios', perfil.id), { avisos: nuevas });
    perfil.avisos = nuevas;
    if (window.toast) window.toast('Preferencias guardadas', 'success');
  } catch (err) {
    e.target.checked = !e.target.checked;
    if (window.toast) window.toast('No se pudieron guardar: ' + err.message, 'error');
  }
}

function ponerBoton() {
  const extra = $('.m-topbar-extra');
  if (!extra || $('.m-campana', extra)) return !!extra;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'm-btn-redondo m-campana';
  b.title = 'Avisos';
  b.innerHTML = icono('bell', 20) + '<span class="m-campana-n" aria-hidden="true">0</span>';
  b.addEventListener('click', () => (abierto ? cerrar() : abrir()));
  extra.insertBefore(b, extra.firstChild);
  pintarBoton();
  return true;
}

function escuchar(nuevoUid) {
  if (uid === nuevoUid) return;
  if (quitar) { quitar(); quitar = null; }
  uid = nuevoUid;
  grupo = null;
  estado = { lista: [], visto: 0 };
  if (!uid) return;
  quitar = window.onSnapshot(window.doc(window.db, 'avisos_usuario', uid), snap => {
    const d = snap.exists() ? snap.data() : {};
    const antes = new Set(estado.lista.map(a => a.id));
    estado = Object.assign({}, estado, { lista: d.lista || [], visto: d.visto || 0 });
    // Lo que llega con el gestor abierto se anuncia con un toast
    estado.lista.filter(a => !antes.has(a.id) && a.ts > inicio).slice(0, 2).forEach(a => {
      if (window.toast) window.toast(String(a.texto).replace(/\*/g, '').split('\n')[0].slice(0, 120), 'info');
    });
    pintarBoton();
    if (abierto) {
      pintarPanel(); marcarVisto();
      const caja = $('.m-avisos-grupo');
      if (caja && !caja.hidden && estado.lista.some(a => !antes.has(a.id) && a.tipo === 'grupo')) cargarGrupo();
    }
  }, err => console.warn('avisos:', err.message));
}

document.addEventListener('keydown', e => { if (e.key === 'Escape' && abierto) cerrar(); });
document.addEventListener('pointerdown', e => {
  if (abierto && !e.target.closest('.m-avisos-panel') && !e.target.closest('.m-campana')) cerrar();
});

// Espera a que exista la barra de arriba y la sesión; sigue el cambio de cuenta
setInterval(() => {
  const u = window.auth && window.auth.currentUser;
  if (!window.db || !window.onSnapshot) return;
  if (!u) { escuchar(null); return; }
  if (ponerBoton()) escuchar(u.uid);
}, 1000);
