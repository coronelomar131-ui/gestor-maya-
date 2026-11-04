// Chat en vivo con Pepito Junior (API de Claude, api/pepito.js). Si la API no está configurada, el módulo
// Pepito se queda como buzón (diseno/buzon.js). La conversación vive en pepito_conversacion/{uid}, así que lo
// que se habla por WhatsApp también aparece aquí. Lo que Pepito quiere guardar sale como propuesta con botones.
// Diseño: un "mostrador" de noche. El avatar de Pepito es un faro que barre mientras piensa; debajo de cada
// respuesta se ve qué consultó; las propuestas son un ticket que se sella al guardar.
import { icono } from './iconos.js';

const $ = (s, r = document) => r.querySelector(s);
const escapar = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TZ = 'America/Mexico_City';
const hora = t => (t ? new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '');
const diaDe = t => new Date(t).toLocaleDateString('en-CA', { timeZone: TZ });
const usuario = () => window.auth && window.auth.currentUser;
const aviso = (m, t) => window.toast && window.toast(m, t || 'success');
const quieto = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let conv = { mensajes: [], propuesta: null };
let quitar = null;
let uidActual = null;
let esperando = false;
let modelo = '';
let pensandoDesde = 0;
const sellados = new Set(); // mensajes "guardado" que ya mostraron su sello (la animación solo se ve una vez)

// Lo que Pepito consultó, con nombres que entiende el equipo
const CONSULTAS = {
  historial_notas: 'Notas', ver_nota: 'Nota', resumen_ventas: 'Resumen de ventas', buscar_ventas: 'Ventas', buscar_clientes: 'Clientes',
  buscar_productos: 'Inventario', buscar_productos_ml: 'Mercado Libre', buscar_registros: 'Registros', pendientes_facturar: 'Por facturar',
  cobranza: 'Cobranza', crear_nota_entrega: 'Nota de entrega', crear_venta: 'Nota de venta', crear_cotizacion: 'Cotización',
  cambiar_estatus_venta: 'Estatus de venta', guardar_cliente: 'Cliente', guardar_producto: 'Producto', guardar_entrega: 'Entrega',
  guardar_proveedor: 'Proveedor', eliminar_registro: 'Borrar registro', enviar_whatsapp: 'WhatsApp'
};

// Texto con saltos de línea, **negritas**, viñetas y montos en pesos resaltados; todo lo demás se escapa
function formato(t) {
  return escapar(t)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\$\s?\d[\d,]*(\.\d{1,2})?/g, m => '<span class="m-chat-monto">' + m + '</span>')
    .replace(/^[-•]\s+(.*)$/gm, '<span class="m-chat-vineta">$1</span>')
    .replace(/<\/span>\n(?=<span class="m-chat-vineta">)/g, '</span>');
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

function faro(clase) {
  return `<span class="m-faro ${clase || ''}" aria-hidden="true"><span class="m-faro-haz"></span><span class="m-faro-cara">${icono('bot', 20)}</span></span>`;
}

