// WhatsApp de Pepito Junior (WhatsApp Cloud API de Meta). Variables en Vercel:
//   WHATSAPP_TOKEN (token permanente), WHATSAPP_PHONE_ID (id del número), WHATSAPP_VERIFY_TOKEN (lo inventas tú),
//   WHATSAPP_APP_SECRET (secreto de la app de Meta, para comprobar que el mensaje viene de Meta), opcional WHATSAPP_GRAPH_VERSION.
// Solo contesta a números dados de alta en el perfil de un usuario del gestor (Pepito → WhatsApp del equipo).
process.env.TZ = 'America/Mexico_City';
const crypto = require('crypto');
const pepito = require('../mcp/pepito');
const acceso = require('../mcp/acceso');
const { fb } = require('../mcp/firebase');

const VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';
const SI = /^(s[ií]|si+|confirm[oa]?|dale|va|ok|okay|adelante|gu[aá]rdal[ao])[.!\s]*$/i;
const NO = /^(no|cancela(r)?|mejor no|no gracias)[.!\s]*$/i;

async function crudo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  return Buffer.concat(partes);
}

function firmaValida(raw, firma) {
  const secreto = String(process.env.WHATSAPP_APP_SECRET || '').trim();
  if (!secreto) return true;
  if (!raw.length || !firma) return false;
  const esperada = 'sha256=' + crypto.createHmac('sha256', secreto).update(raw).digest('hex');
  const a = Buffer.from(esperada), b = Buffer.from(String(firma));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// En México WhatsApp entrega 521 + 10 dígitos y para contestar hay que mandar 52 + 10 dígitos
const destino = n => { const d = String(n).replace(/\D/g, ''); return /^521\d{10}$/.test(d) ? '52' + d.slice(3) : d; };

// Lo último que pasó con el webhook (para diagnosticar sin ver los logs de Vercel): config/whatsapp_estado
async function anotar(paso, detalle) {
  try {
    const previo = (await fb().obtener('config', 'whatsapp_estado')) || {};
    const evento = { ts: new Date().toISOString(), paso, detalle: detalle ? String(detalle).slice(0, 400) : '' };
    await fb().guardar('config', 'whatsapp_estado', { ultimo: evento, historial: [evento].concat(previo.historial || []).slice(0, 8) });
  } catch (e) { console.error('whatsapp: no se pudo anotar', e.message); }
}

async function enviar(para, texto) {
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${String(process.env.WHATSAPP_PHONE_ID || '').trim()}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + String(process.env.WHATSAPP_TOKEN || '').trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: destino(para), type: 'text', text: { preview_url: false, body: String(texto).slice(0, 4000) } })
  });
  if (r.ok) { await anotar('respuesta enviada', 'a ...' + String(para).slice(-4)); return; }
  const error = (await r.text()).slice(0, 300);
  console.error('whatsapp: no se pudo enviar', r.status, error);
  await anotar('Meta rechazó la respuesta (' + r.status + ')', error);
}

