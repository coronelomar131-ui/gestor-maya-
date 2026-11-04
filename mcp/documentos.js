// Arma el PDF de una nota o cotización guardada (mismo diseño de la app, mcp/pdf.js) y lo manda por WhatsApp
const { fb } = require('./firebase');
const datos = require('./datos');
const pdf = require('./pdf');
const wa = require('./whatsapp');
const enlaces = require('./enlaces');

const COLECCION = { nota_entrega: 'notasEntrega', nota_venta: 'ventas', cotizacion: 'cotizaciones' };
const DE_HERRAMIENTA = { crear_nota_entrega: 'nota_entrega', crear_venta: 'nota_venta', crear_cotizacion: 'cotizacion' };
// Mismo permiso que pide la herramienta que lee ese tipo de documento
const MODULO = { nota_entrega: 'notas', nota_venta: 'notas', cotizacion: 'cotizaciones' };

async function armar(tipo, id) {
  const registro = await fb().obtener(COLECCION[tipo], id);
  if (!registro) throw new Error('No encontré ese documento (' + tipo + ' ' + id + ')');
  registro.id = id;
  const clientes = await datos.leer('clientes').catch(() => []);
  return pdf.generar(tipo, registro, { data: { clientes } });
}

// Manda el PDF; si algo falla, manda el enlace para descargarlo desde el gestor
async function mandar(para, tipo, id, leyenda) {
  try {
    const r = await armar(tipo, id);
    const env = await wa.enviarDocumento(para, r.datos, r.archivo, leyenda);
    if (env.ok) return { ok: true, archivo: r.archivo };
    throw new Error(env.error);
  } catch (e) {
    const respaldo = await wa.enviarTexto(para, (leyenda ? leyenda + '\n' : '') + '📄 No pude adjuntar el PDF, descárgalo aquí: ' + enlaces.enlace(tipo, id));
    return { ok: false, error: e.message, respaldo: respaldo.ok };
  }
}

// Del resultado de crear_nota_entrega / crear_venta / crear_cotizacion: { tipo, id, folio }
function deCreacion(herramienta, resultadoTexto) {
  const tipo = DE_HERRAMIENTA[herramienta];
  if (!tipo || !resultadoTexto) return null;
  let r;
  try { r = JSON.parse(resultadoTexto); } catch (e) { return null; }
  const c = r.creada && typeof r.creada === 'object' ? r.creada : r;
  const id = (typeof r.creada === 'string' && r.creada) || c.id;
  return id ? { tipo, id, folio: c.folio || r.folio || '' } : null;
}

module.exports = { armar, mandar, deCreacion, COLECCION, MODULO };
