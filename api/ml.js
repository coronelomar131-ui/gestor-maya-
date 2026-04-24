const axios = require('axios');

const ML_APP_ID = process.env.ML_APP_ID || '6541042886481524';
const ML_SECRET_KEY = process.env.ML_SECRET_KEY || '0YCTfgEqnDE81vQgpKDdq2i0A9tUrXwr';

// Get Mercado Libre products
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { action, userId, accessToken, itemId, quantity, price } = req.query;

    // Get user's products from ML
    if (action === 'productos' && accessToken) {
      const response = await axios.get(
        `https://api.mercadolibre.com/users/${userId}/items/search`,
        { params: { access_token: accessToken } }
      );

      const itemIds = response.data.results || [];
      const productos = await Promise.all(
        itemIds.slice(0, 50).map(async (id) => {
          try {
            const item = await axios.get(`https://api.mercadolibre.com/items/${id}`);
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
    }

    // Sync product to ML
    if (action === 'sync' && accessToken && itemId) {
      const response = await axios.put(
        `https://api.mercadolibre.com/items/${itemId}`,
        {
          available_quantity: parseInt(quantity),
          price: parseFloat(price)
        },
        { params: { access_token: accessToken } }
      );

      return res.status(200).json({
        success: true,
        data: response.data
      });
    }

    // Exchange authorization code for access token
    if (action === 'exchange') {
      const { code } = req.query;
      if (!code) {
        return res.status(400).json({ error: 'No authorization code' });
      }

      try {
        const tokenResponse = await axios.post('https://api.mercadolibre.com/oauth/token', {
          grant_type: 'authorization_code',
          client_id: ML_APP_ID,
          client_secret: ML_SECRET_KEY,
          code: code,
          redirect_uri: 'https://gestor-maya.vercel.app/api/ml?action=exchange'
        });

        const mlUserResponse = await axios.get('https://api.mercadolibre.com/users/me', {
          params: { access_token: tokenResponse.data.access_token }
        });

        return res.status(200).json({
          success: true,
          accessToken: tokenResponse.data.access_token,
          userId: mlUserResponse.data.id,
          refreshToken: tokenResponse.data.refresh_token || null
        });
      } catch (error) {
        return res.status(400).json({ error: 'Token exchange failed: ' + error.message });
      }
    }

    // Get OAuth login URL
    if (action === 'login-url') {
      const loginUrl = `https://auth.mercadolibre.com.mx/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent('https://gestor-maya.vercel.app/api/ml?action=exchange')}&response_type=code`;
      return res.status(200).json({ loginUrl });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
