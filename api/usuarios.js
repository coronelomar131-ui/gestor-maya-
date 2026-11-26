// Alta y baja de usuarios del gestor. Solo un admin: la app manda su token de Firebase, aquí se revisa que su perfil
// en "usuarios" tenga rol admin y se hace el cambio con Firebase Admin.
// Así el registro público de Firebase Auth se puede apagar en la consola y nadie se da de alta solo.
//   Alta: POST { nombre, email, pass, rol }  (si el correo es de una cuenta dada de baja, la reactiva)
//   Baja: POST { accion: 'baja', id }        (id del documento en "usuarios")
const admin = require('firebase-admin');

const ROLES = require('../public/diseno/roles.js').LISTA;
// Accesos de Claude (MCP) que se borran al dar de baja (ver mcp/oauth.js)
const ACCESOS_MCP = ['mcp_codigos', 'mcp_refresh', 'mcp_tokens'];
// Una baja a medias deja de contar como "en curso" pasado este tiempo
const BAJA_EN_CURSO = 5 * 60 * 1000;

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

const falla = (status, mensaje) => Object.assign(new Error(mensaje), { status });

async function alta(quien, d) {
  const email = String(d.email || '').trim().toLowerCase();
  const nombre = String(d.nombre || '').trim();
  const pass = String(d.pass || '');
  const rol = String(d.rol || 'vendedor');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falla(400, 'Correo no válido');
  if (pass.length < 6) throw falla(400, 'La contraseña debe tener al menos 6 caracteres');
  if (!ROLES.includes(rol)) throw falla(400, 'Rol no válido');

  const auth = app().auth();
  const datos = uid => ({
    uid, nombre, email, rol,
    creadoPor: quien.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  let nuevo;
  try {
    nuevo = await auth.createUser({ email, password: pass, displayName: nombre || undefined });
  } catch (e) {
    if (e.code !== 'auth/email-already-exists') throw e;
    // Solo se reactiva una cuenta deshabilitada y sin perfil (dada de baja)
    const anterior = await auth.getUserByEmail(email);
    if (!anterior.disabled || await perfil(anterior.uid)) throw e;
    // Primero el perfil: una cuenta activa sin perfil podría entrar como admin si es antigua
    const ref = await app().firestore().collection('usuarios').add(datos(anterior.uid));
    try {
      await auth.revokeRefreshTokens(anterior.uid);
      await auth.updateUser(anterior.uid, Object.assign({ disabled: false, password: pass }, nombre ? { displayName: nombre } : {}));
    } catch (error) {
      await ref.delete();
      throw error;
    }
    return { ok: true, uid: anterior.uid, reactivado: true };
  }
  await app().firestore().collection('usuarios').add(datos(nuevo.uid));
  return { ok: true, uid: nuevo.uid };
}

async function borrarAccesosMCP(uid) {
  const db = app().firestore();
  for (const col of ACCESOS_MCP) {
    const snap = await db.collection(col).where('uid', '==', uid).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const lote = db.batch();
      snap.docs.slice(i, i + 400).forEach(x => lote.delete(x.ref));
      await lote.commit();
    }
  }
}

async function baja(quien, quienPerfil, d) {
  const db = app().firestore();
  const auth = app().auth();
  const usuarios = db.collection('usuarios');
  const id = String(d.id || '').trim();
  if (!id || id.includes('/')) throw falla(400, 'Falta el usuario a dar de baja');
  const snap = await usuarios.doc(id).get();
  if (!snap.exists) throw falla(404, 'Ese usuario ya no existe');
  const datos = snap.data();
  const correo = String(datos.email || '').trim().toLowerCase();

  let uid = String(datos.uid || '');
  let cuenta = null;
  try {
    if (uid) cuenta = await auth.getUser(uid);
    else if (correo) cuenta = await auth.getUserByEmail(correo);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
  }
  if (cuenta) uid = cuenta.uid;
  if (uid === quien.uid || (!datos.uid && correo && correo === String(quien.email || '').toLowerCase())) {
    throw falla(400, 'No puedes darte de baja a ti mismo');
  }

  // Todos los perfiles de esa persona (puede haber repetidos)
  const refs = new Map([[id, snap.ref]]);
  if (uid) (await usuarios.where('uid', '==', uid).get()).docs.forEach(x => refs.set(x.id, x.ref));

  // Apartar la baja en una transacción: así dos admins no se dan de baja entre sí y siempre queda uno
  await db.runTransaction(async t => {
    const admins = (await t.get(usuarios.where('rol', '==', 'admin'))).docs.filter(x => !(Date.now() - Date.parse(x.data().bajaEn) < BAJA_EN_CURSO) && !refs.has(x.id));
    if (!admins.length) throw falla(400, 'No se puede dar de baja al último administrador');
    if (!admins.some(x => x.data().uid === quien.uid)) throw falla(403, 'Solo un administrador puede dar de baja usuarios');
    refs.forEach(ref => t.update(ref, { bajaEn: new Date().toISOString() }));
  });

  // Primero se cierra el acceso y al final se quita el perfil; si algo falla, el usuario sigue en la lista para reintentar
  try {
    if (cuenta) {
      await auth.updateUser(uid, { disabled: true });
      await auth.revokeRefreshTokens(uid);
    }
    if (uid) await borrarAccesosMCP(uid);
    await db.runTransaction(async t => {
      const docs = [];
      for (const ref of refs.values()) docs.push(await t.get(ref));
      docs.filter(x => x.exists).forEach(x => {
        const copia = Object.assign({}, x.data());
        delete copia.bajaEn;
        t.set(db.collection('papelera').doc('usuarios_' + x.id + '_' + Date.now()), {
          coleccion: 'usuarios', idOriginal: x.id, datos: copia,
          eliminadoPor: quien.email || '', eliminadoPorNombre: quienPerfil.nombre || quien.email || '',
          eliminadoEn: new Date().toISOString(), origen: 'gestor'
        });
        t.delete(x.ref);
      });
    });
  } catch (e) {
    await Promise.all([...refs.values()].map(ref => ref.update({ bajaEn: admin.firestore.FieldValue.delete() }).catch(() => {})));
    throw e;
  }
  return { ok: true, uid, nombre: datos.nombre || correo };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });
  let esBaja = false;
  try {
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
    if (!m) return res.status(401).json({ error: 'Inicia sesión de nuevo' });
    // Dentro del try: un cuerpo mal formado puede fallar al leerse
    const d = cuerpo(req) || {};
    esBaja = d.accion === 'baja';
    const quien = await app().auth().verifyIdToken(m[1], true);
    const p = await perfil(quien.uid);
    if (!p || p.rol !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede ' + (esBaja ? 'dar de baja' : 'crear') + ' usuarios' });
    if (d.accion && !esBaja) return res.status(400).json({ error: 'Acción no válida' });

    return res.status(200).json(esBaja ? await baja(quien, p, d) : await alta(quien, d));
  } catch (e) {
    if (e && e.status) return res.status(e.status).json({ error: e.message });
    const codigo = e && e.code ? String(e.code) : '';
    if (codigo === 'auth/email-already-exists') return res.status(409).json({ error: 'Ese correo ya tiene cuenta' });
    if (codigo.startsWith('auth/id-token') || codigo === 'auth/argument-error' || codigo === 'auth/user-disabled') return res.status(401).json({ error: 'Inicia sesión de nuevo' });
    console.error('usuarios:', e);
    return res.status(500).json({ error: esBaja ? 'No se pudo dar de baja. Inténtalo de nuevo.' : 'No se pudo crear el usuario' });
  }
};
