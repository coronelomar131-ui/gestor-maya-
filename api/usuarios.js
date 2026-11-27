// Alta y baja de usuarios del gestor. Solo un admin: la app manda su token de Firebase, aquí se revisa que su perfil
// en "usuarios" tenga rol admin y se hace el cambio con Firebase Admin.
// Así el registro público de Firebase Auth se puede apagar en la consola y nadie se da de alta solo.
//   Alta: POST { nombre, email, pass, rol }  (si el correo es de una cuenta dada de baja, la reactiva)
//   Baja: POST { accion: 'baja', id }        (id del documento en "usuarios")
// Permisos de Firebase (docs/PERMISOS_FIREBASE.md): roles/{uid} es la copia del rol que leen las reglas y solo la escribe
// el servidor. La fuente sigue siendo "usuarios".
//   Mi copia:  POST { accion: 'mi-rol' }                          (cualquier sesión; solo la suya)
//   Revisar:   POST { accion: 'revisar' }                         (admin; no cambia nada)
//   Copiar:    POST { accion: 'sincronizar', crearPerfiles }      (admin)
const admin = require('firebase-admin');

const ROLES = require('../public/diseno/roles.js').LISTA;
// Accesos de Claude (MCP) que se borran al dar de baja (ver mcp/oauth.js)
const ACCESOS_MCP = ['mcp_codigos', 'mcp_refresh', 'mcp_tokens'];
// Una baja a medias deja de contar como "en curso" pasado este tiempo
const BAJA_EN_CURSO = 5 * 60 * 1000;
// Igual que CORTE_CUENTAS de public/index.html: cuentas anteriores sin perfil entraban como admin
const CORTE_CUENTAS = Date.parse('2026-11-04T06:00:00Z');

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

// ── Copia del rol para las reglas: roles/{uid} ──
// Mismo criterio que la app: manda el primer perfil (por id) y sin rol es vendedor
const rolDe = datos => String(datos.rol || 'vendedor');
const copiaRol = (rol, usuarioId) => ({ rol, usuarioId, actualizado: new Date().toISOString() });

// Si falla no se detiene el alta: la copia se crea cuando esa persona entra al gestor
async function copiarRol(uid, rol, usuarioId) {
  try {
    await app().firestore().collection('roles').doc(uid).set(copiaRol(rol, usuarioId));
  } catch (e) {
    console.error('usuarios: no se copió el rol:', e);
  }
}

// Solo copia lo que diga "usuarios" para quien pregunta; nunca crea perfiles ni da accesos
async function miRol(quien) {
  const db = app().firestore();
  const ref = db.collection('roles').doc(quien.uid);
  return db.runTransaction(async t => {
    const perfiles = await t.get(db.collection('usuarios').where('uid', '==', quien.uid).limit(1));
    const actual = await t.get(ref);
    if (perfiles.empty) {
      if (actual.exists) t.delete(ref);
      return { ok: true, rol: null, cambio: actual.exists };
    }
    const doc = perfiles.docs[0];
    const rol = rolDe(doc.data());
    const cambio = !actual.exists || actual.data().rol !== rol;
    if (cambio) t.set(ref, copiaRol(rol, doc.id));
    return { ok: true, rol, cambio };
  });
}

async function cuentas() {
  const lista = [];
  let pagina;
  do {
    const r = await app().auth().listUsers(1000, pagina);
    lista.push(...r.users);
    pagina = r.pageToken;
  } while (pagina);
  return lista;
}

