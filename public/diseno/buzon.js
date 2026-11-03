// Módulo "Pepito": buzón de pedidos del equipo. Cada quien deja su pedido aquí (colección buzon_pepito)
// y Pepito, conectado por el MCP de Maya con una cuenta admin, lo revisa y contesta. La respuesta aparece sola.
// Para no gastar lecturas de Firebase, solo se escuchan los pedidos propios (o los de todos, si un admin lo pide)
// y solo después de abrir el módulo.
import { icono } from './iconos.js';

const COLECCION = 'buzon_pepito';
const MOSTRAR = 40;
const $ = (s, r = document) => r.querySelector(s);
const escapar = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ms = f => (!f ? 0 : f.toMillis ? f.toMillis() : (new Date(f).getTime() || 0));
const hace = t => {
  if (!t) return '';
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return 'hace ' + min + ' min';
  const h = Math.round(min / 60);
  if (h < 24) return 'hace ' + h + ' h';
  return new Date(t).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

let pedidos = [];
let verTodos = false;
let quitar = null;
let quitarEstado = null;
let ultimaRevision = 0;
let respondiendoA = null;
let escuchandoUid = null;

const esAdmin = () => window.currentRole === 'admin';
const usuario = () => window.auth && window.auth.currentUser;

function vista() {
  const mod = $('#mod-pepito');
  if (!mod || mod.dataset.listo) return mod;
  mod.dataset.listo = '1';
  mod.innerHTML = `
    <div class="m-buzon">
      <section class="m-buzon-intro m-vidrio">
        <div class="m-buzon-avatar">${icono('bot', 26)}</div>
        <div>
          <h2>Pídele algo a Pepito</h2>
          <p>Escribe lo que necesitas: una consulta de ventas, buscar una nota, preparar una cotización… Pepito lo revisa y te contesta aquí mismo.</p>
          <p class="m-buzon-estado" id="buzon-estado">Revisando cuándo pasó Pepito…</p>
        </div>
      </section>
      <form class="m-buzon-form m-vidrio" id="buzon-form">
        <div class="m-buzon-respondiendo" id="buzon-respondiendo" hidden></div>
        <textarea id="buzon-texto" rows="3" maxlength="2000" placeholder="Ej.: ¿Cuánto le vendimos a Taller Ejemplo en octubre?" required></textarea>
        <div class="m-buzon-acciones">
          <label class="m-buzon-todos" id="buzon-todos-wrap" hidden><input type="checkbox" id="buzon-todos"> Ver los del equipo</label>
          <button type="submit" class="btn btn-primary" id="buzon-enviar">${icono('send', 16)}<span>Enviar a Pepito</span></button>
        </div>
      </form>
      <div class="m-buzon-lista" id="buzon-lista" aria-live="polite"></div>
    </div>`;
  $('#buzon-form', mod).addEventListener('submit', enviar);
  $('#buzon-texto', mod).addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#buzon-form').requestSubmit(); }
  });
  $('#buzon-todos', mod).addEventListener('change', e => { verTodos = e.target.checked; escuchar(); });
  $('#buzon-lista', mod).addEventListener('click', e => {
    const pdf = e.target.closest('[data-pdf]');
    if (pdf) return descargarAdjunto(pdf);
    const b = e.target.closest('[data-responder]');
    if (!b) return;
    const p = pedidos.find(x => x.id === b.dataset.responder);
    if (!p) return;
    respondiendoA = p;
    pintarRespondiendo();
    $('#buzon-texto').focus();
  });
  return mod;
}

function pintarRespondiendo() {
  const caja = $('#buzon-respondiendo');
  if (!caja) return;
  if (!respondiendoA) { caja.hidden = true; caja.innerHTML = ''; return; }
  caja.hidden = false;
  caja.innerHTML = `<span>${icono('reply', 14)} Respondiendo a: “${escapar(respondiendoA.texto.slice(0, 80))}${respondiendoA.texto.length > 80 ? '…' : ''}”</span>
    <button type="button" class="m-buzon-x" aria-label="Quitar">${icono('x', 14)}</button>`;
  $('.m-buzon-x', caja).onclick = () => { respondiendoA = null; pintarRespondiendo(); };
}

