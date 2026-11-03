// OAuth 2.1 para que Claude se conecte al MCP con la cuenta de la app (Firebase Auth).
// Códigos y tokens se guardan en Firestore solo como hash SHA-256; el token real nunca se almacena.
const crypto = require('crypto');
const { fb, CONFIG_WEB } = require('./firebase');

const CODIGOS = 'mcp_codigos';
const ACCESOS = 'mcp_tokens';
// Igual que CORTE_CUENTAS de public/index.html: cuentas creadas antes conservan el acceso que tenían
const CORTE_CUENTAS = Date.parse('2026-11-04T06:00:00Z');
const REFRESCOS = 'mcp_refresh';
const VIDA_CODIGO = 5 * 60 * 1000;
const VIDA_ACCESO = 60 * 60 * 1000;
const VIDA_REFRESCO = 30 * 24 * 60 * 60 * 1000;
const ALCANCE = 'maya';
const FIREBASE_JS = 'https://www.gstatic.com/firebasejs/10.12.0';

const aleatorio = () => crypto.randomBytes(32).toString('base64url');
const huella = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function origen(req) {
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const proto = String(req.headers['x-forwarded-proto'] || (local ? 'http' : 'https')).split(',')[0].trim();
  return proto + '://' + host;
}

const recurso = req => origen(req) + '/api/mcp';
const mismoRecurso = (req, valor) => !valor || String(valor).replace(/\/+$/, '') === recurso(req);

function metadataServidor(req) {
  const o = origen(req);
  return {
    issuer: o,
    authorization_endpoint: o + '/oauth/authorize',
    token_endpoint: o + '/oauth/token',
    registration_endpoint: o + '/oauth/register',
    revocation_endpoint: o + '/oauth/revoke',
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [ALCANCE]
  };
}

function metadataRecurso(req) {
  return {
    resource: recurso(req),
    authorization_servers: [origen(req)],
    scopes_supported: [ALCANCE],
    bearer_methods_supported: ['header'],
    resource_name: 'Maya Autopartes'
  };
}

// Solo Claude (claude.ai / claude.com) y programas locales (Claude Code, MCP Inspector) pueden recibir el código
function redirectPermitido(uri) {
  let u;
  try {
    u = new URL(uri);
  } catch (e) {
    return false;
  }
  if (u.hash) return false;
  if (u.protocol === 'https:' && /(^|\.)claude\.(ai|com)$/.test(u.hostname)) return true;
  return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}

// Registro dinámico sin guardar nada: el client_id lleva sus direcciones de regreso, que se revalidan en cada uso
function registrar(cuerpo) {
  const uris = Array.isArray(cuerpo && cuerpo.redirect_uris) ? cuerpo.redirect_uris : [];
  if (!uris.length || uris.length > 5 || !uris.every(u => typeof u === 'string' && u.length <= 500 && redirectPermitido(u))) {
    return { status: 400, cuerpo: { error: 'invalid_redirect_uri', error_description: 'Only Claude (claude.ai, claude.com) or local redirect URIs are accepted' } };
  }
  const nombre = String((cuerpo && cuerpo.client_name) || 'Cliente MCP').slice(0, 80);
  return {
    status: 201,
    cuerpo: {
      client_id: 'maya.' + Buffer.from(JSON.stringify({ r: uris, n: nombre })).toString('base64url'),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: nombre,
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: ALCANCE
    }
  };
}

function leerCliente(clientId) {
  if (typeof clientId !== 'string' || !clientId.startsWith('maya.')) return null;
  try {
    const d = JSON.parse(Buffer.from(clientId.slice(5), 'base64url').toString('utf8'));
    if (!Array.isArray(d.r) || !d.r.length || !d.r.every(u => typeof u === 'string' && redirectPermitido(u))) return null;
    return { redirectUris: d.r, nombre: String(d.n || 'Cliente MCP') };
  } catch (e) {
    return null;
  }
}

function conParametros(uri, params) {
  const u = new URL(uri);
  Object.keys(params).forEach(k => {
    if (params[k] != null && params[k] !== '') u.searchParams.set(k, params[k]);
  });
  return u.toString();
}