// Compara cuentas, perfiles y copias. Con aplicar = true escribe las copias (y, si se pide, los perfiles que faltan)
async function sincronizar(quien, aplicar, crearPerfiles) {
  const db = app().firestore();
  // Las copias se leen antes que las cuentas: así un alta que ocurra en medio no se toma por copia sobrante
  const roles = await db.collection('roles').get();
  const todas = await cuentas();
  const [usuarios, ml] = await Promise.all([db.collection('usuarios').get(), db.collection('config').doc('ml_global').get()]);
  const perfiles = new Map(); // uid -> sus perfiles; el primero por id es el que vale
  usuarios.docs.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).forEach(x => {
    const uid = String(x.data().uid || '');
    if (uid) perfiles.set(uid, (perfiles.get(uid) || []).concat(x));
  });
  const copias = new Map(roles.docs.map(x => [x.id, x.data()]));
  const informe = { cuentas: 0, listos: 0, pendientes: [], sinPerfil: [], sinPerfilNuevas: [], repetidos: [], rolNoValido: [], perfilesSinCuenta: [], perfilesCreados: [], escritas: 0, borradas: 0 };
  const escrituras = [];
  const validas = new Set();
  let admins = 0;

  for (const c of todas) {
    if (c.disabled) continue;
    informe.cuentas++;
    const correo = c.email || c.uid;
    const mios = perfiles.get(c.uid) || [];
    let rol = mios.length ? rolDe(mios[0].data()) : '';
    let usuarioId = mios.length ? mios[0].id : '';
    if (!mios.length) {
      const creada = Date.parse((c.metadata && c.metadata.creationTime) || '') || 0;
      // Cuenta nueva sin perfil: hoy tampoco entra
      if (!(creada && creada < CORTE_CUENTAS)) { informe.sinPerfilNuevas.push(correo); continue; }
      if (!(aplicar && crearPerfiles)) { informe.sinPerfil.push(correo); continue; }
      // El mismo perfil que la app le crearía al entrar
      const ref = db.collection('usuarios').doc();
      await ref.set({ uid: c.uid, nombre: c.displayName || c.email || '', email: c.email || '', rol: 'admin', creadoPor: quien.uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      informe.perfilesCreados.push(correo);
      rol = 'admin';
      usuarioId = ref.id;
    }
    if (mios.length > 1) informe.repetidos.push({ cuenta: correo, roles: mios.map(x => rolDe(x.data())) });
    if (!ROLES.includes(rol)) informe.rolNoValido.push({ cuenta: correo, rol });
    if (rol === 'admin') admins++;
    validas.add(c.uid);
    const copia = copias.get(c.uid);
    if (copia && copia.rol === rol) informe.listos++;
    else {
      escrituras.push({ ref: db.collection('roles').doc(c.uid), datos: copiaRol(rol, usuarioId) });
      if (!aplicar) informe.pendientes.push(correo);
    }
  }
  const conCuenta = new Set(todas.map(c => c.uid));
  usuarios.docs.forEach(x => {
    const d = x.data();
    if (!d.uid || !conCuenta.has(d.uid)) informe.perfilesSinCuenta.push(d.email || d.nombre || x.id);
  });

  if (aplicar) {
    // Sobran las copias de cuentas deshabilitadas, borradas o sin perfil
    const sobran = [...copias.keys()].filter(uid => !validas.has(uid));
    const cambios = escrituras.concat(sobran.map(uid => ({ ref: db.collection('roles').doc(uid) })));
    for (let i = 0; i < cambios.length; i += 400) {
      const lote = db.batch();
      cambios.slice(i, i + 400).forEach(c => (c.datos ? lote.set(c.ref, c.datos) : lote.delete(c.ref)));
      await lote.commit();
    }
    informe.escritas = escrituras.length;
    informe.borradas = sobran.length;
    informe.listos += escrituras.length;
  }
  const mlGlobal = ml.exists ? ml.data() : null;
  informe.mercadoLibre = !!(mlGlobal && mlGlobal.activo && mlGlobal.mlUserId);
  informe.admins = admins;
  informe.listo = admins > 0 && !informe.pendientes.length && !informe.sinPerfil.length && !informe.rolNoValido.length;
  return Object.assign({ ok: true }, informe);
}

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
    await copiarRol(anterior.uid, rol, ref.id);
    return { ok: true, uid: anterior.uid, reactivado: true };
  }
  const ref = await app().firestore().collection('usuarios').add(datos(nuevo.uid));
  await copiarRol(nuevo.uid, rol, ref.id);
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
      // Sin la copia del rol las reglas le cierran la base aunque su sesión siga abierta
      if (uid) t.delete(db.collection('roles').doc(uid));
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
  let accion = '';
  try {
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
    if (!m) return res.status(401).json({ error: 'Inicia sesión de nuevo' });
    // Dentro del try: un cuerpo mal formado puede fallar al leerse
    const d = cuerpo(req) || {};
    esBaja = d.accion === 'baja';
    accion = ['mi-rol', 'revisar', 'sincronizar'].includes(d.accion) ? d.accion : '';
    const quien = await app().auth().verifyIdToken(m[1], true);
    if (accion === 'mi-rol') return res.status(200).json(await miRol(quien));
    const p = await perfil(quien.uid);
    if (!p || p.rol !== 'admin') return res.status(403).json({ error: 'Solo un administrador puede ' + (accion ? 'revisar los permisos' : (esBaja ? 'dar de baja' : 'crear') + ' usuarios') });
    if (accion) return res.status(200).json(await sincronizar(quien, accion === 'sincronizar', d.crearPerfiles === true));
    if (d.accion && !esBaja) return res.status(400).json({ error: 'Acción no válida' });

    return res.status(200).json(esBaja ? await baja(quien, p, d) : await alta(quien, d));
  } catch (e) {
    if (e && e.status) return res.status(e.status).json({ error: e.message });
    const codigo = e && e.code ? String(e.code) : '';
    if (codigo === 'auth/email-already-exists') return res.status(409).json({ error: 'Ese correo ya tiene cuenta' });
    if (codigo.startsWith('auth/id-token') || codigo === 'auth/argument-error' || codigo === 'auth/user-disabled') return res.status(401).json({ error: 'Inicia sesión de nuevo' });
    console.error('usuarios:', e);
    if (accion) return res.status(500).json({ error: 'No se pudieron revisar los permisos. Inténtalo de nuevo.' });
    return res.status(500).json({ error: esBaja ? 'No se pudo dar de baja. Inténtalo de nuevo.' : 'No se pudo crear el usuario' });
  }
};
