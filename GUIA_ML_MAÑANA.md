# 🛒 Guía: Conectar Mercado Libre - Mañana

## ✅ Flujo Normal (debería funcionar)

1. **Abre la app:** https://gestor-maya.vercel.app
2. **Login** con tu usuario de Firebase
3. **Ve a 📦 Inventario**
4. **Botón 🔄 "Sincronizar ML"**
5. **Click en "🔗 Conectar Mercado Libre"**
6. **Te lleva a ML** - Inicia sesión con tu cuenta de vendedor
7. **Autoriza la app** (botón Autorizar)
8. **Vuelve automático a tu app**
9. **Carga todos tus productos** ✅

---

## ❌ Si FALLA el flujo

### **Error 1: "No estás conectado con Mercado Libre"**
→ Dale click en "🔗 Conectar Mercado Libre" de nuevo

### **Error 2: Te envía a ML pero no vuelve**
**Solución manual:**
1. Cuando estés en ML y hayas autorizado, copia la URL que sale en la barra (tendrá un `code=...`)
2. Abre **F12 → Console** en tu app
3. Corre esto:
```javascript
localStorage.setItem('ml_access_token', 'TU_TOKEN_AQUI');
localStorage.setItem('ml_user_id', 'TU_USER_ID_AQUI');
location.reload();
```
(Necesitarás tu access token - ver abajo)

### **Error 3: Dice "Token exchange failed"**
→ Probablemente el `code` expiró. Intenta de nuevo desde el inicio.

---

## 🔑 Si necesitas token MANUAL

**Opción A: Desde ML Developer Console**
1. Ve a: https://developers.mercadolibre.com.mx
2. Portal de Desarrolladores → Tu app "Maya Autopartes"
3. Busca **"Access Token"** o credenciales
4. Copia el token

**Opción B: Usar el code de la URL**
1. Cuando autorices en ML, te redirige con: `?code=ABC123XYZ`
2. Copia ese `code`
3. Envíame screenshot y yo te genero el token

---

## 📝 Credenciales (guárdalo seguro)

**App ID:** `6541042286481524`
**Secret:** `0YCTfgEqnDE8tvQqpKDdq2i0A9tUrXwr`
**Redirect URI:** `https://gestor-maya.vercel.app`

---

## 🆘 Si nada funciona

1. **Abre F12 → Console** (en tu navegador)
2. Copia el error que sale en rojo
3. Mándamelo
4. Lo debuggeamos en vivo

---

## ✅ Señal de que funcionó

Cuando todo esté bien vas a ver:
- ✅ "Mercado Libre conectado exitosamente"
- ✅ En Inventario van a aparecer tus productos de ML
- ✅ En Dashboard van a salir alertas de sincronización

---

**TL;DR:** Si funciona de primera, no hagas nada. Si falla, llama y debuggeamos juntos.

🔥 **¡Ánimo para mañana!**
