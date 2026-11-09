// WhatsApp de Pepito Junior (WhatsApp Cloud API de Meta). Variables en Vercel:
//   WHATSAPP_TOKEN (token permanente), WHATSAPP_PHONE_ID (id del número), WHATSAPP_VERIFY_TOKEN (lo inventas tú),
//   WHATSAPP_APP_SECRET (secreto de la app de Meta, para comprobar que el mensaje viene de Meta), opcional WHATSAPP_GRAPH_VERSION.
// Solo contesta a números dados de alta en el perfil de un usuario del gestor (Pepito → WhatsApp del equipo).
process.env.TZ = 'America/Mexico_City';
const crypto = require('crypto');
const pepito = require('../mcp/pepito');
const grupo = require('../mcp/grupo');
const acceso = require('../mcp/acceso');
const documentos = require('../mcp/documentos');
const voz = require('../mcp/voz');
const avisos = require('../mcp/avisos');
const { fb } = require('../mcp/firebase');

const wa = require('../mcp/whatsapp');
const VERSION = wa.VERSION;
// Respuestas cortas a una propuesta ("sí", "sí, guárdala", "dale", "no", "cancela"); en notas de voz llegan con puntuación
// (\b de JavaScript no reconoce letras con acento como "í", por eso se usa FIN)
const FIN = '(?=$|[\\s,.;:!¡])';
const NO = new RegExp('^(no' + FIN + '(?!\\s+s[eé])|cancel|mejor no|ni modo|olv[ií]dalo)', 'i');
const SI = new RegExp('^(s[ií]+' + FIN + '|sim[oó]n|confirm|dale' + FIN + '|va' + FIN + '|ok' + FIN + '|okay|adelante|gu[aá]rd|correcto|perfecto|as[ií] est[aá] bien)', 'i');
const esNo = t => t.length <= 40 && NO.test(t);
const esSi = t => t.length <= 40 && !esNo(t) && SI.test(t);

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


// Lo último que pasó con el webhook (para diagnosticar sin ver los logs de Vercel): config/whatsapp_estado
async function anotar(paso, detalle) {
  try {
    const previo = (await fb().obtener('config', 'whatsapp_estado')) || {};
    const evento = { ts: new Date().toISOString(), paso, detalle: detalle ? String(detalle).slice(0, 400) : '' };
    await fb().guardar('config', 'whatsapp_estado', { ultimo: evento, historial: [evento].concat(previo.historial || []).slice(0, 8) });
  } catch (e) { console.error('whatsapp: no se pudo anotar', e.message); }
}