async function enviar(e) {
  e.preventDefault();
  const u = usuario();
  const campo = $('#buzon-texto');
  const texto = campo.value.trim();
  if (!u || !texto) return;
  const boton = $('#buzon-enviar');
  boton.disabled = true;
  try {
    const nombre = ($('#user-name-display') && $('#user-name-display').textContent.trim()) || u.email;
    const pedido = {
      texto, uid: u.uid, email: u.email || '', nombre, rol: window.currentRole || 'vendedor',
      estado: 'pendiente', createdAt: window.serverTimestamp()
    };
    if (respondiendoA) pedido.contexto = { id: respondiendoA.id, pregunta: respondiendoA.texto, respuesta: respondiendoA.respuesta || '' };
    await window.addDoc(window.collection(window.db, COLECCION), pedido);
    campo.value = '';
    respondiendoA = null;
    pintarRespondiendo();
    window.toast && window.toast('Listo, Pepito ya tiene tu pedido', 'success');
  } catch (err) {
    window.toast && window.toast('No se pudo enviar: ' + err.message, 'error');
  } finally {
    boton.disabled = false;
  }
}

function pintar() {
  const lista = $('#buzon-lista');
  if (!lista) return;
  const uid = usuario() && usuario().uid;
  const orden = pedidos.slice().sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, MOSTRAR);
  if (!orden.length) {
    lista.innerHTML = `<div class="m-buzon-vacio">${icono('inbox', 28)}<p>Todavía no hay pedidos. Escribe el primero arriba.</p></div>`;
    return;
  }
  lista.innerHTML = orden.map(p => {
    const mio = p.uid === uid;
    const pendiente = p.estado !== 'respondido';
    const etiqueta = pendiente
      ? `<span class="m-buzon-chip espera">${icono('clock', 13)} Esperando a Pepito</span>`
      : p.esperaConfirmacion
        ? `<span class="m-buzon-chip confirma">${icono('circle-alert', 13)} Pepito espera tu confirmación</span>`
        : `<span class="m-buzon-chip listo">${icono('check', 13)} Contestado ${escapar(hace(ms(p.respondidoAt)))}</span>`;
    return `
      <article class="m-buzon-hilo m-vidrio${pendiente ? ' pendiente' : ''}">
        <header>
          <strong>${mio ? 'Tú' : escapar(p.nombre || p.email || 'Alguien del equipo')}</strong>
          <span>${escapar(hace(ms(p.createdAt)))}</span>
          ${etiqueta}
        </header>
        ${p.contexto ? `<p class="m-buzon-contexto">${icono('reply', 13)} Sobre: “${escapar(String(p.contexto.pregunta || '').slice(0, 90))}”</p>` : ''}
        <p class="m-buzon-pedido">${escapar(p.texto)}</p>
        ${pendiente ? '' : `
          <div class="m-buzon-respuesta">
            <div class="m-buzon-quien">${icono('bot', 15)} Pepito</div>
            <p>${escapar(p.respuesta)}</p>
            ${adjuntos(p)}
            ${mio ? `<button type="button" class="btn btn-secondary btn-sm" data-responder="${escapar(p.id)}">${icono('reply', 14)}<span>${p.esperaConfirmacion ? 'Confirmar o corregir' : 'Responder'}</span></button>` : ''}
          </div>`}
      </article>`;
  }).join('');
}

