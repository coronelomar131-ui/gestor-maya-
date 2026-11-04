// Reporte diario por WhatsApp. Lo llama el cron de Vercel (vercel.json) cada mañana; Vercel manda
// "Authorization: Bearer <CRON_SECRET>". Para probarlo a mano: /api/avisos?clave=<CRON_SECRET>[&solo=<10 dígitos>].
// Si alguien no le ha escrito a Pepito en 24 h, WhatsApp solo deja usar una plantilla aprobada (WHATSAPP_PLANTILLA_REPORTE).
process.env.TZ = 'America/Mexico_City';
const { fb } = require('../mcp/firebase');
const wa = require('../mcp/whatsapp');
const reporte = require('../mcp/reporte');

const ROLES = ['admin', 'facturacion'];

module.exports = async (req, res) => {
  const secreto = String(process.env.CRON_SECRET || '').trim();
  const q = new URL(req.url, 'http://x').searchParams;
  const dado = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || q.get('clave') || '';
  if (!secreto) return res.status(503).json({ ok: false, motivo: 'Falta CRON_SECRET en Vercel' });
  if (dado !== secreto) return res.status(401).json({ ok: false, motivo: 'Clave incorrecta' });
  if (!wa.configurado()) return res.status(503).json({ ok: false, motivo: 'WhatsApp sin configurar' });

  const solo = String(q.get('solo') || '').replace(/\D/g, '').slice(-10);
  const equipo = (await fb().leerColeccion('usuarios')).filter(u => u.whatsapp10 && ROLES.includes(u.rol || 'vendedor') && (!solo || u.whatsapp10 === solo));
  if (!equipo.length) return res.status(200).json({ ok: true, enviados: 0, motivo: 'Nadie con WhatsApp registrado y rol admin o facturación' });

  const rep = await reporte.armar();
  const plantilla = String(process.env.WHATSAPP_PLANTILLA_REPORTE || '').trim();
  const resultados = [];
  for (const u of equipo) {
    let r = await wa.enviarTexto(u.whatsapp10, reporte.texto(rep, u));
    let via = 'texto';
    if (!r.ok && wa.fueraDeVentana(r) && plantilla) {
      r = await wa.enviarPlantilla(u.whatsapp10, plantilla, process.env.WHATSAPP_PLANTILLA_IDIOMA || 'es_MX', [String(u.nombre || '').split(' ')[0], reporte.corto(rep, u)]);
      via = 'plantilla';
    }
    resultados.push({ para: u.nombre || u.email, via, ok: r.ok, error: r.ok ? undefined : (wa.fueraDeVentana(r) && !plantilla ? 'No le ha escrito a Pepito en 24 h y no hay plantilla aprobada' : r.error) });
  }
  await fb().guardar('config', 'avisos_ultimo', { ts: new Date().toISOString(), dia: rep.ayer, resultados }).catch(() => {});
  return res.status(200).json({ ok: true, dia: rep.ayer, resultados });
};