module.exports = async (req, res) => {
  // Meta verifica el webhook con un GET al darlo de alta
  if (req.method === 'GET') {
    const q = new URL(req.url, 'http://x').searchParams;
    const esperado = String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
    if (q.get('hub.mode') === 'subscribe') {
      if (esperado && String(q.get('hub.verify_token') || '').trim() === esperado) {
        res.setHeader('Content-Type', 'text/plain');
        return res.status(200).send(String(q.get('hub.challenge') || ''));
      }
      console.error('whatsapp: verificación rechazada', esperado ? '(el token no coincide)' : '(falta WHATSAPP_VERIFY_TOKEN)');
      return res.status(403).send(esperado ? 'El token de verificación no coincide con WHATSAPP_VERIFY_TOKEN' : 'Falta WHATSAPP_VERIFY_TOKEN en Vercel');
    }
    // Abierta en el navegador: dice qué variables ve el servidor (sin mostrar sus valores) y qué pasó con el último mensaje
    const estado = await fb().obtener('config', 'whatsapp_estado').catch(() => null);
    return res.status(200).json({
      ultimo_evento: estado ? estado.ultimo : 'Todavía no ha llegado ningún mensaje de Meta',
      historial: estado ? estado.historial : [],
      webhook: 'ok',
      variables: {
        WHATSAPP_VERIFY_TOKEN: !!esperado,
        WHATSAPP_TOKEN: !!process.env.WHATSAPP_TOKEN,
        WHATSAPP_PHONE_ID: !!process.env.WHATSAPP_PHONE_ID,
        WHATSAPP_APP_SECRET: !!process.env.WHATSAPP_APP_SECRET,
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY
      }
    });
  }
  if (req.method !== 'POST') return res.status(405).send('no');
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) { await anotar('llegó un mensaje pero faltan WHATSAPP_TOKEN o WHATSAPP_PHONE_ID'); return res.status(200).json({ ok: false, motivo: 'WhatsApp sin configurar' }); }

  const raw = await crudo(req);
  if (!firmaValida(raw, req.headers['x-hub-signature-256'])) {
    console.error('whatsapp: firma inválida o cuerpo vacío');
    await anotar(raw.length ? 'firma inválida: revisa que WHATSAPP_APP_SECRET sea la clave secreta de esta app' : 'cuerpo vacío al leer el mensaje');
    return res.status(401).send('firma');
  }
  let datos;
  try { datos = JSON.parse(raw.toString('utf8') || '{}'); } catch (e) { return res.status(400).send('json'); }
  const valor = datos.entry && datos.entry[0] && datos.entry[0].changes && datos.entry[0].changes[0] && datos.entry[0].changes[0].value;
  const msg = valor && valor.messages && valor.messages[0];
  if (!msg) return res.status(200).json({ ok: true }); // avisos de entregado/leído
  await anotar('llegó mensaje de WhatsApp', 'de ...' + String(msg.from).slice(-4) + ' · tipo ' + msg.type);

  // Meta reintenta si tardamos: no procesar dos veces el mismo mensaje
  if (await fb().obtener('whatsapp_vistos', msg.id)) return res.status(200).json({ ok: true, repetido: true });
  await fb().guardar('whatsapp_vistos', msg.id, { de: acceso.diez(msg.from), ts: Date.now() });

  const usuario = await acceso.porWhatsApp(msg.from);
  if (!usuario) {
    await anotar('número no registrado en el gestor', '...' + String(msg.from).slice(-4) + ' (Pepito → WhatsApp del equipo)');
    await enviar(msg.from, 'Hola, soy Pepito Junior de Maya Autopartes. Este número no está dado de alta en el gestor; pídele a un administrador que lo registre.');
    return res.status(200).json({ ok: true });
  }
  try {
    let texto;
    if (msg.type !== 'text') {
      texto = msg.type === 'audio' ? 'Todavía no puedo escuchar notas de voz. Escríbeme tu pedido, porfa.' : 'Por ahora solo entiendo mensajes de texto.';
    } else {
      const t = String(msg.text && msg.text.body || '').trim();
      const conv = await fb().obtener('pepito_conversacion', usuario.uid);
      if (conv && conv.propuesta && (SI.test(t) || NO.test(t))) {
        texto = (await pepito.resolverPropuesta(usuario, conv.propuesta.id, SI.test(t), 'whatsapp')).texto;
      } else {
        const r = await pepito.conversar(usuario, t, 'whatsapp');
        texto = r.texto + (r.propuesta ? '\n\nResponde *SÍ* para guardarlo o *NO* para cancelar.' : '');
      }
    }
    await enviar(msg.from, texto);
  } catch (e) {
    console.error('whatsapp/pepito:', e);
    await anotar('Pepito falló al contestar', e.message);
    await enviar(msg.from, e.limite ? e.message : 'Uy, no pude contestar ahorita. Intenta otra vez en un momento.');
  }
  return res.status(200).json({ ok: true });
};