// Notas y cotizaciones que Pepito mandó: el PDF se genera con las mismas funciones de la app
const PDF = {
  nota_entrega: { fn: 'generarNotaEntregaPDFById', nombre: 'Nota de entrega' },
  nota_venta: { fn: 'descargarNotaPorId', nombre: 'Nota de venta' },
  cotizacion: { fn: 'generarCotizacionPDFById', nombre: 'Cotización' }
};
function adjuntos(p) {
  const lista = (p.adjuntos || []).filter(a => PDF[a.tipo] && a.id);
  if (!lista.length) return '';
  return '<div class="m-buzon-adjuntos">' + lista.map(a =>
    `<button type="button" class="m-buzon-adjunto" data-pdf="${escapar(a.tipo)}" data-id="${escapar(a.id)}">${icono('file-down', 16)}<span><strong>${escapar(a.folio || PDF[a.tipo].nombre)}</strong><small>Descargar PDF</small></span></button>`
  ).join('') + '</div>';
}
function descargarAdjunto(b) {
  const f = PDF[b.dataset.pdf] && window[PDF[b.dataset.pdf].fn];
  if (typeof f !== 'function') return window.toast && window.toast('Ese documento no se puede descargar desde aquí', 'error');
  try { f(b.dataset.id); } catch (e) { window.toast && window.toast('No se pudo generar el PDF: ' + e.message, 'error'); }
}

function pintarEstado() {
  const el = $('#buzon-estado');
  if (!el) return;
  const pendientes = pedidos.filter(p => p.estado !== 'respondido' && p.uid === (usuario() && usuario().uid)).length;
  const paso = ultimaRevision ? 'Pepito revisó el buzón ' + hace(ultimaRevision) + '.' : 'Pepito todavía no ha revisado el buzón.';
  el.textContent = paso + (pendientes ? ' Tienes ' + pendientes + (pendientes === 1 ? ' pedido' : ' pedidos') + ' en espera; la respuesta aparece aquí sola.' : '');
}

function escuchar() {
  const u = usuario();
  if (!u || !window.onSnapshot) return;
  if (quitar) quitar();
  const base = window.collection(window.db, COLECCION);
  const q = verTodos && esAdmin() ? base : window.query(base, window.where('uid', '==', u.uid));
  quitar = window.onSnapshot(q, snap => {
    pedidos = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
    pintar();
    pintarEstado();
  }, err => {
    const lista = $('#buzon-lista');
    if (lista) lista.innerHTML = `<div class="m-buzon-vacio"><p>No se pudo cargar el buzón: ${escapar(err.message)}</p></div>`;
  });
  if (!quitarEstado) {
    quitarEstado = window.onSnapshot(window.doc(window.db, 'config', 'buzon_pepito'), s => {
      ultimaRevision = s.exists() ? ms(s.data().ultimaRevision) : 0;
      pintarEstado();
    }, () => {});
  }
}

function abrir() {
  if (window.__pepitoChat) return; // con la API de Claude configurada, el módulo es chat en vivo (pepito-chat.js)
  const mod = vista();
  if (!mod) return;
  const wrap = $('#buzon-todos-wrap', mod);
  if (wrap) wrap.hidden = !esAdmin();
  // Se vuelve a escuchar si cambió la sesión (cerrar sesión y entrar con otra cuenta sin recargar)
  const u = usuario();
  if (u && escuchandoUid !== u.uid) {
    escuchandoUid = u.uid;
    verTodos = false;
    const caja = $('#buzon-todos', mod);
    if (caja) caja.checked = false;
    if (quitarEstado) { quitarEstado(); quitarEstado = null; }
    escuchar();
  }
  pintarEstado();
}

// Se activa al abrir el módulo (showModule pone la clase "active")
function vigilar() {
  const mod = $('#mod-pepito');
  if (!mod) return;
  new MutationObserver(() => { if (mod.classList.contains('active')) abrir(); }).observe(mod, { attributes: true, attributeFilter: ['class'] });
  if (mod.classList.contains('active')) abrir();
  setInterval(pintarEstado, 60000);
}

vigilar();