// { error } cuando no hay a dónde regresar; { redirigir } con error OAuth; { ok } con la solicitud válida
function validarAutorizacion(req, p) {
  const cliente = leerCliente(p.client_id);
  if (!cliente) return { error: 'La aplicación que intenta conectarse no está registrada. Quita el conector en Claude y vuelve a agregarlo.' };
  const redirectUri = p.redirect_uri || (cliente.redirectUris.length === 1 ? cliente.redirectUris[0] : '');
  if (!redirectUri || !cliente.redirectUris.includes(redirectUri)) return { error: 'La dirección de regreso no es válida.' };
  const regresarError = (error, descripcion) => ({ redirigir: conParametros(redirectUri, { error, error_description: descripcion, state: p.state }) });
  if (p.response_type !== 'code') return regresarError('unsupported_response_type', 'Only response_type=code is supported');
  if (!p.code_challenge || p.code_challenge_method !== 'S256') return regresarError('invalid_request', 'PKCE with S256 is required');
  if (!mismoRecurso(req, p.resource)) return regresarError('invalid_target', 'Unknown resource');
  return {
    ok: {
      cliente, clientId: p.client_id, redirectUri, state: p.state || '', codeChallenge: p.code_challenge,
      resource: p.resource || '', scope: p.scope || ALCANCE
    }
  };
}

function paginaError(mensaje) {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Maya Autopartes</title></head><body style="font-family:system-ui,sans-serif;background:#0b1220;color:#e2e8f0;display:grid;place-items:center;min-height:100vh;margin:0">' +
    '<p style="max-width:420px;padding:24px;text-align:center">' + esc(mensaje) + '</p></body></html>';
}

