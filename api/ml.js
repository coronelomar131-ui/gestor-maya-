const axios = require('axios');
const admin = require('firebase-admin');

const ML_APP_ID = process.env.ML_APP_ID || '6541042886481524';
const ML_SECRET_KEY = process.env.ML_SECRET_KEY || '0YCTfgEqnDE81vQgpKDdq2i0A9tUrXwr';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://gestor-maya.vercel.app';
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || `${FRONTEND_URL}/callback`;

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id || 'mayav3-f9d9b'
  });
}

const db = admin.firestore();

// Get or refresh ML token
async function getValidMLToken(mlUserId) {
  const tokenDoc = await db.collection('ml_tokens').doc(String(mlUserId)).get();
  if (!tokenDoc.exists) throw new Error('No ML token found');

  const tokenData = tokenDoc.data();
  const now = new Date();
  let expiresAt = tokenData.expires_at;
  if (expiresAt && typeof expiresAt.toDate === 'function') expiresAt = expiresAt.toDate();
  else if (!(expiresAt instanceof Date)) expiresAt = new Date(0);

  if (expiresAt > now) return tokenData.access_token;

  console.log('Access token expired, refreshing...');
  return await refreshMLToken(mlUserId, tokenData.refresh_token);
}

async function refreshMLToken(mlUserId, refreshToken) {
  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('client_id', ML_APP_ID);
    params.append('client_secret', ML_SECRET_KEY);
    params.append('refresh_token', refreshToken);

    const response = await axios.post('https://api.mercadolibre.com/oauth/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const newAccessToken = response.data.access_token;
    const expiresIn = response.data.expires_in || 21600;

    await db.collection('ml_tokens').doc(String(mlUserId)).update({
      access_token: newAccessToken,
      refresh_token: response.data.refresh_token || refreshToken,
      expires_at: new Date(Date.now() + expiresIn * 1000),
      updated_at: new Date()
    });

    console.log('Token refreshed for:', mlUserId);
    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing ML token:', error.response?.data || error.message);
    throw new Error('Failed to refresh ML token');
  }
}

async function saveMLTokens(mlUserId, accessToken, refreshToken, expiresIn = 21600) {
  if (!mlUserId) throw new Error('mlUserId is empty');
  await db.collection('ml_tokens').doc(String(mlUserId)).set({
    access_token: accessToken,
    refresh_token: refreshToken || null,
    expires_at: new Date(Date.now() + expiresIn * 1000),
    created_at: new Date(),
    updated_at: new Date()
  }, { merge: true });
  console.log('ML tokens saved for:', mlUserId);
}

function tokenErrorResponse(res, error) {
  if (error.response?.status === 400 || error.response?.status === 401 || error.message === 'No ML token found') {
    return res.status(401).json({
      error: 'token_expired',
      message: 'Token de ML expiró o es inválido, reconecta ML'
    });
  }
  return res.status(500).json({ error: error.response?.data?.message || error.message });
}

