// Avisos del equipo (campanita del gestor + WhatsApp). Tres formas de llamarlo:
//  1. Resumen diario por rol: el cron de Vercel (vercel.json) cada mañana manda "Authorization: Bearer <CRON_SECRET>".
//     A mano: /api/avisos?clave=<CRON_SECRET>[&solo=<10 dígitos>]  (con "solo" se manda aunque ya haya salido hoy)
//  2. Tick cada 5 minutos (cron-job.org, gratis): /api/avisos?tarea=tick con el mismo encabezado Authorization.
//     Manda las alarmas que ya tocan y, después de las AVISOS_HORA (8 por defecto), el resumen del día si no ha salido.
//  3. Avisos al momento desde el gestor: POST { evento, ... } con el token de Firebase de quien hizo el cambio.
// Si alguien no le ha escrito a Pepito en 24 h, WhatsApp solo deja usar una plantilla aprobada
// (WHATSAPP_PLANTILLA_REPORTE para el resumen, WHATSAPP_PLANTILLA_AVISO para lo demás); si no hay, queda guardado
// y se le entrega cuando escriba. En la campanita del gestor siempre llega.
process.env.TZ = 'America/Mexico_City';
const { fb } = require('../mcp/firebase');
const avisos = require('../mcp/avisos');
const reporte = require('../mcp/reporte');
const acceso = require('../mcp/acceso');

const EVENTOS = ['nota_nueva', 'etapa', 'factura', 'pago'];
const hoyCDMX = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Mexico_City' });
const horaCDMX = () => Number(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City', hour: 'numeric', hour12: false })) % 24;

function cuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

async function resumenDiario(solo) {
  const equipo = (await fb().leerColeccion('usuarios')).filter(u => (!solo || u.whatsapp10 === solo) && avisos.prefs(u).resumen);
  if (!equipo.length) return { enviados: 0, motivo: solo ? 'Ese número no está registrado o tiene el resumen apagado' : 'Nadie con el resumen prendido' };
  const ctx = await avisos.contextoDiario();
  const plantilla = String(process.env.WHATSAPP_PLANTILLA_REPORTE || '').trim();
  const resultados = [];
  for (const u of equipo) {
    const meta = plantilla && ['admin', 'facturacion'].includes(u.rol)
      ? { plantilla: { nombre: plantilla, idioma: process.env.WHATSAPP_PLANTILLA_IDIOMA || 'es_MX', params: [String(u.nombre || '').split(' ')[0], reporte.corto(ctx.rep, u)] } }
      : {};
    try { resultados.push(await avisos.avisar(u, { tipo: 'resumen', titulo: 'Resumen del día', texto: avisos.resumenDe(u, ctx) }, meta)); }
    catch (e) { resultados.push({ para: u.nombre || u.email, error: e.message }); }
  }
  await fb().guardar('config', 'avisos_ultimo', { ts: new Date().toISOString(), dia: ctx.ayer, resultados }).catch(() => {});
  return { dia: ctx.ayer, resultados };
}

module.exports = async (req, res) => {
  const d = req.method === 'POST' ? cuerpo(req) : {};

  // 3. Aviso al momento desde el gestor
  if (req.method === 'POST' && d.evento) {
    const usuario = await acceso.porToken(req);
    if (!usuario) return res.status(401).json({ ok: false, error: 'Inicia sesión de nuevo' });
    if (!EVENTOS.includes(d.evento)) return res.status(400).json({ ok: false, error: 'Evento desconocido' });
    try { return res.status(200).json({ ok: true, avisos: await avisos.porEvento(d.evento, d, usuario) }); }
    catch (e) { console.error('avisos/evento:', e); return res.status(400).json({ ok: false, error: e.message }); }
  }

  const secreto = String(process.env.CRON_SECRET || '').trim();
  const q = new URL(req.url, 'http://x').searchParams;
  const dado = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || q.get('clave') || '';
  if (!secreto) return res.status(503).json({ ok: false, motivo: 'Falta CRON_SECRET en Vercel' });
  if (dado !== secreto) return res.status(401).json({ ok: false, motivo: 'Clave incorrecta' });

  try {
    const solo = String(q.get('solo') || '').replace(/\D/g, '').slice(-10);
    if (solo) return res.status(200).json(Object.assign({ ok: true }, await resumenDiario(solo)));
    const salida = { ok: true };
    if (q.get('tarea') === 'tick') salida.alarmas = await avisos.alarmasVencidas();
    // El resumen sale una vez al día: con el cron de Vercel, o con el primer tick después de la hora
    const toca = q.get('tarea') !== 'tick' || horaCDMX() >= (Number(process.env.AVISOS_HORA) || 8);
    if (toca && await fb().reservar('config', 'avisos_turno', 'dia', hoyCDMX())) salida.resumen = await resumenDiario('');
    return res.status(200).json(salida);
  } catch (e) {
    console.error('avisos:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
