// Enlaces para descargar el PDF de una nota o cotización desde el gestor (los abre diseno/enlaces.js).
// Al abrirlos hay que tener sesión en el gestor, así que no exponen nada a quien no tenga cuenta.
const BASE = (process.env.GESTOR_URL || 'https://gestor-maya.vercel.app').replace(/\/+$/, '');
const TIPOS = { crear_nota_entrega: 'nota_entrega', crear_venta: 'nota_venta', crear_cotizacion: 'cotizacion' };

const enlace = (tipo, id) => `${BASE}/?pdf=${encodeURIComponent(tipo)}:${encodeURIComponent(id)}`;

// Del resultado de crear_nota_entrega / crear_venta / crear_cotizacion saca { folio, url }
function deCreacion(herramienta, resultadoTexto) {
  const tipo = TIPOS[herramienta];
  if (!tipo || !resultadoTexto) return null;
  let r;
  try { r = JSON.parse(resultadoTexto); } catch (e) { return null; }
  const c = r.creada && typeof r.creada === 'object' ? r.creada : r;
  const id = (typeof r.creada === 'string' && r.creada) || c.id;
  if (!id) return null;
  return { folio: c.folio || r.folio || '', url: enlace(tipo, id) };
}

const instrucciones = () =>
  'Si te piden el PDF de una nota o cotización que ya existe, búscala para tener su id y comparte el enlace: ' +
  BASE + '/?pdf=nota_entrega:<id> (nota de entrega NE), ' + BASE + '/?pdf=nota_venta:<id> (nota de venta NV, id de la venta) o ' +
  BASE + '/?pdf=cotizacion:<id>. Al abrirlo con su sesión del gestor se descarga el PDF con el diseño de la app.';

module.exports = { enlace, deCreacion, instrucciones, BASE };