async function enviar(para, texto) {
  const r = await wa.enviarTexto(para, texto);
  if (r.ok) { await anotar('respuesta enviada', 'a ...' + String(para).slice(-4)); return; }
  console.error('whatsapp: no se pudo enviar', r.status, r.crudo);
  await anotar('Meta rechazó la respuesta (' + r.status + ')', r.crudo);
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
    // ?suscribir=<id de la cuenta de WhatsApp Business>: suscribe esa cuenta a esta app para que Meta mande los mensajes aquí.
    // Usa el token de Vercel; solo afecta a cuentas a las que ese token ya tiene acceso. Muestra cómo quedó.
    const waba = String(q.get('suscribir') || '').replace(/\D/g, '');
    if (waba) {
      const token = String(process.env.WHATSAPP_TOKEN || '').trim();
      if (!token) return res.status(200).json({ ok: false, motivo: 'Falta WHATSAPP_TOKEN en Vercel' });
      const url = `https://graph.facebook.com/${VERSION}/${waba}/subscribed_apps`;
      const h = { Authorization: 'Bearer ' + token };
      const alta = await fetch(url, { method: 'POST', headers: h }).then(async r => ({ status: r.status, respuesta: await r.json().catch(() => null) }));
      const lista = await fetch(url, { headers: h }).then(async r => ({ status: r.status, respuesta: await r.json().catch(() => null) }));
      await anotar('suscripción de la cuenta ' + waba, 'alta ' + alta.status + ' · ' + JSON.stringify(alta.respuesta).slice(0, 200));
      return res.status(200).json({ suscribir: alta, apps_suscritas: lista });
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
        ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
        'GROQ_API_KEY u OPENAI_API_KEY (notas de voz)': voz.configurada()
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
  if (!msg) {
    // Avisos de Meta sobre lo que mandamos: entregado, leído o fallido (p. ej. fuera de las 24 horas)
    const estados = valor && valor.statuses;
    if (estados && estados.length) {
      try { for (const n of await avisos.procesarEstados(estados)) await anotar(n.paso, n.detalle); }
      catch (e) { console.error('whatsapp: estados', e); await anotar('no se pudo revisar un aviso de entrega', e.message); }
    }
    return res.status(200).json({ ok: true });
  }
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
  // Al escribir se abre su ventana de 24 horas: primero se le entrega lo que tenía guardado
  try {
    const n = await avisos.entregarPendientes(acceso.diez(msg.from));
    if (n) await anotar('pendientes entregados', n + ' a ...' + String(msg.from).slice(-4));
  } catch (e) { console.error('whatsapp: pendientes', e); }
  try {
    let texto;
    let adjunto = null;
    let t = null;
    let encabezado = '';
    let imagenes = null;
    if (msg.type === 'text') {
      t = String(msg.text && msg.text.body || '').trim();
    } else if (msg.type === 'audio' && voz.configurada()) {
      try {
        const dicho = await voz.transcribir(msg.audio && msg.audio.id);
        await anotar('nota de voz transcrita', dicho.slice(0, 120));
        t = dicho;
        encabezado = '🎙️ Entendí: "' + dicho + '"\n\n';
      } catch (e) {
        await anotar('no se pudo transcribir la nota de voz', e.message);
        texto = 'No pude escuchar bien tu nota de voz. ¿Me la mandas otra vez o me lo escribes?';
      }
    } else if (msg.type === 'image' || (msg.type === 'document' && /^image\//.test((msg.document && msg.document.mime_type) || ''))) {
      // Foto de una nota, lista o factura: Claude la lee y propone la nota (se confirma como siempre)
      const media = msg.image || msg.document;
      try {
        const { datos, mime } = await wa.bajarMedia(media.id);
        if (!/^image\/(jpeg|png|webp|gif)$/.test(mime)) throw new Error('Formato no soportado: ' + mime);
        if (datos.length > 4.5 * 1024 * 1024) throw new Error('La foto pesa más de 4.5 MB');
        imagenes = [{ mime, base64: datos.toString('base64') }];
        t = String(media.caption || '').trim() || 'Te mandé esta foto.';
        await anotar('foto recibida', mime + ' · ' + Math.round(datos.length / 1024) + ' KB');
      } catch (e) {
        await anotar('no se pudo leer la foto', e.message);
        texto = 'No pude abrir tu foto. ¿Me la mandas otra vez (que no pese tanto) o me escribes lo que necesitas?';
      }
    } else {
      texto = msg.type === 'audio' ? 'Todavía no puedo escuchar notas de voz. Escríbeme tu pedido, porfa.' : 'Por ahora entiendo texto, notas de voz y fotos.';
    }
    if (t !== null) {
      const conv = await fb().obtener('pepito_conversacion', usuario.uid);
      const corto = t.replace(/[.,!¡¿?\s]+$/g, '').trim();
      const alGrupo = !imagenes && !encabezado ? grupo.textoParaGrupo(t) : null;
      if (alGrupo) {
        // "grupo: ya salió la guía": se reparte tal cual a los demás del grupo, sin pasar por Claude
        try {
          const r = await grupo.mandar(usuario, alGrupo, { canal: 'whatsapp' });
          texto = r.enviado_a.length ? '👥 Listo, se lo mandé al grupo ' + grupo.NOMBRE + ': ' + r.enviado_a.join(', ') + '.' : '👥 Lo guardé en el grupo, pero todavía no hay nadie más en él.';
        } catch (e) { texto = e.noMiembro ? e.message : 'No pude mandarlo al grupo: ' + e.message; }
      } else if (!imagenes && conv && conv.propuesta && (esSi(corto) || esNo(corto))) {
        const r = await pepito.resolverPropuesta(usuario, conv.propuesta.id, esSi(corto), 'whatsapp');
        texto = r.texto;
        adjunto = documentos.deCreacion(r.herramienta, r.resultado);
      } else {
        const r = await pepito.conversar(usuario, (encabezado ? '(nota de voz) ' : imagenes ? '(foto) ' : '') + t, 'whatsapp', { imagenes });
        texto = r.texto + (r.propuesta ? '\n\nResponde *SÍ* para guardarlo o *NO* para cancelar.' : '');
      }
      texto = encabezado + texto;
    }
    await enviar(msg.from, texto);
    // Lo que se acaba de guardar llega como PDF adjunto, con el mismo diseño de la app
    if (adjunto) {
      const r = await documentos.mandar(msg.from, adjunto.tipo, adjunto.id, adjunto.folio ? '📄 ' + adjunto.folio : '');
      await anotar(r.ok ? 'PDF enviado' : 'no se pudo adjuntar el PDF', r.ok ? r.archivo : r.error);
    }
  } catch (e) {
    console.error('whatsapp/pepito:', e);
    await anotar('Pepito falló al contestar', e.message);
    await enviar(msg.from, e.limite ? e.message : 'Uy, no pude contestar ahorita. Intenta otra vez en un momento.');
  }
  return res.status(200).json({ ok: true });
};
