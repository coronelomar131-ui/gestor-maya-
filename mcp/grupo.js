// Grupo "Entregas y cobranza": un grupo de trabajo que pasa por Pepito.
// WhatsApp solo deja a un número de empresa estar en grupos si es cuenta oficial verificada (OBA), así que por ahora
// cada quien le escribe a Pepito en privado y Pepito reparte lo que es para el grupo a los demás:
//  - Por WhatsApp: un mensaje que empieza con "grupo:" (o "#grupo", "al grupo", "👥") se manda tal cual a los demás miembros.
//  - Pepito: "avísale al grupo que…" (herramienta mandar_al_grupo) y "¿qué dijeron en el grupo?" (ver_grupo).
//  - El gestor: la campanita muestra los mensajes y deja escribir al grupo; el admin elige quiénes están.
//  - Lo que pasa en entregas y cobranza (pieza en camino o entregada, factura, pago) le llega al grupo.
// Todo queda en config/grupo_entregas_cobranza: { miembros: [uid], mensajes: [últimos 60] }.
const { fb } = require('./firebase');
const avisos = require('./avisos');

const COL = 'config';
const ID = 'grupo_entregas_cobranza';
const NOMBRE = 'Entregas y cobranza';
const MAX_MIEMBROS = 8; // el límite de los grupos oficiales de WhatsApp, para poder pasarlo tal cual después
const MAX_MENSAJES = 60;
const uidDe = u => u && (u.uid || u.id);
const primerNombre = u => String((u && (u.nombre || u.email)) || 'Alguien').split(/[\s@]/)[0];

async function leer() {
  const g = (await fb().obtener(COL, ID)) || {};
  return { miembros: Array.isArray(g.miembros) ? g.miembros : [], mensajes: Array.isArray(g.mensajes) ? g.mensajes : [] };
}

async function esMiembro(usuario) {
  if (!uidDe(usuario)) return false;
  return (await leer()).miembros.includes(uidDe(usuario));
}

