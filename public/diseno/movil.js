// Navegación en el teléfono: el botón Atrás cierra la ventana abierta o regresa al módulo anterior (en vez de sacarte
// de la app), y arreglos para que cada cosa responda al primer toque. No envuelve funciones: observa la pantalla.
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const tactil = () => matchMedia('(hover: none)').matches;

// ── 1. Qué hay abierto encima de la pantalla (de abajo hacia arriba) ──
const CAPAS = '.modal-overlay.open:not(.m-cerrando), body.m-hoja-abierta > #m-hoja, .m-op-dialogo, .m-video-tutorial, .m-tour:not(.saliendo), .m-avisos-panel.abierto';
const FIJAS = '#app, #loading, #login-screen, #m-tabbar, #m-hoja, #m-hoja-fondo, .m-tour, .m-op-dialogo, .m-video-tutorial, .m-avisos-panel, .modal-overlay, .toast-container, .sidebar-overlay';
// Ventanas viejas del script principal: un fondo fijo creado al vuelo, directo en la página
function esVentanaSuelta(e) {
  if (e.matches(FIJAS) || e.style.position !== 'fixed' || e.style.display === 'none') return false;
  const r = e.getBoundingClientRect();
  return r.width >= innerWidth * 0.95 && r.height >= innerHeight * 0.95 && !!e.querySelector('button');
}
function capas() {
  const lista = $$(CAPAS).concat(Array.from(document.body.children).filter(esVentanaSuelta)).filter(e => e.getClientRects().length);
  const z = e => Number(getComputedStyle(e).zIndex) || 0;
  return lista.sort((a, b) => z(a) - z(b)); // con la misma altura queda el orden de la página
}
const sigueAbierta = e => e.isConnected && (e.id === 'm-hoja' ? document.body.classList.contains('m-hoja-abierta') : capas().includes(e));

// Cierra tocando su propio botón de cerrar, así se respetan las protecciones (p. ej. "¿Descartar lo que capturaste?").
// Devuelve false si la persona decidió que se quede abierta.
function cerrarCapa(capa) {
  const propios = '.modal-close, [data-cv-no], [data-ml-no], .m-op-x, [data-video="cerrar"], [data-tour="saltar"], .m-avisos-cerrar, [data-accion="cerrar-hoja"], [data-cerrar]';
  const boton = $$(propios, capa).find(b => b.getClientRects().length) ||
    $$('button', capa).find(b => /(^|\s)(cancelar|cerrar)\s*$/i.test(b.textContent.trim()));
  if (boton) {
    if (boton.disabled) return false;
    const siguio = boton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    if (!sigueAbierta(capa)) return true;
    if (!siguio) return false;
  }
  if (capa.classList.contains('modal-overlay') && capa.id && window.closeModal) window.closeModal(capa.id);
  else if (capa.classList.contains('modal-overlay')) capa.classList.remove('open');
  else if (capa.style.position === 'fixed') capa.remove();
  return true;
}

// ── 2. Botón Atrás ──
// pila[pos] = entrada actual del historial: m = módulo, c = cuántas ventanas hay encima, y = por dónde iba la pantalla
let ingresos = 0;
const nuevaSesion = () => 'maya-' + Date.now().toString(36) + '-' + (ingresos++);
let sesion = nuevaSesion();
const descartadas = new Set(); // recorridos de cuentas que ya salieron
let pila = [];
let pos = 0;
let esperando = 0; // se pidió moverse en el historial y falta que llegue el aviso
const appVisible = () => { const a = document.getElementById('app'); return !!a && getComputedStyle(a).display !== 'none'; };
const moduloActual = () => { const m = $('.module-view.active'); return m ? m.id.replace(/^mod-/, '') : ''; };
const estadoDe = i => ({ maya: sesion, i, m: pila[i].m, c: pila[i].c });

