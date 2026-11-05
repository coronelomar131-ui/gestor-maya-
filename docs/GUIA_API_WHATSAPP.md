# Conectar Pepito Junior a la API de Claude y a WhatsApp

El código ya está en el gestor. Mientras no pongas las llaves, el módulo Pepito sigue como buzón; en cuanto
pongas la de Claude, se vuelve chat en vivo. Las llaves **solo se pegan en Vercel**: nunca en el código ni en un chat.

## 1. API de Claude (para que Pepito conteste al momento)

1. Entra a **console.anthropic.com** y crea la cuenta de la empresa.
2. **Billing**: carga crédito (con unos $10 USD alcanza para empezar) y pon un **límite de gasto mensual**.
3. **API Keys → Create Key** (nombre: `gestor-maya`). Cópiala; solo se ve una vez.
4. En **Vercel → proyecto gestor-maya → Settings → Environment Variables** agrega:
   - `ANTHROPIC_API_KEY` = la llave (entorno Production).
   - Opcional: `PEPITO_MODELO` (por omisión `claude-sonnet-5-5`; `claude-haiku-5-5` es más barato y bueno para consultas),
     `PEPITO_LIMITE_DIA` (mensajes por persona al día, por omisión 60).
5. **Deployments → Redeploy** para que tome la variable.
6. Abre el gestor → Pepito. Debe decir "Conectado a la API de Claude".

Cómo se comporta:
- Usa las mismas herramientas del MCP con el **rol de quien pregunta**.
- Lo que crea, cambia o borra **no se guarda hasta que la persona aprieta "Sí, guárdalo"** (o responde SÍ en WhatsApp).
- Cada mensaje y su consumo de tokens queda en la colección `pepito_uso` (por persona y día).

## 2. WhatsApp Cloud API (Meta)

1. Entra a **developers.facebook.com** con la cuenta de Facebook del negocio → **Crear app** → tipo *Empresa* → agrega **WhatsApp**.
2. Meta te da un **número de prueba gratis**: en *WhatsApp → Configuración de la API* agrega hasta 5 números del
   equipo como destinatarios de prueba (les llega un código). Con eso ya puedes hacer la demo sin pagar.
3. Copia **Phone number ID** y genera un **token**. Para que no caduque, crea un *Usuario del sistema* en
   Business Settings con permiso `whatsapp_business_messaging` y genera su token permanente.
4. En **Configuración de la app → Básica** copia la **Clave secreta de la app**.
5. En Vercel agrega: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET` y `WHATSAPP_VERIFY_TOKEN`
   (este último lo inventas tú, por ejemplo una frase larga). Redeploy.
6. En Meta, *WhatsApp → Configuración → Webhook*:
   - URL: `https://gestor-maya.vercel.app/api/whatsapp`
   - Token de verificación: el mismo `WHATSAPP_VERIFY_TOKEN`
   - Suscríbete al campo **messages**.
7. En el gestor → Pepito → **WhatsApp del equipo** (solo admin): escribe el número de 10 dígitos de cada persona.
   Pepito solo contesta a esos números.
8. Para producción: agrega un número propio (un chip que no tenga WhatsApp normal), verifica el negocio en Meta y
   agrega un método de pago en Meta (las respuestas a mensajes que el equipo manda primero cuestan poco o nada;
   los avisos que Pepito mande por su cuenta sí cuestan por mensaje).

## 3. Notas de voz (opcional)

Claude no recibe audio, así que las notas de voz se pasan a texto con Whisper:

1. Entra a **console.groq.com**, crea una cuenta (tiene plan gratis) y en **API Keys** crea una llave.
2. En Vercel agrega `GROQ_API_KEY` con esa llave (Production) y haz Redeploy.
   (Si prefieres OpenAI, usa `OPENAI_API_KEY` en su lugar.)
3. Manda una nota de voz a Pepito: contesta con "🎙️ Entendí: …" y lo atiende como si lo hubieras escrito.
   También sirve para confirmar: un audio diciendo "sí, guárdala".

## 4. PDF por WhatsApp

Cuando Pepito crea una nota, venta o cotización por WhatsApp, contesta con un enlace
`https://gestor-maya.vercel.app/?pdf=…`. Al abrirlo con tu sesión del gestor se descarga el PDF con el diseño de
siempre. También puedes pedirle el PDF de una nota que ya existe ("mándame la NE-230").

Diagnóstico: `https://gestor-maya.vercel.app/api/whatsapp` muestra qué variables ve el servidor y qué pasó con los
últimos mensajes.

## 5. PDF como archivo adjunto

Cuando Pepito guarda una nota de entrega, nota de venta o cotización por WhatsApp, manda el PDF **como archivo**
en el chat, con el mismo diseño que se descarga en el gestor (el servidor usa las mismas funciones de la app).
También se le puede pedir el de una nota que ya existe: "mándame la NE-230". Si algo falla, manda el enlace.

