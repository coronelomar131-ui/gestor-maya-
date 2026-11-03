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

const real = {
  async leerColeccion(nombre) {
    const snap = await app().firestore().collection(nombre).get();
    return snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
  },
  async obtener(coleccion, id) {
    const snap = await app().firestore().collection(coleccion).doc(id).get();
    return snap.exists ? snap.data() : null;
  },
  async guardar(coleccion, id, datos) {
    await app().firestore().collection(coleccion).doc(id).set(datos);
  },
  async agregar(coleccion, datos) {
    return (await app().firestore().collection(coleccion).add(datos)).id;
  },
  async actualizar(coleccion, id, cambios) {
    await app().firestore().collection(coleccion).doc(id).update(cambios);
  },
  async incrementar(coleccion, id, campo, cantidad) {
    await app().firestore().collection(coleccion).doc(id).update({ [campo]: admin.firestore.FieldValue.increment(cantidad) });
  },
  // Como serverTimestamp() de la app
  marcaTiempo() {
    return admin.firestore.FieldValue.serverTimestamp();
  },
  async borrar(coleccion, id) {
    await app().firestore().collection(coleccion).doc(id).delete();
  },
  // Lee y borra en una transacción: los códigos y refresh tokens sirven una sola vez
  async tomar(coleccion, id) {
    const db = app().firestore();
    const ref = db.collection(coleccion).doc(id);
    return db.runTransaction(async t => {
      const snap = await t.get(ref);
      if (!snap.exists) return null;
      t.delete(ref);
      return snap.data();
    });
  },
  // Igual que loadUserProfile() de la app
  async perfil(uid) {
    const snap = await app().firestore().collection('usuarios').where('uid', '==', uid).limit(1).get();
    return snap.empty ? null : snap.docs[0].data();
  },
  // Token de Firebase Auth de la página de inicio de sesión; checkRevoked también rechaza cuentas desactivadas
  async verificarIdToken(idToken) {
    const t = await app().auth().verifyIdToken(idToken, true);
    return { uid: t.uid, email: t.email || '' };
  },
  // Fecha de creación de la cuenta de Firebase Auth en milisegundos (0 si no se puede saber)
  async cuentaCreada(uid) {
    try {
      return Date.parse((await app().auth().getUser(uid)).metadata.creationTime) || 0;
    } catch (e) {
      return 0;
    }
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
