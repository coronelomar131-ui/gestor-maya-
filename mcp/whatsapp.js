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

async function enviarTexto(para, texto) {
  const r = await fetch(`https://graph.facebook.com/${VERSION}/${String(process.env.WHATSAPP_PHONE_ID || '').trim()}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + String(process.env.WHATSAPP_TOKEN || '').trim(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: destino(para), type: 'text', text: { preview_url: false, body: String(texto).slice(0, 4000) } })
  });
  if (r.ok) return { ok: true };
  const crudo = (await r.text()).slice(0, 600);
  let codigo = null, mensaje = crudo;
  try { const e = JSON.parse(crudo).error || {}; codigo = e.code || null; mensaje = (e.error_data && e.error_data.details) || e.message || crudo; } catch (x) { /* texto plano */ }
  return { ok: false, status: r.status, codigo, error: mensaje, crudo };
}

module.exports = { enviarTexto, destino, configurado, VERSION };