const reemplazar = history.replaceState.bind(history);
// Otros módulos limpian la dirección con replaceState(null): no deben borrar la posición guardada
history.replaceState = function (estado, titulo, url) {
  const actual = history.state;
  if ((!estado || !estado.maya) && actual && actual.maya === sesion) estado = actual;
  return reemplazar(estado, titulo, url);
};
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

function agregar(m, c) {
  pila.length = pos + 1;
  pila.push({ m, c, y: 0 });
  pos += 1;
  history.pushState(estadoDe(pos), '');
}
function mover(pasos) {
  clearTimeout(esperando);
  // Si el navegador no contesta, no se queda trabado
  esperando = setTimeout(() => { esperando = 0; programar(); }, 1000);
  history.go(pasos);
}
// Al salir de la cuenta se olvida el recorrido: quien entre después empieza de cero
function olvidar() {
  descartadas.add(sesion);
  sesion = nuevaSesion();
  pila = []; pos = 0;
  clearTimeout(esperando); esperando = 0;
}
// Chrome se salta con Atrás lo que se agrega al historial antes de que la persona toque algo (p. ej. la bienvenida)
const yaToco = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
function sincronizar() {
  if (!appVisible()) { if (pila.length) olvidar(); return; }
  if (esperando) return;
  const m = moduloActual();
  if (!m) return;
  if (!pila.length) { pila = [{ m, c: 0, y: 0 }]; pos = 0; reemplazar(estadoDe(0), ''); }
  const n = capas().length;
  const e = pila[pos];
  // Se cerraron ventanas desde la pantalla, o se cambió de módulo desde una ventana: se quitan sus entradas
  const sobran = e.m !== m ? e.c : e.c - n;
  if (sobran > 0 && pos >= sobran) { mover(-sobran); return; }
  if (!yaToco()) return;
  if (e.m !== m) agregar(m, 0);
  while (pila[pos].c < n) agregar(m, pila[pos].c + 1);
}
let pendiente = 0;
function programar() {
  if (pendiente) return;
  pendiente = setTimeout(() => { pendiente = 0; sincronizar(); }, 0);
}

const puedeAbrir = m => !window.mayaRoles || window.mayaRoles.puedeModulo(window.currentRole || 'vendedor', m);
function volverA(entrada) {
  // Un módulo que este rol no puede abrir se cambia por el actual: si no, showModule() redirige y Atrás nunca saldría
  if (entrada.m && !puedeAbrir(entrada.m)) { entrada.m = moduloActual(); reemplazar(estadoDe(pos), ''); }
  if (!entrada.m || entrada.m === moduloActual() || typeof window.showModule !== 'function') { programar(); return; }
  const y = entrada.y || 0;
  // Fuera del popstate: showModule() usa el evento en curso
  setTimeout(() => {
    window.showModule(entrada.m);
    if (y) requestAnimationFrame(() => window.scrollTo(0, y));
    programar();
  }, 0);
}
window.addEventListener('popstate', ev => {
  const s = ev.state;
  if (!appVisible()) return;
  // Quedó de una cuenta que ya salió: se salta, para que Atrás no se sienta muerto
  if (s && descartadas.has(s.maya)) { history.back(); return; }
  if (!s || s.maya !== sesion) {
    // Entrada de antes de recargar la página: se regresa al módulo que guardaba
    const m = (s && s.m) || moduloActual();
    pila = [{ m, c: 0, y: 0 }]; pos = 0; reemplazar(estadoDe(0), '');
    volverA(pila[0]); return;
  }
  const antes = pos;
  pos = s.i;
  if (!pila[pos]) pila[pos] = { m: s.m, c: s.c, y: 0 };
  if (esperando) { clearTimeout(esperando); esperando = 0; programar(); return; }
  if (pos < antes) { // Atrás
    const abiertas = capas();
    if (!abiertas.length) return volverA(pila[pos]);
    const arriba = abiertas[abiertas.length - 1];
    setTimeout(() => {
      if (cerrarCapa(arriba)) programar();
      else mover(antes - pos); // dijo que no: la ventana se queda y el historial vuelve a donde estaba
    }, 0);
  } else volverA(pila[pos]);
});

