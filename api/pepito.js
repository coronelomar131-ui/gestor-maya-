// Chat de Pepito Junior en el gestor (módulo Pepito). Requiere ANTHROPIC_API_KEY en Vercel.
// GET  /api/pepito            → { activo, modelo } (para que la app sepa si usar el chat o el buzón)
// POST /api/pepito { mensaje } → respuesta de Pepito (y propuesta si quiere guardar algo)
// POST /api/pepito { propuesta, confirmar: true|false } → guarda (o descarta) lo propuesto
process.env.TZ = 'America/Mexico_City';
const pepito = require('../mcp/pepito');
const acceso = require('../mcp/acceso');

function cuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') return res.status(200).json({ activo: pepito.activo(), modelo: pepito.activo() ? pepito.MODELO : null });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  if (!pepito.activo()) return res.status(503).json({ error: 'Pepito todavía no tiene la API de Claude configurada (ANTHROPIC_API_KEY en Vercel).' });
  const usuario = await acceso.porToken(req);
  if (!usuario) return res.status(401).json({ error: 'Inicia sesión de nuevo' });
  const d = cuerpo(req);
  try {
    if (d.propuesta) return res.status(200).json(await pepito.resolverPropuesta(usuario, String(d.propuesta), d.confirmar === true, 'gestor'));
    return res.status(200).json(await pepito.conversar(usuario, d.mensaje, 'gestor'));
  } catch (e) {
    if (e.limite) return res.status(429).json({ error: e.message });
    if (e.status === 429) return res.status(429).json({ error: 'Pepito está muy ocupado en este momento. Intenta en un minuto.' });
    if (e.status === 401 || e.status === 403) { console.error('pepito: llave de Claude', e.status); return res.status(503).json({ error: 'La llave de la API de Claude no es válida o no tiene saldo.' }); }
    if (e.status === 400 && /credit|balance/i.test(e.message || '')) return res.status(503).json({ error: 'Se acabó el saldo de la API de Claude.' });
    console.error('pepito:', e);
    return res.status(e.status && e.status < 500 ? 400 : 500).json({ error: e.message && !e.status ? e.message : 'Pepito no pudo contestar. Intenta de nuevo.' });
  }
};