function vista() {
  const mod = $('#mod-pepito');
  if (!mod) return null;
  if (mod.dataset.listo === 'chat') return mod;
  mod.dataset.listo = 'chat';
  mod.innerHTML = `
    <div class="m-mostrador">
      <section class="m-mostrador-panel m-vidrio" aria-label="Chat con Pepito Junior">
        <header class="m-mostrador-cabeza">
          ${faro('')}
          <div>
            <h2>Pepito Junior</h2>
            <p id="chat-estado" aria-live="polite">Listo</p>
          </div>
        </header>
        <div class="m-mostrador-lista" id="chat-lista"></div>
        <form class="m-mostrador-escribir" id="chat-form">
          <div class="m-chat-sugerencias" id="chat-sugerencias"></div>
          <div class="m-mostrador-caja">
            <textarea id="chat-texto" rows="1" maxlength="4000" placeholder="Pregúntale o pídele algo a Pepito" aria-label="Mensaje para Pepito" required></textarea>
            <button type="submit" class="m-mostrador-enviar" id="chat-enviar" aria-label="Enviar">${icono('send', 18)}</button>
          </div>
        </form>
      </section>
      <details class="m-chat-wa m-vidrio" id="chat-wa" hidden>
        <summary>${icono('send', 15)} WhatsApp del equipo <small id="chat-wa-cuenta"></small></summary>
        <div id="chat-wa-lista"></div>
      </details>
    </div>`;
  const texto = $('#chat-texto', mod);
  $('#chat-form', mod).addEventListener('submit', e => { e.preventDefault(); mandar(texto.value); });
  texto.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(min-width: 768px)').matches) { e.preventDefault(); $('#chat-form').requestSubmit(); }
  });
  texto.addEventListener('input', crecer);
  mod.addEventListener('click', e => {
    const s = e.target.closest('[data-sugerencia]');
    if (s) { texto.value = s.dataset.sugerencia; crecer(); texto.focus(); return; }
    const c = e.target.closest('[data-confirmar]');
    if (c) return resolver(c.dataset.confirmar === 'si');
    const pdf = e.target.closest('[data-pdf]');
    if (pdf && PDF[pdf.dataset.pdf]) { const f = window[PDF[pdf.dataset.pdf][0]]; if (typeof f === 'function') f(pdf.dataset.id); return; }
    const g = e.target.closest('[data-wa]');
    if (g) return guardarWhatsApp(g.dataset.wa);
  });
  return mod;
}

function crecer() {
  const t = $('#chat-texto');
  if (!t) return;
  t.style.height = 'auto';
  t.style.height = Math.min(t.scrollHeight, 168) + 'px';
}

const SUGERENCIAS = ['¿Cuánto vendimos este mes?', '¿Qué falta por facturar?', '¿Quién nos debe?', 'Hazme una cotización'];

function pintarEstado() {
  const est = $('#chat-estado');
  const panel = $('.m-mostrador-panel');
  if (!est || !panel) return;
  panel.classList.toggle('pensando', esperando);
  if (esperando) {
    const s = (Date.now() - pensandoDesde) / 1000;
    est.textContent = s < 2.5 ? 'Pensando…' : s < 8 ? 'Revisando el gestor…' : 'Ya casi…';
  } else {
    est.textContent = 'Listo. También te contesto por WhatsApp.';
  }
}

function pintar() {
  const lista = $('#chat-lista');
  if (!lista) return;
  const msgs = conv.mensajes || [];
  let html = '';
  let dia = '';
  const hoy = diaDe(Date.now());
  const ayer = diaDe(Date.now() - 86400000);
  msgs.forEach((m, i) => {
    const d = diaDe(m.ts || Date.now());
    if (d !== dia) {
      dia = d;
      const txt = d === hoy ? 'Hoy' : d === ayer ? 'Ayer' : new Date(m.ts).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', timeZone: TZ });
      html += `<div class="m-chat-dia"><span>${txt}</span></div>`;
    }
    const wa = m.canal === 'whatsapp' ? `<span class="m-chat-canal">${icono('send', 11)} WhatsApp</span>` : '';
    if (m.de === 'pepito') {
      const consulto = [...new Set((m.herramientas || []).map(h => CONSULTAS[h]).filter(Boolean))];
      const clave = (m.ts || i) + ':' + (m.ejecutada || '');
      const sello = m.ejecutada && m.resultado ? `<span class="m-chat-sello${sellados.has(clave) ? '' : ' nuevo'}">${icono('check', 13)} Guardado</span>` : '';
      if (sello) sellados.add(clave);
      html += `<article class="m-chat-msg pepito">
        <div class="m-chat-texto">${formato(m.texto)}</div>
        ${adjunto(m)}
        <footer>${sello}${consulto.length ? `<span class="m-chat-consulto">Consultó ${consulto.map(c => `<b>${escapar(c)}</b>`).join(' ')}</span>` : ''}${wa}<time>${hora(m.ts)}</time></footer>
      </article>`;
    } else {
      html += `<article class="m-chat-msg yo"><div class="m-chat-texto">${formato(m.texto)}</div><footer>${wa}<time>${hora(m.ts)}</time></footer></article>`;
    }
  });
  if (!msgs.length) {
    html = `<div class="m-chat-bienvenida">
      ${faro('grande')}
      <h3>¿En qué te ayudo?</h3>
      <p>Consulto ventas, notas, inventario, facturación y cobranza. También preparo notas y cotizaciones; antes de guardar algo te pregunto.</p>
    </div>`;
  }
  if (conv.propuesta) {
    html += `<div class="m-chat-ticket" role="group" aria-label="Confirmar antes de guardar">
      <div class="m-chat-ticket-cabeza">${icono('circle-alert', 16)}<div><strong>Antes de guardar</strong><span>${escapar(conv.propuesta.titulo)}: revisa lo que Pepito te propuso arriba.</span></div></div>
      <div class="m-chat-ticket-botones">
        <button type="button" class="btn btn-secondary btn-sm" data-confirmar="no">Cancelar</button>
        <button type="button" class="btn btn-primary btn-sm" data-confirmar="si">${icono('check', 14)}<span>Guardar</span></button>
      </div>
    </div>`;
  }
  if (esperando) html += `<article class="m-chat-msg pepito m-chat-escribiendo" aria-label="Pepito está pensando"><div class="m-chat-texto"><span class="m-chat-linea"></span><span class="m-chat-linea corta"></span></div></article>`;
  lista.innerHTML = html;
  lista.scrollTo({ top: lista.scrollHeight, behavior: quieto() ? 'auto' : 'smooth' });
  $('#chat-enviar').disabled = esperando;
  $('#chat-sugerencias').innerHTML = msgs.length > 2 ? '' : SUGERENCIAS.map(t => `<button type="button" class="m-chat-chip" data-sugerencia="${escapar(t)}">${escapar(t)}</button>`).join('');
  pintarEstado();
}

