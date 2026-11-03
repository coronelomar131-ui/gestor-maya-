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

Notas:
- Las notas de voz todavía no se entienden: Pepito pide que se lo escriban.
- Los PDF de notas se descargan desde el chat del gestor; por WhatsApp todavía no se mandan.