## 6. Avisos del equipo: resumen de la mañana, alarmas y avisos al momento

Cada aviso llega a la **campanita** del gestor (arriba a la derecha) y, si la persona tiene su WhatsApp registrado
en Usuarios, también por WhatsApp. Cada quien elige en la campanita → Preferencias qué quiere recibir.

| Aviso | A quién | Cuándo |
|---|---|---|
| Resumen de la mañana | Todos, según su rol: admin (ventas, facturar, cobrar), facturación (facturar y cobrar), vendedor (sus ventas de ayer, sus piezas en camino, sus clientes con saldo vencido), almacén (por preparar y stock bajo), entregas (listas para salir y en tránsito). Incluye las alarmas del día. | 8:00 de la CDMX |
| Nota o venta nueva | Almacén | Al guardarla (en el gestor o con Pepito) |
| Pieza en preparación | Entregas | Al mover la etapa en Seguimiento |
| Pieza en camino / entregada | El vendedor de esa nota (y facturación cuando se entrega) | Al mover la etapa |
| Factura subida | Los vendedores de las notas facturadas | Al subir el XML |
| Pago registrado | Admins y los vendedores de esas notas | Al guardar el pago en Cobranza |
| Alarma | La persona que la pidió (o a quien se la pusieron) | A la hora que se le dijo a Pepito |

El vendedor de una nota se reconoce por su nombre: "Daniel" en la nota = el usuario "Daniel Hernández".
Nadie recibe aviso de lo que él mismo hizo.

**Alarmas:** se le piden a Pepito, por el chat del gestor o por WhatsApp: *"recuérdame mañana a las 10 cobrarle a
LATAM Parts"*, *"en 20 minutos recuérdame llamar a Israel"*, *"ponle una alarma a Israel el viernes a las 9: pasar
por el faro"*, *"¿qué alarmas tengo?"*, *"cancela la de LATAM"*.

### Configuración (una sola vez)

1. En Vercel agrega `CRON_SECRET` con una contraseña larga que inventes (Production) y haz Redeploy.
2. **Tick cada 5 minutos en cron-job.org (gratis)**, para que las alarmas lleguen a su hora (Vercel gratis solo
   deja una tarea al día):
   1. Crea una cuenta en https://cron-job.org y entra a *Cronjobs → Create cronjob*.
   2. URL: `https://gestor-maya.vercel.app/api/avisos?tarea=tick`
   3. Schedule: *Every 5 minutes*.
   4. En *Advanced → Headers* agrega `Authorization` con el valor `Bearer <tu CRON_SECRET>`.
   5. Guarda y usa *Test run*: debe contestar `{"ok":true,...}`.
   El cron de Vercel de las 8:00 se queda como respaldo: el resumen sale una sola vez al día aunque llamen los dos.
3. Para probar el resumen sin esperar: `https://gestor-maya.vercel.app/api/avisos?clave=<tu CRON_SECRET>&solo=5512345678`.
4. Opcional: `AVISOS_HORA` (por defecto 8) cambia la hora del resumen cuando lo manda el tick.

### Regla de 24 horas de WhatsApp

Un mensaje que Pepito manda por su cuenta solo llega si esa persona le escribió a Pepito en las últimas 24 horas.
Meta contesta "aceptado" al momento y el rechazo lo avisa después al webhook. El gestor lo detecta:

- Si hay **plantilla aprobada**, lo reintenta con la plantilla.
- Si no, lo guarda y se lo entrega **en cuanto esa persona le escriba a Pepito**. Si el mensaje lo pidió alguien
  por WhatsApp ("mándale a Israel..."), a esa persona le llega el aviso de que no se entregó todavía y, después,
  la confirmación cuando ya le llegó.
- En la campanita del gestor siempre llega.

Plantillas (Meta Business Suite → WhatsApp Manager → Plantillas → Crear plantilla, categoría **Utilidad**, Español (MEX)):

1. `reporte_diario`: `Buenos días, {{1}}. Tu reporte de Maya: {{2}}. Escríbeme para ver el detalle.`
   → en Vercel `WHATSAPP_PLANTILLA_REPORTE=reporte_diario` (se usa para admin y facturación).
2. `aviso_equipo`: `Aviso de Maya Autopartes: {{1}}`
   → en Vercel `WHATSAPP_PLANTILLA_AVISO=aviso_equipo` (alarmas, avisos al momento y el resumen de los demás roles).
3. `WHATSAPP_PLANTILLA_IDIOMA=es_MX`.

Meta cobra cada mensaje de plantilla (unos centavos de dólar en México; revisa la tarifa vigente en
https://developers.facebook.com/docs/whatsapp/pricing). Los mensajes dentro de las 24 horas no se cobran.
Con el número de prueba solo llegan a los 5 números que tengas dados de alta en Meta.

En `https://gestor-maya.vercel.app/api/whatsapp` (diagnóstico) aparecen los envíos que Meta no entregó y por qué.