async function llamar(cuerpo) {
  const u = usuario();
  const token = await u.getIdToken();
  const r = await fetch('/api/pepito', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Pepito no pudo contestar');
  return d;
}

let relojEstado = null;
function empezarEspera() {
  esperando = true;
  pensandoDesde = Date.now();
  clearInterval(relojEstado);
  relojEstado = setInterval(pintarEstado, 800);
}
function terminarEspera() {
  esperando = false;
  clearInterval(relojEstado);
}

async function mandar(texto) {
  const t = String(texto || '').trim();
  if (!t || esperando) return;
  empezarEspera();
  // Se muestra al momento; el listener trae la versión guardada
  conv = Object.assign({}, conv, { mensajes: (conv.mensajes || []).concat({ de: 'persona', texto: t, ts: Date.now() }) });
  $('#chat-texto').value = '';
  crecer();
  pintar();
  try { await llamar({ mensaje: t }); }
  catch (e) { aviso(e.message, 'error'); conv.mensajes = conv.mensajes.slice(0, -1); $('#chat-texto').value = t; crecer(); }
  finally { terminarEspera(); pintar(); }
}

async function resolver(si) {
  if (!conv.propuesta || esperando) return;
  empezarEspera();
  pintar();
  try { await llamar({ propuesta: conv.propuesta.id, confirmar: si }); }
  catch (e) { aviso(e.message, 'error'); }
  finally { terminarEspera(); pintar(); }
}

function escuchar() {
  const u = usuario();
  if (!u || uidActual === u.uid) return;
  uidActual = u.uid;
  if (quitar) quitar();
  let primera = true;
  quitar = window.onSnapshot(window.doc(window.db, 'pepito_conversacion', u.uid), s => {
    conv = s.exists() ? s.data() : { mensajes: [], propuesta: null };
    // Lo que ya estaba guardado al abrir no repite la animación del sello
    if (primera) {
      (conv.mensajes || []).forEach((m, i) => { if (m.de === 'pepito' && m.ejecutada) sellados.add((m.ts || i) + ':' + m.ejecutada); });
      primera = false;
    }
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
  const con = usuarios.filter(u => u.whatsapp10).length;
  $('#chat-wa-cuenta').textContent = con ? con + (con === 1 ? ' número registrado' : ' números registrados') : 'Nadie registrado todavía';
  $('#chat-wa-lista').innerHTML = `<p class="m-op-nota">Pepito solo contesta por WhatsApp a estos números (10 dígitos).</p>
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
