// PDF de notas y cotizaciones en el servidor, con EL MISMO código que usa la app (public/index.html).
// Se toma el texto de las funciones generarNotaEntregaPDF, generarNotaPDF y generarCotizacionPDFById del HTML y se
// corren con jsPDF para Node, con un "window" mínimo (datos de la nota, clientes y el logo). Así el PDF que llega por
// WhatsApp es idéntico al que se descarga en el gestor, y si alguien cambia el diseño en la app, cambia aquí también.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FUNCIONES = {
  nota_entrega: { inicio: 'window.generarNotaEntregaPDF = function', archivo: n => 'nota-entrega-' + (n.notaId || 'NE') + '.pdf' },
  nota_venta: { inicio: 'window.generarNotaPDF = async function', archivo: v => (v.notaId ? 'NV-' + v.notaId : 'nota-venta') + '.pdf' },
  cotizacion: { inicio: 'window.generarCotizacionPDFById = function', archivo: c => 'cotizacion-' + (c.notaId || c.id) + '.pdf' }
};

let html = null;
function htmlApp() {
  if (html) return html;
  const opciones = [path.join(__dirname, '..', 'public', 'index.html'), path.join(process.cwd(), 'public', 'index.html')];
  for (const p of opciones) { try { html = fs.readFileSync(p, 'utf8'); return html; } catch (e) { /* siguiente */ } }
  throw new Error('No encontré public/index.html para armar el PDF');
}

// Texto de la función: desde "window.x = function" hasta la primera línea que es solo "};"
const fuentes = {};
function fuente(tipo) {
  if (fuentes[tipo]) return fuentes[tipo];
  const h = htmlApp();
  const i = h.indexOf(FUNCIONES[tipo].inicio);
  if (i < 0) throw new Error('No encontré el generador de PDF de ' + tipo);
  const j = h.indexOf('\n};', i);
  fuentes[tipo] = h.slice(i, j + 3);
  return fuentes[tipo];
}

// El logo es la imagen JPEG embebida más grande del HTML (la misma que usa la app en sus PDF)
let logo = null;
function logoApp() {
  if (logo !== null) return logo;
  const m = htmlApp().match(/data:image\/jpeg;base64,[A-Za-z0-9+/=]+/g) || [];
  logo = m.sort((a, b) => b.length - a.length)[0] || '';
  return logo;
}

let jsPDFCargado = null;
function jsPDF() {
  if (jsPDFCargado) return jsPDFCargado;
  const lib = require('jspdf');
  require('jspdf-autotable');
  jsPDFCargado = lib.jsPDF;
  return jsPDFCargado;
}

// Firestore Admin entrega Timestamp con toDate(), igual que en el navegador; las fechas de texto se quedan igual
async function generar(tipo, registro, extra) {
  if (!FUNCIONES[tipo]) throw new Error('Tipo de PDF desconocido: ' + tipo);
  const Clase = jsPDF();
  let salida = null;
  // doc.save() en el navegador descarga; aquí se guarda en memoria
  const guardarOriginal = Clase.API.save;
  Clase.API.save = function () { salida = Buffer.from(this.output('arraybuffer')); return this; };
  const errores = [];
  const ventana = {
    jspdf: { jsPDF: Clase },
    data: Object.assign({ clientes: [], notasEntrega: [], ventas: [], cotizaciones: [] }, extra && extra.data),
    toast: (m, t) => { if (t === 'error') errores.push(m); },
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    doc: () => ({}), db: {}
  };
  const documento = { querySelector: s => (/logo/.test(s) && logoApp() ? { src: logoApp() } : null), getElementById: () => null };
  const contexto = vm.createContext({ window: ventana, document: documento, console: { log() {}, warn() {}, error: (...a) => errores.push(a.join(' ')) }, toast: ventana.toast, Date, Math, Intl, Number, String, Array, Object, JSON, parseFloat, parseInt, isNaN });
  try {
    vm.runInContext(fuente(tipo), contexto, { timeout: 5000 });
    if (tipo === 'nota_entrega') {
      const doc = ventana.generarNotaEntregaPDF(registro, true);
      if (doc) salida = Buffer.from(doc.output('arraybuffer'));
    } else if (tipo === 'nota_venta') {
      await ventana.generarNotaPDF(registro);
    } else {
      ventana.data.cotizaciones = [registro];
      ventana.generarCotizacionPDFById(registro.id);
    }
  } finally {
    Clase.API.save = guardarOriginal;
  }
  if (!salida) throw new Error('No se pudo generar el PDF' + (errores.length ? ': ' + errores[0] : ''));
  return { datos: salida, archivo: FUNCIONES[tipo].archivo(registro) };
}

module.exports = { generar, TIPOS: Object.keys(FUNCIONES) };
