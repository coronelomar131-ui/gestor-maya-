// Buzón de Pepito: el equipo deja pedidos desde la app (colección buzon_pepito) y Pepito, conectado por este MCP
// con una cuenta admin, los revisa y contesta. Cada pedido trae el rol de quien lo hizo y qué módulos puede usar.
const { fb } = require('./firebase');

const COLECCION = 'buzon_pepito';
const ESTADO = 'config';
const ESTADO_ID = 'buzon_pepito';

const fecha = v => {
  if (!v) return null;
  if (v.toDate) return v.toDate().toISOString();
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
};

// Pendientes del más viejo al más nuevo. Solo lee los pendientes (si no hay, cuesta 1 lectura).
async function revisar(permisos) {
  const pendientes = await fb().buscarIgual(COLECCION, 'estado', 'pendiente');
  await fb().guardar(ESTADO, ESTADO_ID, { ultimaRevision: fb().marcaTiempo(), pendientes: pendientes.length });
  const lista = pendientes
    .map(p => ({
      id: p.id,
      de: p.nombre || p.email || 'Alguien del equipo',
      rol: p.rol || 'vendedor',
      fecha: fecha(p.createdAt),
      pedido: String(p.texto || ''),
      contexto: p.contexto ? { pregunta_anterior: p.contexto.pregunta || '', respuesta_anterior: p.contexto.respuesta || '' } : null,
      puede_usar: Object.keys(permisos).filter(m => m !== 'borrar' && permisos[m].includes(p.rol || 'vendedor')),
      puede_borrar: (permisos.borrar || []).includes(p.rol)
    }))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  return {
    pendientes: lista.length,
    pedidos: lista,
    aviso: lista.length ? undefined : 'No hay pedidos pendientes en el buzón.'
  };
}

async function responder(u, a) {
  const actual = await fb().obtener(COLECCION, a.id);
  if (!actual) {
    const { ErrorUsuario } = require('./escritura');
    throw new ErrorUsuario('No existe el pedido ' + a.id + ' en el buzón. Usa revisar_buzon para ver los ids.');
  }
  await fb().actualizar(COLECCION, a.id, {
    estado: 'respondido',
    respuesta: String(a.respuesta),
    esperaConfirmacion: !!a.espera_confirmacion,
    adjuntos: (a.adjuntos || []).map(x => ({ tipo: x.tipo, id: String(x.id), folio: x.folio ? String(x.folio) : '' })),
    respondidoAt: fb().marcaTiempo(),
    respondidoPor: u.nombre || u.email || 'Pepito'
  });
  return { ok: true, id: a.id, para: actual.nombre || actual.email || null };
}

module.exports = { revisar, responder, COLECCION };
