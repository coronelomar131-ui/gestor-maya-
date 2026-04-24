const axios = require('axios');
const admin = require('firebase-admin');

const ML_APP_ID = process.env.ML_APP_ID || '6541042886481524';
const ML_SECRET_KEY = process.env.ML_SECRET_KEY || '0YCTfgEqnDE81vQgpKDdq2i0A9tUrXwr';

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'mayav3-f9d9b'
  });
}

const db = admin.firestore();

// Get or refresh ML token
async function getValidMLToken(mlUserId) {
  try {
    const tokenDoc = await db.collection('ml_tokens').doc(mlUserId).get();

    if (!tokenDoc.exists()) {
      throw new Error('No ML token found');
    }

    const tokenData = tokenDoc.data();
    const now = new Date();
    const expiresAt = tokenData.expires_at?.toDate?.() || new Date(0);

    // If token is still valid (not expired), return it
    if (expiresAt > now) {
      console.log('Using valid access token for:', mlUserId);
      return tokenData.access_token;
    }

    // Token expired, try to refresh
    console.log('Access token expired, refreshing...');
    return await refreshMLToken(mlUserId, tokenData.refresh_token);
  } catch (error) {
    console.error('Error getting ML token:', error.message);
    throw error;
  }
}

// Refresh expired token
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
    const expiresIn = response.data.expires_in || 21600; // 6 hours default
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Save new token to Firestore
    await db.collection('ml_tokens').doc(mlUserId).update({
      access_token: newAccessToken,
      refresh_token: response.data.refresh_token || refreshToken,
      expires_at: expiresAt,
      updated_at: new Date()
    });

    console.log('Token refreshed successfully for:', mlUserId);
    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing ML token:', error.response?.data || error.message);
    throw new Error('Failed to refresh ML token');
  }
}

// Save tokens to Firestore after exchange
async function saveMLTokens(mlUserId, accessToken, refreshToken, expiresIn = 21600) {
  try {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await db.collection('ml_tokens').doc(mlUserId).set({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      created_at: new Date(),
      updated_at: new Date()
    }, { merge: true });

    console.log('ML tokens saved to Firestore for:', mlUserId);
  } catch (error) {
    console.error('Error saving ML tokens to Firestore:', error.message);
    throw error;
  }
}

// Get Mercado Libre products
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, mlUserId, itemId, quantity, price } = req.query;

    // Get user's products from ML
    if (action === 'productos' && mlUserId) {
      try {
        const accessToken = await getValidMLToken(mlUserId);

        const response = await axios.get(
          'https://api.mercadolibre.com/users/me/items/search',
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            },
            params: {
              status: 'active'
            }
          }
        );

        console.log('Usuario ML:', mlUserId);
        console.log('Items encontrados:', response.data.results?.length);

        const itemIds = response.data.results || [];
        const productos = await Promise.all(
          itemIds.slice(0, 50).map(async (id) => {
            try {
              const item = await axios.get(`https://api.mercadolibre.com/items/${id}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              return item.data;
            } catch (e) {
              return null;
            }
          })
        );

        return res.status(200).json({
          success: true,
          productos: productos.filter(p => p)
        });
      } catch (error) {
        if (error.response?.status === 400 || error.response?.status === 401) {
          return res.status(401).json({
            error: 'token_expired',
            message: 'Token de ML expiró o es inválido, reconecta ML'
          });
        }
        console.error('Error en productos ML:', error.response?.data || error.message);
        return res.status(500).json({
          error: error.response?.data?.message || error.message
        });
      }
    }

    // Sync product to ML
    if (action === 'sync' && mlUserId && itemId) {
      try {
        const accessToken = await getValidMLToken(mlUserId);

        const response = await axios.put(
          `https://api.mercadolibre.com/items/${itemId}`,
          {
            available_quantity: parseInt(quantity),
            price: parseFloat(price)
          },
          {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          }
        );

        return res.status(200).json({
          success: true,
          data: response.data
        });
      } catch (error) {
        console.error('Error syncing product:', error.message);
        return res.status(500).json({
          error: 'Sync failed: ' + error.message
        });
      }
    }

    // Exchange authorization code for access token
    if (action === 'exchange') {
      const { code } = req.query;
      if (!code) {
        return res.status(400).json({ error: 'No authorization code' });
      }

      try {
        const redirect_uri = 'https://gestor-maya.vercel.app/callback';
        console.log('Code received:', code, 'Length:', code?.length);
        console.log('Redirect URI usado:', redirect_uri);
        console.log('App ID:', ML_APP_ID);

        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('client_id', ML_APP_ID);
        params.append('client_secret', ML_SECRET_KEY);
        params.append('code', code);
        params.append('redirect_uri', redirect_uri);

        console.log('Params enviados:', params.toString());

        const tokenResponse = await axios.post('https://api.mercadolibre.com/oauth/token', params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log('ML token response:', JSON.stringify(tokenResponse.data));

        const mlUserResponse = await axios.get('https://api.mercadolibre.com/users/me', {
          headers: { 'Authorization': `Bearer ${tokenResponse.data.access_token}` }
        });

        const mlUserId = mlUserResponse.data.id;
        const accessToken = tokenResponse.data.access_token;
        const refreshToken = tokenResponse.data.refresh_token;
        const expiresIn = tokenResponse.data.expires_in || 21600;

        // Save tokens to Firestore
        await saveMLTokens(mlUserId, accessToken, refreshToken, expiresIn);

        return res.status(200).json({
          success: true,
          mlUserId: mlUserId,
          message: 'Tokens saved to database'
        });
      } catch (error) {
        console.log('ML Response:', JSON.stringify(error.response?.data));
        console.error('ML Error:', error.response?.data || error.message);
        return res.status(400).json({
          error: 'Token exchange failed: ' + (error.response?.data?.message || error.message),
          details: error.response?.data
        });
      }
    }

    // Get OAuth login URL
    if (action === 'login-url') {
      let loginUrl = `https://auth.mercadolibre.com.mx/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent('https://gestor-maya.vercel.app/callback')}`;
      return res.status(200).json({ loginUrl });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
