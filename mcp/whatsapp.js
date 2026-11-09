// Envío de mensajes de WhatsApp (WhatsApp Cloud API de Meta). Lo usan el webhook (api/whatsapp.js) y Pepito
// (herramienta enviar_whatsapp). Variables en Vercel: WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, opcional WHATSAPP_GRAPH_VERSION.
const VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';
const configurado = () => !!(String(process.env.WHATSAPP_TOKEN || '').trim() && String(process.env.WHATSAPP_PHONE_ID || '').trim());

// En México WhatsApp entrega 521 + 10 dígitos y para contestar hay que mandar 52 + 10 dígitos; 10 dígitos solos = México
function destino(n) {
  const d = String(n).replace(/\D/g, '');
  if (/^521\d{10}$/.test(d)) return '52' + d.slice(3);
  if (/^\d{10}$/.test(d)) return '52' + d;
  return d;
}

// Meta contesta { messages: [{ id: 'wamid...' }] }: "aceptado" no es "entregado"; la entrega (o el rechazo) llega después al webhook
function idDe(crudo) { try { const j = JSON.parse(crudo); return (j.messages && j.messages[0] && j.messages[0].id) || null; } catch (e) { return null; } }

async function enviarTexto(para, texto) {
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${String(process.env.WHATSAPP_PHONE_ID || '').trim()}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + String(process.env.WHATSAPP_TOKEN || '').trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: destino(para), type: 'text', text: { preview_url: false, body: String(texto).slice(0, 4000) } })
  });
  const crudo = (await r.text()).slice(0, 600);
  if (r.ok) return { ok: true, id: idDe(crudo) };
  let codigo = null, mensaje = crudo;
  try { const e = JSON.parse(crudo).error || {}; codigo = e.code || null; mensaje = (e.error_data && e.error_data.details) || e.message || crudo; } catch (x) { /* texto plano */ }
  return { ok: false, status: r.status, codigo, error: mensaje, crudo };
}

// Sube el archivo a WhatsApp y lo manda como documento (llega como PDF adjunto en el chat)
async function enviarDocumento(para, datos, archivo, leyenda) {
  const phone = String(process.env.WHATSAPP_PHONE_ID || '').trim();
  const auth = { Authorization: 'Bearer ' + String(process.env.WHATSAPP_TOKEN || '').trim() };
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'application/pdf');
  form.append('file', new Blob([datos], { type: 'application/pdf' }), archivo);
  const subida = await fetch(`https://graph.facebook.com/${VERSION}/${phone}/media`, { method: 'POST', headers: auth, body: form });
  const s = await subida.json().catch(() => ({}));
  if (!subida.ok || !s.id) return { ok: false, status: subida.status, error: (s.error && s.error.message) || 'No se pudo subir el PDF a WhatsApp' };
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${phone}/messages`, {
    method: 'POST',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
    body: JSON.stringify({ messaging_product: 'whatsapp', to: destino(para), type: 'document', document: { id: s.id, filename: archivo, caption: leyenda ? String(leyenda).slice(0, 1000) : undefined } })
  });
  const e = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, id: (e.messages && e.messages[0] && e.messages[0].id) || null };
  return { ok: false, status: r.status, codigo: e.error && e.error.code, error: (e.error && e.error.message) || 'WhatsApp no aceptó el PDF' };
}

// Mensaje con plantilla aprobada por Meta: es la única forma de escribirle a alguien que no le ha escrito a Pepito en 24 h.
// Los parámetros no pueden traer saltos de línea.
async function enviarPlantilla(para, nombre, idioma, parametros) {
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${String(process.env.WHATSAPP_PHONE_ID || '').trim()}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + String(process.env.WHATSAPP_TOKEN || '').trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', to: destino(para), type: 'template',
      template: { name: nombre, language: { code: idioma || 'es_MX' }, components: parametros && parametros.length ? [{ type: 'body', parameters: parametros.map(p => ({ type: 'text', text: String(p).replace(/\s*\n+\s*/g, ' · ').slice(0, 900) })) }] : [] }
    })
  });
  const e = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, id: (e.messages && e.messages[0] && e.messages[0].id) || null };
  return { ok: false, status: r.status, codigo: e.error && e.error.code, error: (e.error && e.error.message) || 'Meta no aceptó la plantilla' };
}

// Descarga un archivo que la persona mandó (foto, audio): Meta da primero su URL con el id y luego el archivo, ambos con el token
async function bajarMedia(mediaId) {
  const h = { Authorization: 'Bearer ' + String(process.env.WHATSAPP_TOKEN || '').trim() };
  const info = await fetch(`https://graph.facebook.com/${VERSION}/${encodeURIComponent(mediaId)}`, { headers: h });
  if (!info.ok) throw new Error('Meta no dio el archivo (' + info.status + ')');
  const { url, mime_type: mime } = await info.json();
  const archivo = await fetch(url, { headers: h });
  if (!archivo.ok) throw new Error('No se pudo descargar el archivo (' + archivo.status + ')');
  return { datos: Buffer.from(await archivo.arrayBuffer()), mime: String(mime || '').split(';')[0] };
}

const fueraDeVentana = r => r && (r.codigo === 131047 || /24 hours|re-engagement/i.test(r.error || ''));

module.exports = { enviarTexto, enviarDocumento, enviarPlantilla, bajarMedia, fueraDeVentana, destino, configurado, VERSION };
