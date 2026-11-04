// Quién es la persona que escribe (por su token de Firebase del gestor o por su número de WhatsApp) y con qué rol.
// Mismas reglas que la app y el MCP: sin perfil en "usuarios" no hay acceso, salvo cuentas anteriores al cierre del registro.
const { fb } = require('./firebase');

const CORTE_CUENTAS = Date.parse('2026-11-04T06:00:00Z');
const diez = t => String(t || '').replace(/\D/g, '').slice(-10);

async function usuarioDe(uid, email) {
  const perfil = await fb().perfil(uid);
  if (!perfil) {
    const creada = await fb().cuentaCreada(uid);
    if (!(creada && creada < CORTE_CUENTAS)) return null;
  }
  return { uid, email: email || (perfil && perfil.email) || '', nombre: (perfil && perfil.nombre) || email || 'Usuario', rol: perfil ? (perfil.rol || 'vendedor') : 'admin' };
}

async function porToken(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  if (!m) return null;
  try {
    const t = await fb().verificarIdToken(m[1]);
    return usuarioDe(t.uid, t.email);
  } catch (e) {
    return null;
  }
}

// El número se guarda en el perfil (campo whatsapp10 = últimos 10 dígitos); WhatsApp manda 52 o 521 + 10 dígitos
async function porWhatsApp(numero) {
  const d = diez(numero);
  if (d.length !== 10) return null;
  const perfiles = await fb().buscarIgual('usuarios', 'whatsapp10', d);
  if (perfiles.length !== 1) return null;
  const p = perfiles[0];
  return { uid: p.uid, email: p.email || '', nombre: p.nombre || p.email || 'Usuario', rol: p.rol || 'vendedor', whatsapp10: d };
}

module.exports = { porToken, porWhatsApp, diez };
