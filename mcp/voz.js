// Notas de voz de WhatsApp a texto. Claude no recibe audio, así que se transcribe con Whisper:
// GROQ_API_KEY (plan gratis de Groq, whisper-large-v3-turbo) u OPENAI_API_KEY (whisper-1), la que esté en Vercel.
const wa = require('./whatsapp');

function proveedor() {
  if (String(process.env.GROQ_API_KEY || '').trim()) {
    return { url: 'https://api.groq.com/openai/v1/audio/transcriptions', llave: String(process.env.GROQ_API_KEY).trim(), modelo: process.env.VOZ_MODELO || 'whisper-large-v3-turbo', nombre: 'Groq' };
  }
  if (String(process.env.OPENAI_API_KEY || '').trim()) {
    return { url: 'https://api.openai.com/v1/audio/transcriptions', llave: String(process.env.OPENAI_API_KEY).trim(), modelo: process.env.VOZ_MODELO || 'whisper-1', nombre: 'OpenAI' };
  }
  return null;
}
const configurada = () => !!proveedor();

// Descarga el audio de Meta: primero se pide la URL del archivo con su id y luego el archivo, ambos con el token
async function bajarAudio(mediaId) {
  const h = { Authorization: 'Bearer ' + String(process.env.WHATSAPP_TOKEN || '').trim() };
  const info = await fetch(`https://graph.facebook.com/${wa.VERSION}/${encodeURIComponent(mediaId)}`, { headers: h });
  if (!info.ok) throw new Error('Meta no dio el audio (' + info.status + ')');
  const { url, mime_type: mime } = await info.json();
  const archivo = await fetch(url, { headers: h });
  if (!archivo.ok) throw new Error('No se pudo descargar el audio (' + archivo.status + ')');
  return { datos: Buffer.from(await archivo.arrayBuffer()), mime: mime || 'audio/ogg' };
}

async function transcribir(mediaId) {
  const p = proveedor();
  if (!p) throw new Error('Sin servicio de voz configurado');
  const { datos, mime } = await bajarAudio(mediaId);
  if (datos.length > 24 * 1024 * 1024) throw new Error('La nota de voz es demasiado larga');
  const form = new FormData();
  form.append('file', new Blob([datos], { type: mime.split(';')[0] }), 'nota.ogg');
  form.append('model', p.modelo);
  form.append('language', 'es');
  form.append('response_format', 'json');
  const r = await fetch(p.url, { method: 'POST', headers: { Authorization: 'Bearer ' + p.llave }, body: form });
  if (!r.ok) throw new Error(p.nombre + ' no pudo transcribir (' + r.status + '): ' + (await r.text()).slice(0, 200));
  const texto = String((await r.json()).text || '').trim();
  if (!texto) throw new Error('No se entendió nada en la nota de voz');
  return texto;
}

module.exports = { transcribir, configurada };
