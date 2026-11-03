// Chat en vivo con Pepito Junior (API de Claude, api/pepito.js). Si la API no está configurada, el módulo
// Pepito se queda como buzón (diseno/buzon.js). La conversación vive en pepito_conversacion/{uid}, así que lo
// que se habla por WhatsApp también aparece aquí. Lo que Pepito quiere guardar sale como propuesta con botones.
import { icono } from './iconos.js';

const $ = (s, r = document) => r.querySelector(s);
const escapar = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hora = t => (t ? new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '');
const usuario = () => window.auth && window.auth.currentUser;
const aviso = (m, t) => window.toast && window.toast(m, t || 'success');

let conv = { mensajes: [], propuesta: null };
let quitar = null;
let uidActual = null;
let esperando = false;
let modelo = '';

// Texto con saltos de línea, **negritas** y viñetas simples; todo lo demás se escapa
function formato(t) {
  return escapar(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^[-•]\s+(.*)$/gm, '<span class="m-chat-vineta">$1</span>');
}

// Botón de PDF para lo que Pepito acaba de crear (nota, venta o cotización)
const PDF = { crear_nota_entrega: ['generarNotaEntregaPDFById', 'Nota de entrega'], crear_venta: ['descargarNotaPorId', 'Nota de venta'], crear_cotizacion: ['generarCotizacionPDFById', 'Cotización'] };
function adjunto(m) {
  if (!m.ejecutada || !PDF[m.ejecutada] || !m.resultado) return '';
  let r;
  try { r = JSON.parse(m.resultado); } catch (e) { return ''; }
  const c = r.creada && typeof r.creada === 'object' ? r.creada : r;
  const id = (typeof r.creada === 'string' && r.creada) || c.id || r.id;
  const folio = c.folio || r.folio || PDF[m.ejecutada][1];
  if (!id) return '';
  return `<button type="button" class="m-buzon-adjunto" data-pdf="${m.ejecutada}" data-id="${escapar(id)}">${icono('file-down', 16)}<span><strong>${escapar(folio)}</strong><small>Descargar PDF</small></span></button>`;
}

function vista() {
  const mod = $('#mod-pepito');
  if (!mod) return null;
  if (mod.dataset.listo === 'chat') return mod;
  mod.dataset.listo = 'chat';
  mod.innerHTML = `
    <div class="m-buzon m-chat">
      <section class="m-buzon-intro m-vidrio">
        <div class="m-buzon-avatar">${icono('bot', 26)}</div>
        <div>
          <h2>Pepito Junior</h2>
          <p>Pregúntale lo que necesites o pídele una tarea. Contesta al momento; si va a guardar algo, primero te pregunta.</p>
          <p class="m-buzon-estado" id="chat-estado"></p>
        </div>
      </section>
      <div class="m-chat-lista m-vidrio" id="chat-lista" aria-live="polite"></div>
      <form class="m-buzon-form m-vidrio" id="chat-form">
        <textarea id="chat-texto" rows="2" maxlength="4000" placeholder="Ej.: ¿Qué tengo pendiente de facturar de LATAM?" required></textarea>
        <div class="m-buzon-acciones">
          <span class="m-chat-sugerencias" id="chat-sugerencias"></span>
          <button type="submit" class="btn btn-primary" id="chat-enviar">${icono('send', 16)}<span>Enviar</span></button>
        </div>
      </form>
      <section class="m-chat-wa m-vidrio" id="chat-wa" hidden></section>
    </div>`;
  $('#chat-form', mod).addEventListener('submit', e => { e.preventDefault(); mandar($('#chat-texto').value); });
  $('#chat-texto', mod).addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(min-width: 768px)').matches) { e.preventDefault(); $('#chat-form').requestSubmit(); }
  });
  mod.addEventListener('click', e => {
    const s = e.target.closest('[data-sugerencia]');
    if (s) { $('#chat-texto').value = s.dataset.sugerencia; $('#chat-texto').focus(); return; }
    const c = e.target.closest('[data-confirmar]');
    if (c) return resolver(c.dataset.confirmar === 'si');
    const pdf = e.target.closest('[data-pdf]');
    if (pdf && PDF[pdf.dataset.pdf]) { const f = window[PDF[pdf.dataset.pdf][0]]; if (typeof f === 'function') f(pdf.dataset.id); return; }
    const g = e.target.closest('[data-wa]');
    if (g) return guardarWhatsApp(g.dataset.wa);
  });
  $('#chat-sugerencias', mod).innerHTML = ['¿Cuánto vendimos hoy?', '¿Qué falta por facturar?', '¿Quién nos debe?']
    .map(t => `<button type="button" class="m-chat-chip" data-sugerencia="${escapar(t)}">${escapar(t)}</button>`).join('');
  return mod;
}