module.exports = async function handler(req, res) {
  try {
    const params = { ...req.query, ...(req.body || {}) };
    const { action, mlUserId, itemId, quantity, price, code } = params;

    // ── OAuth login URL ──
    if (action === 'login-url') {
      const loginUrl = `https://auth.mercadolibre.com.mx/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}`;
      return res.status(200).json({ loginUrl });
    }

    // ── Exchange authorization code for tokens ──
    if (action === 'exchange') {
      if (!code) return res.status(400).json({ error: 'No authorization code' });
      try {
        const p = new URLSearchParams();
        p.append('grant_type', 'authorization_code');
        p.append('client_id', ML_APP_ID);
        p.append('client_secret', ML_SECRET_KEY);
        p.append('code', code);
        p.append('redirect_uri', ML_REDIRECT_URI);

        const tokenResponse = await axios.post('https://api.mercadolibre.com/oauth/token', p, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const mlUserResponse = await axios.get('https://api.mercadolibre.com/users/me', {
          headers: { 'Authorization': `Bearer ${tokenResponse.data.access_token}` }
        });

        const newMlUserId = String(mlUserResponse.data.id);
        await saveMLTokens(
          newMlUserId,
          tokenResponse.data.access_token,
          tokenResponse.data.refresh_token,
          tokenResponse.data.expires_in || 21600
        );

        return res.status(200).json({ success: true, mlUserId: newMlUserId });
      } catch (error) {
        console.error('ML exchange error:', error.response?.data || error.message);
        return res.status(400).json({
          error: 'Token exchange failed: ' + (error.response?.data?.message || error.message),
          details: error.response?.data
        });
      }
    }

    // ── Full inventory with pagination (activos + pausados = todos los vendibles) ──
    if (action === 'inventory' && mlUserId) {
      try {
        const accessToken = await getValidMLToken(mlUserId);
        const LIMIT = 100;
        let todos = [];

        for (const st of ['active', 'paused']) {
          let offset = 0;
          let total = 999;
          let fetched = 0;

          while (fetched < total && offset < 1000) {
            const response = await axios.get(
              `https://api.mercadolibre.com/users/${mlUserId}/items/search`,
              {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: { limit: LIMIT, offset: offset, status: st }
              }
            );

            const itemIds = response.data.results || [];
            total = response.data.paging?.total || 0;
            if (itemIds.length === 0) break;
            fetched += itemIds.length;

            for (let i = 0; i < itemIds.length; i += 20) {
              const chunk = itemIds.slice(i, i + 20).join(',');
              try {
                const detResponse = await axios.get(
                  `https://api.mercadolibre.com/items?ids=${chunk}`,
                  { headers: { 'Authorization': `Bearer ${accessToken}` } }
                );
                const items = detResponse.data
                  .filter(r => r.code === 200)
                  .map(r => {
                    const item = r.body;
                    return {
                      id: item.id,
                      title: item.title,
                      price: item.price,
                      available_quantity: item.available_quantity,
                      status: item.status,
                      thumbnail: item.thumbnail,
                      permalink: item.permalink,
                      category_id: item.category_id,
                      category: item.category_id || 'Sin categoría',
                      condition: item.condition,
                      sold_quantity: item.sold_quantity
                    };
                  });
                todos = todos.concat(items);
              } catch (e) {
                console.error('Error fetching chunk:', e.message);
              }
            }
            offset += LIMIT;
          }
        }

        console.log(`Inventory total: ${todos.length}`);
        return res.status(200).json({ success: true, mlUserId, count: todos.length, items: todos });
      } catch (error) {
        console.error('Inventory error:', error.response?.data || error.message);
        return tokenErrorResponse(res, error);
      }
    }

    // ── Recent orders ──
    if (action === 'ordenes' && mlUserId) {
      try {
        const accessToken = await getValidMLToken(mlUserId);
        const response = await axios.get(
          `https://api.mercadolibre.com/orders/search?seller=${mlUserId}&sort=date_desc&limit=20`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        return res.status(200).json({
          success: true,
          mlUserId,
          count: response.data.results?.length || 0,
          results: response.data.results || []
        });
      } catch (error) {
        console.error('Ordenes error:', error.response?.data || error.message);
        return tokenErrorResponse(res, error);
      }
    }

    // ── Sync product quantity/price to ML ──
    if (action === 'sync' && mlUserId && itemId) {
      try {
        const accessToken = await getValidMLToken(mlUserId);
        const response = await axios.put(
          `https://api.mercadolibre.com/items/${itemId}`,
          { available_quantity: parseInt(quantity), price: parseFloat(price) },
          { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );
        return res.status(200).json({ success: true, data: response.data });
      } catch (error) {
        console.error('Sync error:', error.response?.data || error.message);
        return res.status(500).json({ error: 'Sync failed: ' + (error.response?.data?.message || error.message) });
      }
    }

    // ── Legacy: productos (kept for compatibility) ──
    if (action === 'productos' && mlUserId) {
      try {
        const accessToken = await getValidMLToken(mlUserId);
        const response = await axios.get(
          'https://api.mercadolibre.com/users/me/items/search',
          { headers: { 'Authorization': `Bearer ${accessToken}` }, params: { limit: 100 } }
        );
        const itemIds = response.data.results || [];
        const productos = [];
        for (let i = 0; i < itemIds.length; i += 20) {
          const chunk = itemIds.slice(i, i + 20).join(',');
          try {
            const det = await axios.get(`https://api.mercadolibre.com/items?ids=${chunk}`, {
              headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            det.data.filter(r => r.code === 200).forEach(r => productos.push(r.body));
          } catch (e) { /* skip failed chunk */ }
        }
        return res.status(200).json({ success: true, total: productos.length, productos });
      } catch (error) {
        return tokenErrorResponse(res, error);
      }
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Handler error:', error.message);
    res.status(500).json({ error: error.message });
  }
};