// Por dónde iba cada módulo, para regresar al mismo lugar
window.addEventListener('scroll', () => {
  const e = pila[pos];
  if (e && !esperando && e.c === 0 && e.m === moduloActual() && !document.body.classList.contains('m-hoja-abierta')) e.y = window.scrollY;
}, { passive: true });

// ── 3. Cada toque cuenta ──
// iPhone: sin un escucha de toque, los botones no muestran que se están presionando
document.addEventListener('touchstart', () => {}, { passive: true });

// En pantallas táctiles el "pasar el cursor" se queda pegado después de tocar: se apagan esos estilos
const revisadas = new WeakSet();
function apagarHover() {
  if (!tactil()) return;
  const recorrer = reglas => {
    for (const r of reglas) {
      if (r.media && /hover\s*:\s*hover|pointer\s*:\s*fine/.test(r.media.mediaText)) continue;
      if (r.selectorText && r.selectorText.includes(':hover') && !r.selectorText.includes(':not(*):hover')) r.selectorText = r.selectorText.replace(/:hover/g, ':not(*):hover');
      if (r.cssRules && r.cssRules.length) recorrer(r.cssRules);
    }
  };
  for (const hoja of document.styleSheets) {
    if (revisadas.has(hoja)) continue;
    try { recorrer(hoja.cssRules); revisadas.add(hoja); } catch (e) { /* hoja de otro sitio (letras) */ }
  }
}

// Buscadores: el teclado muestra "Buscar" y al tocarlo se esconde para ver los resultados
const BUSCADOR = 'input.search-box, input[type=search], #doc-search-input, #inv-q, #ne-filter-cliente';
document.addEventListener('focusin', e => { if (e.target.matches && e.target.matches(BUSCADOR)) e.target.setAttribute('enterkeyhint', 'search'); });
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && tactil() && e.target.matches && e.target.matches(BUSCADOR)) setTimeout(() => e.target.blur(), 0);
});

// Los diálogos no deben abrir el teclado solos: tapa media pantalla antes de que la persona lea
function sinTecladoSolo(nodos) {
  if (!tactil()) return;
  const campo = document.activeElement;
  if (!campo || !/^(INPUT|TEXTAREA|SELECT)$/.test(campo.tagName)) return;
  if (nodos.some(n => n.nodeType === 1 && n.matches('.m-op-dialogo') && n.contains(campo))) campo.blur();
}

// Una ventana que se vuelve a abrir empieza desde arriba
const abiertasAntes = new WeakSet();
function ventanaArriba(e) {
  if (!e.classList.contains('modal-overlay')) return;
  if (!e.classList.contains('open')) { abiertasAntes.delete(e); return; }
  if (abiertasAntes.has(e)) return;
  abiertasAntes.add(e);
  [e, ...$$('.modal, .modal-body', e)].forEach(c => { c.scrollTop = 0; });
}

new MutationObserver(registros => {
  let interesa = false;
  for (const r of registros) {
    const t = r.target;
    if (r.type === 'attributes') {
      if (t === document.body || t.id === 'app' || t.matches('.module-view, .modal-overlay, .m-tour, .m-avisos-panel') || t.parentElement === document.body) { interesa = true; ventanaArriba(t); }
    } else if (t === document.body || (r.addedNodes.length + r.removedNodes.length && Array.from(r.addedNodes).concat(Array.from(r.removedNodes)).some(n => n.nodeType === 1 && n.matches('.modal-overlay, .m-op-dialogo')))) {
      interesa = true;
      sinTecladoSolo(Array.from(r.addedNodes));
      r.addedNodes.forEach(n => { if (n.nodeType === 1) ventanaArriba(n); });
    }
  }
  if (interesa) programar();
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });

// Lo que se quedó sin apuntar en el historial se apunta con el primer toque
['click', 'keydown'].forEach(t => window.addEventListener(t, programar));

window.addEventListener('load', apagarHover);
apagarHover();
setTimeout(apagarHover, 2500);
programar();
