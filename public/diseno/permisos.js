// Permisos de Firebase (docs/PERMISOS_FIREBASE.md). Las reglas por rol leen roles/{uid}, que solo escribe el servidor
// (api/usuarios.js) copiando lo que dice "usuarios". Aquí se le pide esa copia:
//   - cada quien la suya al entrar;
//   - Dirección la de todos al entrar y cada vez que cambia la lista de usuarios;
//   - y en Usuarios, Dirección puede revisar y preparar a todo el equipo.
// Con las reglas de Nivel 1 no cambia nada en pantalla.

const aviso = (texto, tipo) => window.toast && window.toast(String(texto).replace(/</g, '‹').replace(/>/g, '›'), tipo);
const usuario = () => window.auth && window.auth.currentUser;

async function pedir(datos) {
  const u = usuario();
  if (!u) throw new Error('Inicia sesión de nuevo');
  const r = await fetch('/api/usuarios', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + await u.getIdToken() },
    body: JSON.stringify(datos)
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No se pudo conectar (error ' + r.status + ')');
  return j;
}

// ── 1. Mi copia del rol ──
// ¿Las reglas me dejan leer lo del equipo? Solo un "sin permiso" cuenta como no
async function puedoLeer() {
  try {
    await window.getDoc(window.doc(window.db, 'config', 'geraldine'));
    return true;
  } catch (e) {
    return e.code !== 'permission-denied';
  }
}
async function miRol() {
  const antes = await puedoLeer();
  const r = await pedir({ accion: 'mi-rol' });
  // Si no podía leer y ya puede, se recarga para que las listas se llenen (solo pasa si faltaba la copia)
  if (!antes && r.rol && await puedoLeer()) location.reload();
  return r;
}

// ── 2. Dirección: copiar a todos cuando cambia alguien ──
const firma = () => ((window.data && window.data.usuarios) || []).map(u => [u.id, u.uid, u.rol].join(':')).sort().join('|');

let uid = null, copiado = false, ultima = '', intentos = 0, proximo = 0, ocupado = false;
async function revisarSesion() {
  const u = usuario();
  if (!u) { uid = null; return; }
  if (u.uid !== uid) { uid = u.uid; copiado = false; ultima = ''; intentos = 0; proximo = 0; }
  if (ocupado || !window.getDoc || !window.db || Date.now() < proximo) return;
  ocupado = true;
  try {
    if (!copiado) {
      const r = await miRol();
      // En el primer ingreso el perfil puede tardar un momento en existir
      if (r.rol || ++intentos >= 3) { copiado = true; intentos = 0; } else proximo = Date.now() + 5000;
    } else if (window.currentRole === 'admin') {
      pintarPanel();
      const ahora = firma();
      if (ahora && ahora !== ultima) {
        await pedir({ accion: 'sincronizar' });
        ultima = ahora;
        intentos = 0;
      }
    }
  } catch (e) {
    console.warn('permisos:', e.message);
    // Sin internet o servidor sin actualizar: se reintenta cada vez más espaciado
    proximo = Date.now() + Math.min(10 * 60000, 15000 * 2 ** Math.min(intentos++, 6));
  } finally {
    ocupado = false;
  }
}
setInterval(revisarSesion, 2000);

// ── 3. Panel en Usuarios ──
const lineas = i => {
  const t = [i.listo ? '✅ Listo para activar las reglas por rol (Nivel 2).' : '⚠️ Todavía NO actives las reglas por rol (Nivel 2).',
    'Cuentas activas: ' + i.cuentas + ' · con permiso preparado: ' + i.listos + ' · administradores: ' + i.admins];
  const lista = (titulo, l) => { if (l && l.length) t.push('', titulo, ...l.map(x => '  • ' + x)); };
  lista('Perfiles que se acaban de crear como Dirección (revisa su rol en la lista):', i.perfilesCreados);
  lista('Falta prepararles el permiso (toca "Preparar permisos"):', i.pendientes);
  lista('Cuentas antiguas sin perfil (hoy entran como Dirección):', i.sinPerfil);
  lista('Con un rol que no existe (cámbialo en la lista):', (i.rolNoValido || []).map(x => x.cuenta + ' → ' + x.rol));
  lista('Con perfil repetido (vale el primero; revisa que sea el correcto):', (i.repetidos || []).map(x => x.cuenta + ' → ' + x.roles.join(', ')));
  lista('Cuentas sin perfil que hoy no pueden entrar (revísalas en Firebase):', i.sinPerfilNuevas);
  lista('Perfiles de la lista sin cuenta para entrar:', i.perfilesSinCuenta);
  t.push('', i.mercadoLibre ? 'Mercado Libre: configuración compartida correcta.' : 'Mercado Libre: falta config/ml_global (ver la guía antes de pegar las reglas).');
  return t.join('\n');
};

async function correr(boton, salida, preparar) {
  boton.disabled = true;
  salida.hidden = false;
  salida.textContent = 'Revisando…';
  try {
    let i = await pedir({ accion: preparar ? 'sincronizar' : 'revisar' });
    if (preparar && i.sinPerfil.length && window.confirm('Estas cuentas antiguas no tienen perfil y hoy entran como Dirección:\n\n' + i.sinPerfil.join('\n') +
      '\n\n¿Crearles su perfil de Dirección para que no se queden fuera?\nSi alguna no la conoces, toca Cancelar y deshabilítala en Firebase.')) {
      i = await pedir({ accion: 'sincronizar', crearPerfiles: true });
    }
    salida.textContent = lineas(i);
    if (preparar) aviso('Permisos preparados', 'success');
  } catch (e) {
    salida.textContent = e.message;
    aviso(e.message, 'error');
  } finally {
    boton.disabled = false;
  }
}

function pintarPanel() {
  const mod = document.getElementById('mod-usuarios');
  if (!mod || document.getElementById('permisos-panel')) return;
  const caja = document.createElement('details');
  caja.id = 'permisos-panel';
  caja.className = 'table-card';
  caja.style.cssText = 'margin-top:16px;padding:14px 16px';
  caja.innerHTML = '<summary style="cursor:pointer;font-weight:700">Permisos de la base de datos</summary>' +
    '<p style="margin:10px 0">Antes de activar las reglas por rol en Firebase, toca "Preparar permisos" y espera el ✅.</p>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn btn-secondary btn-sm" data-permisos="revisar">Revisar</button>' +
    '<button type="button" class="btn btn-primary btn-sm" data-permisos="preparar">Preparar permisos</button></div>' +
    '<pre hidden aria-live="polite" style="margin-top:12px;white-space:pre-wrap;word-break:break-word;font:inherit;font-size:13px"></pre>';
  const salida = caja.querySelector('pre');
  caja.querySelectorAll('[data-permisos]').forEach(b => b.addEventListener('click', () => correr(b, salida, b.dataset.permisos === 'preparar')));
  mod.appendChild(caja);
}
