// Abre el PDF de un enlace que mandó Pepito: gestor-maya.vercel.app/?pdf=nota_entrega:<id> | nota_venta:<id> | cotizacion:<id>
// Espera a que la persona tenga sesión y a que lleguen los datos, genera el PDF con las mismas funciones de la app
// y quita el parámetro de la dirección para que no se vuelva a descargar al recargar.
const FUNCIONES = {
  nota_entrega: { fn: 'generarNotaEntregaPDFById', lista: 'notasEntrega', nombre: 'nota de entrega' },
  nota_venta: { fn: 'descargarNotaPorId', lista: null, nombre: 'nota de venta' },
  cotizacion: { fn: 'generarCotizacionPDFById', lista: 'cotizaciones', nombre: 'cotización' }
};
const aviso = (m, t) => window.toast && window.toast(m, t || 'success');

function leerPedido() {
  let valor = null;
  try { valor = new URLSearchParams(location.search).get('pdf'); } catch (e) { return null; }
  if (!valor) return null;
  const [tipo, ...resto] = valor.split(':');
  const id = resto.join(':');
  return FUNCIONES[tipo] && id ? { tipo, id } : null;
}

function quitarParametro() {
  try {
    const u = new URL(location.href);
    u.searchParams.delete('pdf');
    history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
  } catch (e) { /* sin historial */ }
}

const esperar = (cond, ms) => new Promise(ok => {
  const inicio = Date.now();
  const t = setInterval(() => {
    let listo = false;
    try { listo = !!cond(); } catch (e) { listo = false; }
    if (listo || Date.now() - inicio > ms) { clearInterval(t); ok(listo); }
  }, 300);
});

async function abrir() {
  const p = leerPedido();
  if (!p) return;
  const f = FUNCIONES[p.tipo];
  // 1) Sesión iniciada (la app muestra #app cuando entra)
  const conSesion = await esperar(() => { const a = document.getElementById('app'); return a && getComputedStyle(a).display !== 'none' && typeof window[f.fn] === 'function'; }, 10 * 60 * 1000);
  if (!conSesion) return;
  aviso('Preparando el PDF de la ' + f.nombre + '…', 'info');
  // 2) Que el registro ya esté en los datos de la app (las notas de entrega y cotizaciones se leen en tiempo real)
  if (f.lista) {
    const hallado = await esperar(() => ((window.data && window.data[f.lista]) || []).some(x => x.id === p.id), 20000);
    if (!hallado) { aviso('No encontré esa ' + f.nombre + '. Puede que la hayan borrado o que tu rol no la vea.', 'error'); quitarParametro(); return; }
  }
  try {
    await window[f.fn](p.id);
  } catch (e) {
    aviso('No se pudo generar el PDF: ' + e.message, 'error');
  }
  quitarParametro();
}

abrir();