// "grupo: ya salió la guía" → "ya salió la guía" (null si no es para el grupo).
// "grupo" solo cuenta con dos puntos, para no confundir "Grupo Automotriz…" (un cliente) con un mensaje al grupo.
function textoParaGrupo(texto) {
  const t = String(texto || '').trim();
  const m = t.match(/^(?:#\s*grupo\b|grupo\s*:|al\s+grupo\b|para\s+el\s+grupo\b|👥)\s*[:,.\-–]?\s*([\s\S]+)$/i);
  return m && m[1].trim() ? m[1].trim() : null;
}

// Manda un mensaje a todos los miembros menos a quien lo escribió (autor = usuario, o null si lo dice Pepito)
async function mandar(autor, texto, opciones = {}) {
  const limpio = String(texto || '').trim().slice(0, 1500);
  if (!limpio) throw new Error('Escribe el mensaje para el grupo');
  const g = await leer();
  if (autor && !g.miembros.includes(uidDe(autor))) throw Object.assign(new Error('No estás en el grupo ' + NOMBRE + '. Pídele al admin que te agregue.'), { noMiembro: true });
  const quitar = new Set([uidDe(autor), opciones.excluir].filter(Boolean));
  const equipo = await fb().leerColeccion('usuarios');
  const destinos = equipo.filter(u => g.miembros.includes(uidDe(u)) && !quitar.has(uidDe(u)));
  const de = autor ? primerNombre(autor) : 'Pepito';
  const mensaje = { de, uid: uidDe(autor) || 'pepito', texto: limpio, ts: Date.now(), canal: opciones.canal || 'gestor' };
  await fb().guardar(COL, ID, { miembros: g.miembros, mensajes: [mensaje].concat(g.mensajes).slice(0, MAX_MENSAJES) });
  const cuerpo = '👥 *' + NOMBRE + '* · ' + de + ':\n' + limpio + '\n\n_Para contestarle al grupo, empieza tu mensaje con «grupo:»._';
  const resultados = [];
  for (const u of destinos) {
    try { resultados.push(await avisos.avisar(u, { tipo: 'grupo', titulo: NOMBRE, texto: cuerpo }, { deNombre: de })); }
    catch (e) { resultados.push({ para: u.nombre || u.email, error: e.message }); }
  }
  return { grupo: NOMBRE, enviado_a: destinos.map(u => u.nombre || u.email), resultados };
}

// Lo que el grupo dijo hace poco (para Pepito y el gestor)
async function ultimos(n = 15) {
  const g = await leer();
  return g.mensajes.slice(0, n).map(m => ({ de: m.de, texto: m.texto, cuando: new Date(m.ts).toISOString(), canal: m.canal }));
}

async function verGrupo(usuario) {
  const g = await leer();
  const equipo = await fb().leerColeccion('usuarios');
  const nombres = g.miembros.map(id => equipo.find(u => uidDe(u) === id)).filter(Boolean).map(u => ({ id: uidDe(u), nombre: u.nombre || u.email, whatsapp: !!u.whatsapp10 }));
  const r = { grupo: NOMBRE, miembros: nombres, soy_miembro: g.miembros.includes(uidDe(usuario)), mensajes: g.mensajes.slice(0, 30) };
  if (usuario && usuario.rol === 'admin') r.equipo = equipo.map(u => ({ id: uidDe(u), nombre: u.nombre || u.email, rol: u.rol || 'vendedor', whatsapp: !!u.whatsapp10 }));
  return r;
}

async function guardarMiembros(usuario, ids) {
  if (!usuario || usuario.rol !== 'admin') throw new Error('Solo un admin puede cambiar quién está en el grupo');
  const equipo = await fb().leerColeccion('usuarios');
  const validos = [...new Set((ids || []).map(String))].filter(id => equipo.some(u => uidDe(u) === id));
  if (validos.length > MAX_MIEMBROS) throw new Error('El grupo es de máximo ' + MAX_MIEMBROS + ' personas');
  const g = await leer();
  await fb().guardar(COL, ID, { miembros: validos, mensajes: g.mensajes });
  return { grupo: NOMBRE, miembros: validos.map(id => { const u = equipo.find(x => uidDe(x) === id); return u.nombre || u.email; }) };
}

// Herramientas de Pepito (solo para quien está en el grupo). No piden confirmación: solo avisan al equipo.
const HERRAMIENTAS = [
  {
    name: 'mandar_al_grupo',
    description: 'Manda un mensaje al grupo "' + NOMBRE + '" (le llega a los demás miembros por WhatsApp y en la campanita del gestor). ' +
      'Úsala solo cuando la persona pida explícitamente avisarle o decirle algo al grupo. Escribe el mensaje claro y corto, como lo leerán; ' +
      'si menciona una nota, pon el folio y el cliente. Al terminar, di a quiénes se mandó.',
    input_schema: { type: 'object', properties: { mensaje: { type: 'string', description: 'Texto para el grupo' } }, required: ['mensaje'], additionalProperties: false }
  },
  {
    name: 'ver_grupo',
    description: 'Los últimos mensajes del grupo "' + NOMBRE + '" (quién dijo qué y cuándo) y quiénes están. Úsala para "¿qué dijeron en el grupo?".',
    input_schema: { type: 'object', properties: {}, additionalProperties: false }
  }
];
const NOMBRES = new Set(HERRAMIENTAS.map(t => t.name));

async function llamar(usuario, nombre, a, canal) {
  try {
    if (nombre === 'mandar_al_grupo') return { error: false, texto: JSON.stringify(await mandar(usuario, a && a.mensaje, { canal })) };
    const v = await verGrupo(usuario);
    return { error: false, texto: JSON.stringify({ grupo: v.grupo, miembros: v.miembros.map(m => m.nombre), mensajes: await ultimos(15) }) };
  } catch (e) { return { error: true, texto: e.message }; }
}

module.exports = { NOMBRE, MAX_MIEMBROS, leer, esMiembro, textoParaGrupo, mandar, ultimos, verGrupo, guardarMiembros, HERRAMIENTAS, NOMBRES, llamar };
