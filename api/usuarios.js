// Alta de usuarios del gestor. Solo un admin puede crear cuentas: la app manda su token de Firebase,
// aquí se revisa que su perfil en "usuarios" tenga rol admin y se crea la cuenta con Firebase Admin.
// Así el registro público de Firebase Auth se puede apagar en la consola y nadie se da de alta solo.
const admin = require('firebase-admin');

const ROLES = ['vendedor', 'almacen', 'entregas', 'facturacion', 'admin'];

function app() {
  if (!admin.apps.length) {
    const cuenta = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (!cuenta.project_id) throw new Error('Falta la variable FIREBASE_SERVICE_ACCOUNT');
    admin.initializeApp({ credential: admin.credential.cert(cuenta), projectId: cuenta.project_id });
  }
  return admin;
}

async function perfil(uid) {
  const snap = await app().firestore().collection('usuarios').where('uid', '==', uid).limit(1).get();
  return snap.empty ? null : snap.docs[0].data();
}

function cuerpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (e) { return {}; }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  try {
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
    if (!m) return res.status(401).json({ error: 'Inicia sesión de nuevo' });
    const quien = await app().auth().verifyIdToken(m[1], true);
    const p = await perfil(quien.uid);
    if (!p || p.rol !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede crear usuarios' });

    const d = cuerpo(req);
    const email = String(d.email || '').trim().toLowerCase();
    const nombre = String(d.nombre || '').trim();
    const pass = String(d.pass || '');
    const rol = String(d.rol || 'vendedor');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Correo no válido' });
    if (pass.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
    if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol no válido' });

    const nuevo = await app().auth().createUser({ email, password: pass, displayName: nombre || undefined });
    await app().firestore().collection('usuarios').add({
      uid: nuevo.uid, nombre, email, rol,
      creadoPor: quien.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return res.status(200).json({ ok: true, uid: nuevo.uid });
  } catch (e) {
    const codigo = e && e.code ? String(e.code) : '';
    if (codigo === 'auth/email-already-exists') return res.status(409).json({ error: 'Ese correo ya tiene cuenta' });
    if (codigo.startsWith('auth/id-token') || codigo === 'auth/argument-error') return res.status(401).json({ error: 'Inicia sesión de nuevo' });
    console.error('usuarios:', e);
    return res.status(500).json({ error: 'No se pudo crear el usuario' });
  }
};