function paginaLogin(v, mensaje, nonce) {
  const destino = new URL(v.redirectUri).host;
  const ocultos = {
    response_type: 'code', client_id: v.clientId, redirect_uri: v.redirectUri, state: v.state,
    code_challenge: v.codeChallenge, code_challenge_method: 'S256', resource: v.resource, scope: v.scope, id_token: ''
  };
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectar Maya Autopartes</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: #0b1220; color: #e2e8f0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
  .tarjeta { width: 100%; max-width: 400px; background: #131d33; border: 1px solid #22304d; border-radius: 14px; padding: 28px 24px; }
  .marca { font-weight: 800; letter-spacing: .12em; color: #3bbcd4; font-size: 13px; }
  h1 { font-size: 20px; margin: 8px 0 6px; }
  p { color: #94a3b8; font-size: 14px; line-height: 1.5; margin: 0 0 14px; }
  label { display: block; font-size: 12px; color: #94a3b8; margin: 14px 0 6px; text-transform: uppercase; letter-spacing: .05em; }
  input { width: 100%; padding: 11px 12px; border-radius: 8px; border: 1px solid #2b3b5c; background: #0e1628; color: #f8fafc; font-size: 15px; }
  button { width: 100%; margin-top: 20px; padding: 12px; border: 0; border-radius: 8px; background: #3bbcd4; color: #04212a; font-weight: 700; font-size: 15px; cursor: pointer; }
  button:disabled { opacity: .6; cursor: wait; }
  .error { color: #fca5a5; font-size: 13px; min-height: 18px; margin-top: 12px; }
  .nota { font-size: 12px; color: #64748b; margin-top: 16px; }
</style></head>
<body><form class="tarjeta" id="f" method="post" action="/oauth/authorize">
  <div class="marca">MAYA AUTOPARTES</div>
  <h1>Conectar con ${esc(v.cliente.nombre)}</h1>
  <p>${esc(v.cliente.nombre)} podrá consultar y registrar notas, ventas, clientes, inventario y lo demás de la app con los mismos permisos que tiene tu cuenta. Siempre te pedirá confirmar antes de guardar o borrar.</p>
  ${Object.keys(ocultos).map(k => `<input type="hidden" name="${k}" value="${esc(ocultos[k])}">`).join('\n  ')}
  <label for="correo">Correo de la app</label>
  <input id="correo" type="email" autocomplete="username" required>
  <label for="clave">Contraseña</label>
  <input id="clave" type="password" autocomplete="current-password" required>
  <button id="boton" type="submit">Entrar y conectar</button>
  <div class="error" id="error">${esc(mensaje || '')}</div>
  <div class="nota">Al terminar regresarás a ${esc(destino)}.</div>
</form>
<script type="module" nonce="${nonce}">
  import { initializeApp } from '${FIREBASE_JS}/firebase-app.js';
  import { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword } from '${FIREBASE_JS}/firebase-auth.js';
  const auth = initializeAuth(initializeApp(${JSON.stringify(CONFIG_WEB)}), { persistence: inMemoryPersistence });
  const form = document.getElementById('f');
  const boton = document.getElementById('boton');
  const error = document.getElementById('error');
  const mensajes = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'Correo o contraseña incorrectos.',
    'auth/invalid-email': 'El correo no es válido.',
    'auth/user-disabled': 'Esta cuenta está desactivada.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
    'auth/network-request-failed': 'Sin conexión. Revisa tu internet.'
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    boton.disabled = true;
    boton.textContent = 'Verificando...';
    error.textContent = '';
    try {
      const cred = await signInWithEmailAndPassword(auth, document.getElementById('correo').value.trim(), document.getElementById('clave').value);
      form.id_token.value = await cred.user.getIdToken();
      form.submit();
    } catch (err) {
      error.textContent = mensajes[err.code] || 'No se pudo iniciar sesión (' + (err.code || err.message) + ').';
      boton.disabled = false;
      boton.textContent = 'Entrar y conectar';
    }
  });
</script></body></html>`;
}

function encabezadosPagina(v, nonce) {
  // form-action incluye el destino del redirect: Chrome también aplica form-action a la redirección del POST
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    // Solo el origen: la API key web de Firebase puede estar restringida por dominio y lo revisa en el Referer
    'Referrer-Policy': 'strict-origin',
    // strict-dynamic: Firebase puede cargar lo que necesite (p. ej. reCAPTCHA) a partir del script con nonce
    'Content-Security-Policy': [
      "default-src 'none'",
      "script-src 'nonce-" + nonce + "' 'strict-dynamic' https:",
      'connect-src https:',
      "style-src 'unsafe-inline'",
      'img-src https: data:',
      'frame-src https:',
      "form-action 'self' " + new URL(v.redirectUri).origin,
      "frame-ancestors 'none'",
      "base-uri 'none'"
    ].join('; ')
  };
}

async function autorizar(req, p, metodo) {
  const v = validarAutorizacion(req, p);
  if (v.error) return { status: 400, html: paginaError(v.error), encabezados: { 'Content-Type': 'text/html; charset=utf-8' } };
  if (v.redirigir) return { redirigir: v.redirigir };
  const nonce = crypto.randomBytes(16).toString('base64');
  if (metodo === 'GET') return { status: 200, html: paginaLogin(v.ok, '', nonce), encabezados: encabezadosPagina(v.ok, nonce) };

  let cuenta;
  try {
    cuenta = await fb().verificarIdToken(p.id_token);
  } catch (e) {
    return { status: 401, html: paginaLogin(v.ok, 'No se pudo verificar tu sesión. Intenta de nuevo.', nonce), encabezados: encabezadosPagina(v.ok, nonce) };
  }
  const codigo = aleatorio();
  await fb().guardar(CODIGOS, huella(codigo), {
    uid: cuenta.uid, email: cuenta.email, clientId: v.ok.clientId, cliente: v.ok.cliente.nombre,
    redirectUri: v.ok.redirectUri, codeChallenge: v.ok.codeChallenge, resource: v.ok.resource, expira: Date.now() + VIDA_CODIGO
  });
  return { redirigir: conParametros(v.ok.redirectUri, { code: codigo, state: v.ok.state }) };
}

async function emitir(req, datos, clientId) {
  const acceso = aleatorio();
  const refresco = aleatorio();
  const ahora = Date.now();
  const base = { uid: datos.uid, email: datos.email || '', clientId, cliente: datos.cliente || '', resource: recurso(req), creado: ahora };
  await Promise.all([
    fb().guardar(ACCESOS, huella(acceso), Object.assign({ expira: ahora + VIDA_ACCESO }, base)),
    fb().guardar(REFRESCOS, huella(refresco), Object.assign({ expira: ahora + VIDA_REFRESCO }, base))
  ]);
  return { access_token: acceso, token_type: 'Bearer', expires_in: VIDA_ACCESO / 1000, refresh_token: refresco, scope: ALCANCE };
}

async function token(req, p) {
  const error = (codigo, descripcion, status) => ({ status: status || 400, cuerpo: { error: codigo, error_description: descripcion } });
  // Algunos clientes mandan el client_id en Authorization: Basic en lugar del cuerpo
  const basica = /^Basic\s+(\S+)$/i.exec(String(req.headers.authorization || ''));
  if (!p.client_id && basica) p = Object.assign({}, p, { client_id: decodeURIComponent(Buffer.from(basica[1], 'base64').toString('utf8').split(':')[0]) });
  if (!leerCliente(p.client_id)) return error('invalid_client', 'Unknown client_id', 401);
  if (!mismoRecurso(req, p.resource)) return error('invalid_target', 'Unknown resource');

  if (p.grant_type === 'authorization_code') {
    if (!p.code || !p.code_verifier) return error('invalid_request', 'code and code_verifier are required');
    const c = await fb().tomar(CODIGOS, huella(p.code));
    if (!c || c.expira < Date.now()) return error('invalid_grant', 'The authorization code is invalid or expired');
    if (c.clientId !== p.client_id) return error('invalid_grant', 'The authorization code belongs to another client');
    if (p.redirect_uri && p.redirect_uri !== c.redirectUri) return error('invalid_grant', 'redirect_uri does not match');
    if (crypto.createHash('sha256').update(String(p.code_verifier)).digest('base64url') !== c.codeChallenge) return error('invalid_grant', 'PKCE verification failed');
    return { status: 200, cuerpo: await emitir(req, c, p.client_id) };
  }

  if (p.grant_type === 'refresh_token') {
    if (!p.refresh_token) return error('invalid_request', 'refresh_token is required');
    const r = await fb().tomar(REFRESCOS, huella(p.refresh_token));
    if (!r || r.expira < Date.now() || r.clientId !== p.client_id) return error('invalid_grant', 'The refresh token is invalid or expired');
    if (!(await fb().usuarioActivo(r.uid))) return error('invalid_grant', 'The account is disabled');
    return { status: 200, cuerpo: await emitir(req, r, p.client_id) };
  }

  return error('unsupported_grant_type', 'Only authorization_code and refresh_token are supported');
}

async function revocar(p) {
  if (p && p.token) await Promise.all([fb().borrar(ACCESOS, huella(p.token)), fb().borrar(REFRESCOS, huella(p.token))]);
  return { status: 200, cuerpo: {} };
}

// Usuario dueño del token (rol tomado como lo hace loadUserProfile() de la app), o { error }
async function autenticar(req) {
  const m = /^Bearer\s+(\S+)\s*$/i.exec(String(req.headers.authorization || ''));
  if (!m) return { error: null };
  const t = await fb().obtener(ACCESOS, huella(m[1]));
  if (!t || t.expira < Date.now() || (t.resource && t.resource !== recurso(req))) return { error: 'invalid_token' };
  const perfil = await fb().perfil(t.uid);
  if (!perfil) {
    // Sin perfil en "usuarios": antes entraba como admin. Se respeta solo para cuentas creadas antes de cerrar
    // el registro (la app les crea su perfil al entrar); una cuenta nueva sin perfil no tiene acceso.
    const creada = await fb().cuentaCreada(t.uid);
    if (!(creada && creada < CORTE_CUENTAS)) return { error: 'invalid_token' };
  }
  return {
    usuario: {
      uid: t.uid,
      email: t.email,
      nombre: (perfil && perfil.nombre) || t.email,
      rol: perfil ? (perfil.rol || 'vendedor') : 'admin'
    }
  };
}

function desafio(req, error) {
  const partes = ['resource_metadata="' + origen(req) + '/.well-known/oauth-protected-resource/api/mcp"'];
  if (error) partes.unshift('error="' + error + '"', 'error_description="The access token is invalid or expired"');
  return 'Bearer ' + partes.join(', ');
}

module.exports = { metadataServidor, metadataRecurso, registrar, autorizar, token, revocar, autenticar, desafio, redirectPermitido };
