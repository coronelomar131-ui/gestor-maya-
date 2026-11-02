// Servidor MCP de Maya Autopartes (Streamable HTTP, sin sesión) y su OAuth.
// vercel.json manda aquí /.well-known/oauth-* y /oauth/* con ?ruta=...
process.env.TZ = 'America/Mexico_City';

const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const oauth = require('../mcp/oauth');
const { crearServidor } = require('../mcp/herramientas');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id'
};

function rutaDe(req) {
  const u = new URL(req.url, 'http://local');
  const ruta = u.searchParams.get('ruta') || (req.query && req.query.ruta);
  if (ruta) return String(ruta);
  if (u.pathname.startsWith('/.well-known/oauth-protected-resource')) return 'recurso';
  if (u.pathname.startsWith('/.well-known/oauth-authorization-server') || u.pathname.startsWith('/.well-known/openid-configuration')) return 'servidor';
  const m = /^\/oauth\/([a-z]+)\/?$/.exec(u.pathname);
  return m ? m[1] : 'mcp';
}

function enviar(res, status, cuerpo, encabezados) {
  const h = Object.assign({}, encabezados);
  let texto = cuerpo;
  if (typeof cuerpo !== 'string') {
    texto = JSON.stringify(cuerpo);
    h['Content-Type'] = h['Content-Type'] || 'application/json';
  }
  res.writeHead(status, h);
  res.end(texto);
}

// Vercel ya entrega req.body interpretado; en un servidor Node simple hay que leer el flujo
async function leerCuerpo(req) {
  let crudo;
  try {
    crudo = req.body;
  } catch (e) {
    return { invalido: true };
  }
  if (crudo === undefined) {
    const partes = [];
    for await (const parte of req) partes.push(parte);
    crudo = Buffer.concat(partes);
  }
  if (Buffer.isBuffer(crudo)) crudo = crudo.toString('utf8');
  if (typeof crudo !== 'string') return { valor: crudo || {} };
  if (!crudo.trim()) return { valor: {} };
  const tipo = String(req.headers['content-type'] || '');
  if (tipo.includes('application/x-www-form-urlencoded')) return { valor: Object.fromEntries(new URLSearchParams(crudo)) };
  try {
    return { valor: JSON.parse(crudo) };
  } catch (e) {
    return tipo.includes('json') ? { invalido: true } : { valor: Object.fromEntries(new URLSearchParams(crudo)) };
  }
}

async function atenderMcp(req, res) {
  const auth = await oauth.autenticar(req);
  if (!auth.usuario) {
    return enviar(res, 401, { error: auth.error || 'unauthorized', error_description: 'Conecta Maya Autopartes desde Claude para iniciar sesión' },
      Object.assign({ 'WWW-Authenticate': oauth.desafio(req, auth.error) }, CORS));
  }
  if (req.method !== 'POST') {
    return enviar(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }, Object.assign({ Allow: 'POST' }, CORS));
  }
  const cuerpo = await leerCuerpo(req);
  if (cuerpo.invalido) return enviar(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }, CORS);

  Object.keys(CORS).forEach(k => res.setHeader(k, CORS[k]));
  const servidor = crearServidor(auth.usuario);
  const transporte = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    transporte.close();
    servidor.close();
  });
  await servidor.connect(transporte);
  await transporte.handleRequest(req, res, cuerpo.valor);
}

module.exports = async function handler(req, res) {
  const ruta = rutaDe(req);
  try {
    if (req.method === 'OPTIONS' && ruta !== 'authorize') return enviar(res, 204, '', CORS);

    if (ruta === 'recurso' || ruta === 'servidor') {
      if (req.method !== 'GET') return enviar(res, 405, { error: 'method_not_allowed' }, CORS);
      return enviar(res, 200, ruta === 'recurso' ? oauth.metadataRecurso(req) : oauth.metadataServidor(req), CORS);
    }

    if (ruta === 'authorize') {
      if (req.method !== 'GET' && req.method !== 'POST') return enviar(res, 405, 'Método no permitido', { 'Content-Type': 'text/plain; charset=utf-8' });
      let parametros = Object.assign({}, req.query, Object.fromEntries(new URL(req.url, 'http://local').searchParams));
      if (req.method === 'POST') {
        const cuerpo = await leerCuerpo(req);
        parametros = cuerpo.valor || {};
      }
      const r = await oauth.autorizar(req, parametros, req.method);
      if (r.redirigir) return enviar(res, 302, '', { Location: r.redirigir, 'Cache-Control': 'no-store' });
      return enviar(res, r.status, r.html, r.encabezados);
    }

    if (ruta === 'register' || ruta === 'token' || ruta === 'revoke') {
      if (req.method !== 'POST') return enviar(res, 405, { error: 'method_not_allowed' }, CORS);
      const cuerpo = await leerCuerpo(req);
      if (cuerpo.invalido) return enviar(res, 400, { error: 'invalid_request', error_description: 'Body could not be parsed' }, CORS);
      const r = ruta === 'register' ? oauth.registrar(cuerpo.valor)
        : ruta === 'token' ? await oauth.token(req, cuerpo.valor)
          : await oauth.revocar(cuerpo.valor);
      return enviar(res, r.status, r.cuerpo, Object.assign({ 'Cache-Control': 'no-store', Pragma: 'no-cache' }, CORS));
    }

    return await atenderMcp(req, res);
  } catch (e) {
    console.error('MCP ' + ruta + ':', e);
    if (!res.headersSent) enviar(res, 500, { error: 'server_error', error_description: 'Error interno; revisa los logs de la función' }, CORS);
  }
};