function pintar() {
  const lista = $('#chat-lista');
  if (!lista) return;
  const msgs = conv.mensajes || [];
  let html = msgs.length ? msgs.map(m => `
    <div class="m-chat-msg ${m.de === 'pepito' ? 'pepito' : 'yo'}">
      ${m.de === 'pepito' ? `<div class="m-buzon-quien">${icono('bot', 14)} Pepito${m.canal === 'whatsapp' ? ' · WhatsApp' : ''}</div>` : m.canal === 'whatsapp' ? '<div class="m-chat-canal">por WhatsApp</div>' : ''}
      <div class="m-chat-burbuja">${formato(m.texto)}</div>
      ${adjunto(m)}
      <time>${hora(m.ts)}</time>
    </div>`).join('') : `<div class="m-buzon-vacio">${icono('bot', 28)}<p>Hola, soy Pepito Junior. ¿En qué te ayudo?</p></div>`;
  if (conv.propuesta) {
    html += `<div class="m-chat-propuesta">
      <strong>${icono('circle-alert', 15)} ¿Guardo esto? · ${escapar(conv.propuesta.titulo)}</strong>
      <div class="m-chat-botones">
        <button type="button" class="btn btn-secondary btn-sm" data-confirmar="no">No, cancelar</button>
        <button type="button" class="btn btn-primary btn-sm" data-confirmar="si">${icono('check', 14)}<span>Sí, guárdalo</span></button>
      </div></div>`;
  }
  if (esperando) html += `<div class="m-chat-msg pepito"><div class="m-chat-burbuja m-chat-pensando"><i></i><i></i><i></i></div></div>`;
  lista.innerHTML = html;
  lista.scrollTop = lista.scrollHeight;
  $('#chat-enviar').disabled = esperando;
  const est = $('#chat-estado');
  if (est) est.textContent = 'Conectado a la API de Claude' + (modelo ? ' (' + modelo + ')' : '') + '. También te contesta por WhatsApp si tu número está registrado.';
}

async function llamar(cuerpo) {
  const u = usuario();
  const token = await u.getIdToken();
  const r = await fetch('/api/pepito', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Pepito no pudo contestar');
  return d;
}

async function mandar(texto) {
  const t = String(texto || '').trim();
  if (!t || esperando) return;
  esperando = true;
  // Se muestra al momento; el listener trae la versión guardada
  conv = Object.assign({}, conv, { mensajes: (conv.mensajes || []).concat({ de: 'persona', texto: t, ts: Date.now() }) });
  $('#chat-texto').value = '';
  pintar();
  try { await llamar({ mensaje: t }); }
  catch (e) { aviso(e.message, 'error'); conv.mensajes = conv.mensajes.slice(0, -1); $('#chat-texto').value = t; }
  finally { esperando = false; pintar(); }
}

async function resolver(si) {
  if (!conv.propuesta || esperando) return;
  esperando = true;
  pintar();
  try { await llamar({ propuesta: conv.propuesta.id, confirmar: si }); }
  catch (e) { aviso(e.message, 'error'); }
  finally { esperando = false; pintar(); }
}

function escuchar() {
  const u = usuario();
  if (!u || uidActual === u.uid) return;
  uidActual = u.uid;
  if (quitar) quitar();
  quitar = window.onSnapshot(window.doc(window.db, 'pepito_conversacion', u.uid), s => {
    conv = s.exists() ? s.data() : { mensajes: [], propuesta: null };
    pintar();
  }, () => {});
}

// ── WhatsApp del equipo (solo admin): el número de cada quien en su perfil ──
function pintarWhatsApp() {
  const caja = $('#chat-wa');
  if (!caja) return;
  caja.hidden = window.currentRole !== 'admin';
  if (caja.hidden) return;
  const usuarios = (window.data && window.data.usuarios) || [];
  caja.innerHTML = `<header><strong>${icono('send', 15)} WhatsApp del equipo</strong><small>Pepito solo contesta a estos números. 10 dígitos.</small></header>
    ${usuarios.map(u => `<label class="m-chat-wa-fila"><span>${escapar(u.nombre || u.email)}<small>${escapar(u.rol || '')}</small></span>
      <input type="tel" inputmode="numeric" maxlength="14" placeholder="55 1234 5678" value="${escapar(u.whatsapp || '')}" data-wa-input="${escapar(u.id)}">
      <button type="button" class="btn btn-secondary btn-sm" data-wa="${escapar(u.id)}">Guardar</button></label>`).join('') || '<p class="m-op-nota">No hay usuarios.</p>'}`;
}

async function guardarWhatsApp(docId) {
  const input = document.querySelector(`[data-wa-input="${CSS.escape(docId)}"]`);
  const d = String(input.value || '').replace(/\D/g, '').slice(-10);
  if (input.value.trim() && d.length !== 10) return aviso('Escribe 10 dígitos', 'error');
  const repetido = ((window.data && window.data.usuarios) || []).find(u => u.id !== docId && u.whatsapp10 && u.whatsapp10 === d);
  if (d && repetido) return aviso('Ese número ya lo tiene ' + (repetido.nombre || repetido.email), 'error');
  try {
    await window.updateDoc(window.doc(window.db, 'usuarios', docId), { whatsapp: d, whatsapp10: d || null });
    aviso(d ? 'Número guardado' : 'Número quitado');
  } catch (e) { aviso('No se pudo guardar: ' + e.message, 'error'); }
}

async function activar() {
  let estado;
  try { estado = await (await fetch('/api/pepito')).json(); } catch (e) { return; }
  if (!estado || !estado.activo) return;
  window.__pepitoChat = true;
  modelo = estado.modelo || '';
  const mod = $('#mod-pepito');
  if (!mod) return;
  const abrir = () => { if (!mod.classList.contains('active')) return; vista(); escuchar(); pintar(); pintarWhatsApp(); };
  new MutationObserver(abrir).observe(mod, { attributes: true, attributeFilter: ['class'] });
  abrir();
}

activar();
