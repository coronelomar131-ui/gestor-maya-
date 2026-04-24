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
      try {
        const response = await axios.get(
          'https://api.mercadolibre.com/users/me/items/search',
          {
            params: {
              access_token: accessToken,
              status: 'active'
            }
          }
        );

        console.log('Usuario ML:', userId);
        console.log('Items encontrados:', response.data.results?.length);

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
      } catch (error) {
        if (error.response?.status === 400 || error.response?.status === 401) {
          return res.status(401).json({
            error: 'token_expired',
            message: 'Token de ML expirado, reconecta ML'
          });
        }
        console.error('Error en productos ML:', error.response?.data || error.message);
        return res.status(500).json({
          error: error.response?.data?.message || error.message
        });
      }
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
        params.append('code_verifier', req.query.code_verifier);

        console.log('Params enviados:', params.toString());

        const tokenResponse = await axios.post('https://api.mercadolibre.com/oauth/token', params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
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
      const { code_challenge, code_challenge_method } = req.query;
      let loginUrl = `https://auth.mercadolibre.com.mx/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent('https://gestor-maya.vercel.app/callback')}`;

      if (code_challenge && code_challenge_method) {
        loginUrl += `&code_challenge=${code_challenge}&code_challenge_method=${code_challenge_method}`;
      }

      return res.status(200).json({ loginUrl });
    }

    res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
