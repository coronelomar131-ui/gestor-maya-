// Acceso a Firebase del servidor MCP. Es el único módulo que toca Firebase; las pruebas lo cambian con usar().
const admin = require('firebase-admin');

// Configuración web pública (la misma de public/index.html); la usa la página de inicio de sesión
const CONFIG_WEB = {
  apiKey: process.env.FIREBASE_WEB_API_KEY || 'AIzaSyCgMRItmi_9_NjEvYmqp8_Bg2K8XqWY4IE',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'mayav3-f9d9b.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'mayav3-f9d9b'
};

function app() {
  if (!admin.apps.length) {
    const cuenta = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (!cuenta.project_id) throw new Error('Falta la variable FIREBASE_SERVICE_ACCOUNT');
    admin.initializeApp({ credential: admin.credential.cert(cuenta), projectId: cuenta.project_id });
  }
  return admin;
}

// Firestore por REST (HTTP/1.1) y no por gRPC: en Vercel la función se congela entre llamadas y la
// conexión gRPC puede quedar muerta; la siguiente consulta se cuelga hasta que Vercel corta la función.
// REST también arranca más rápido. Solo onSnapshot necesita gRPC y el MCP no lo usa.
let base = null;
function db() {
  if (!base) {
    base = app().firestore();
    base.settings({ preferRest: true });
  }
  return base;
}

const real = {
  async leerColeccion(nombre) {
    const snap = await db().collection(nombre).get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  },
  async obtener(coleccion, id) {
    const snap = await db().collection(coleccion).doc(id).get();
    return snap.exists ? snap.data() : null;
  },
  async guardar(coleccion, id, datos) {
    await db().collection(coleccion).doc(id).set(datos);
  },
  async agregar(coleccion, datos) {
    return (await db().collection(coleccion).add(datos)).id;
  },
  async actualizar(coleccion, id, cambios) {
    await db().collection(coleccion).doc(id).update(cambios);
  },
  async incrementar(coleccion, id, campo, cantidad) {
    await db().collection(coleccion).doc(id).update({ [campo]: admin.firestore.FieldValue.increment(cantidad) });
  },
  // Como serverTimestamp() de la app
  marcaTiempo() {
    return admin.firestore.FieldValue.serverTimestamp();
  },
  async borrar(coleccion, id) {
    await db().collection(coleccion).doc(id).delete();
  },
  // Lee y borra en una transacción: los códigos y refresh tokens sirven una sola vez
  async tomar(coleccion, id) {
    const firestore = db();
    const ref = firestore.collection(coleccion).doc(id);
    return firestore.runTransaction(async t => {
      const snap = await t.get(ref);
      if (!snap.exists) return null;
      t.delete(ref);
      return snap.data();
    });
  },
  // Igual que loadUserProfile() de la app
  async perfil(uid) {
    const snap = await db().collection('usuarios').where('uid', '==', uid).limit(1).get();
    return snap.empty ? null : snap.docs[0].data();
  },
  // Token de Firebase Auth de la página de inicio de sesión; checkRevoked también rechaza cuentas desactivadas
  async verificarIdToken(idToken) {
    const t = await app().auth().verifyIdToken(idToken, true);
    return { uid: t.uid, email: t.email || '' };
  },
  async usuarioActivo(uid) {
    try {
      return !(await app().auth().getUser(uid)).disabled;
    } catch (e) {
      return false;
    }
  }
};

let actual = real;

module.exports = {
  CONFIG_WEB,
  fb: () => actual,
  usar: (otro) => { actual = otro || real; }
};
