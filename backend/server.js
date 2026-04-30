const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://gestor-maya.vercel.app',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ML Config
const ML_APP_ID = process.env.ML_APP_ID || '6541042886481524';
const ML_SECRET_KEY = process.env.ML_SECRET_KEY || '0YCTfgEqnDE81vQgpKDdq2i0A9tUrXwr';
const ML_REDIRECT_URI = process.env.ML_REDIRECT_URI || 'http://localhost:3000/ml/callback';

// Initialize Firebase Admin
let db;
try {
  if (!admin.apps.length) {
    console.log('Initializing Firebase Admin...');
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    if (!serviceAccount.project_id) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT missing or invalid - no project_id found');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID || 'mayav3-f9d9b'
    });
    console.log('Firebase Admin initialized successfully');
  }
  db = admin.firestore();
} catch (error) {
  console.error('Firebase initialization error:', error.message);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

async function getValidMLToken(mlUserId) {
  try {
    const tokenDoc = await db.collection('ml_tokens').doc(mlUserId).get();

    if (!tokenDoc.exists) {
      throw new Error('No ML token found');
    }

    const tokenData = tokenDoc.data();
    const now = new Date();

    // Convert Firestore Timestamp to Date
    let expiresAt = tokenData.expires_at;
    if (expiresAt && typeof expiresAt.toDate === 'function') {
      expiresAt = expiresAt.toDate();
    } else if (expiresAt instanceof Date) {
      // Already a Date
    } else {
      expiresAt = new Date(0);
    }

    // Debug logging
    const minutesUntilExpiry = (expiresAt - now) / (1000 * 60);
    console.log('=== Token Validation Debug ===');
    console.log('mlUserId:', mlUserId);
    console.log('expires_at (converted):', expiresAt);
    console.log('now:', now);
    console.log('Minutes until expiry:', minutesUntilExpiry.toFixed(2));
    console.log('Token valid?', expiresAt > now);

    // If token is still valid, return it
    if (expiresAt > now) {
      console.log('✅ Using valid access token for:', mlUserId);
      return tokenData.access_token;
    }

    // Token expired, try to refresh
    console.log('⏰ Access token expired, refreshing...');
    return await refreshMLToken(mlUserId, tokenData.refresh_token);
  } catch (error) {
    console.error('❌ Error getting ML token:', error.message);
    throw error;
  }
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
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    // Save new token to Firestore
    await db.collection('ml_tokens').doc(String(mlUserId)).update({
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

async function saveMLTokens(mlUserId, accessToken, refreshToken, expiresIn = 21600) {
  try {
    if (!mlUserId) throw new Error('mlUserId is empty');

    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    console.log('Saving tokens to Firestore:');
    console.log('  - mlUserId:', mlUserId);
    console.log('  - expiresAt:', expiresAt);
    console.log('  - expiresIn:', expiresIn, 'seconds');
    console.log('  - refreshToken provided?', !!refreshToken);

    const tokenData = {
      access_token: accessToken,
      refresh_token: refreshToken || null,
      expires_at: expiresAt,
      created_at: new Date(),
      updated_at: new Date()
    };

    console.log('Token data to save:', {
      ...tokenData,
      access_token: tokenData.access_token.substring(0, 20) + '...',
      refresh_token: tokenData.refresh_token ? tokenData.refresh_token.substring(0, 20) + '...' : null
    });

    await db.collection('ml_tokens').doc(String(mlUserId)).set(tokenData, { merge: true });

    console.log('✅ ML tokens saved successfully to Firestore for:', mlUserId);
  } catch (error) {
    console.error('❌ Error saving ML tokens to Firestore:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════

// Root endpoint
app.get('/', (req, res) => {
  res.json({ status: 'Maya Backend corriendo', version: '1.0' });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Get OAuth login URL
app.get('/ml/login-url', (req, res) => {
  try {
    const loginUrl = `https://auth.mercadolibre.com.mx/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=${encodeURIComponent(ML_REDIRECT_URI)}`;
    res.json({ loginUrl });
  } catch (error) {
    console.error('Error getting login URL:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// OAuth callback - exchange code for token
app.get('/ml/callback', async (req, res) => {
  try {
    const { code } = req.query;
    console.log('=== ML Callback Started ===');
    console.log('Code received:', code, 'Length:', code?.length);

    if (!code) {
      console.log('ERROR: No authorization code provided');
      return res.status(400).json({ error: 'No authorization code' });
    }

    console.log('Step 1: Exchanging code for token...');
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', ML_APP_ID);
    params.append('client_secret', ML_SECRET_KEY);
    params.append('code', code);
    params.append('redirect_uri', ML_REDIRECT_URI);

    const tokenResponse = await axios.post('https://api.mercadolibre.com/oauth/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('Step 2: Token exchange successful');
    console.log('ML token response keys:', Object.keys(tokenResponse.data));
    console.log('access_token present?', !!tokenResponse.data.access_token);
    console.log('refresh_token present?', !!tokenResponse.data.refresh_token);
    console.log('refresh_token value:', tokenResponse.data.refresh_token || 'NOT PROVIDED BY ML');

    console.log('Step 3: Fetching user info from ML...');
    const mlUserResponse = await axios.get('https://api.mercadolibre.com/users/me', {
      headers: { 'Authorization': `Bearer ${tokenResponse.data.access_token}` }
    });

    const mlUserId = String(mlUserResponse.data.id);
    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;
    const expiresIn = tokenResponse.data.expires_in || 21600;

    console.log('Step 4: Got mlUserId:', mlUserId);
    console.log('Step 5: About to save tokens to Firestore');
    console.log('  - accessToken:', accessToken.substring(0, 20) + '...');
    console.log('  - refreshToken:', refreshToken ? refreshToken.substring(0, 20) + '...' : 'null/undefined');
    console.log('  - expiresIn:', expiresIn, 'seconds');

    // Save tokens to Firestore
    await saveMLTokens(mlUserId, accessToken, refreshToken, expiresIn);

    console.log('Step 6: Tokens saved successfully');

    // Send HTML page with JavaScript redirect
    const frontendUrl = process.env.FRONTEND_URL || 'https://gestor-maya.vercel.app';
    console.log('Step 7: Sending HTML redirect page to:', `${frontendUrl}?ml_connected=true&mlUserId=${mlUserId}`);

    res.send(`
<html>
<head>
  <title>Conectando Mercado Libre...</title>
</head>
<body>
  <p>Conectando con Mercado Libre...</p>
  <script>
    console.log('JavaScript redirect executing, mlUserId: ${mlUserId}');
    localStorage.setItem('ml_user_id', '${mlUserId}');
    window.location.href = '${frontendUrl}?ml_connected=true&mlUserId=${mlUserId}';
  </script>
</body>
</html>
    `);
  } catch (error) {
    console.error('=== ML Callback ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error response data:', error.response?.data);
    console.error('Error response status:', error.response?.status);
    console.error('Full error:', error);
    res.status(400).json({
      error: 'Token exchange failed: ' + (error.response?.data?.message || error.message),
      details: error.response?.data
    });
  }
});

// Get user's inventory from ML
app.get('/ml/inventory/:mlUserId', async (req, res) => {
  try {
    const { mlUserId } = req.params;

    if (!mlUserId) {
      return res.status(400).json({ error: 'mlUserId is required' });
    }

    console.log('Fetching inventory for mlUserId:', mlUserId);
    const accessToken = await getValidMLToken(mlUserId);

    console.log('About to call ML API with Authorization:', `Bearer ${accessToken.substring(0, 30)}...`);

    const response = await axios.get(
      `https://api.mercadolibre.com/users/${mlUserId}/items/search`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        params: {
          status: 'active'
        }
      }
    );

    console.log('=== ML API Response ===');
    console.log('Status Code:', response.status);
    console.log('Response Body:', JSON.stringify(response.data, null, 2));
    console.log('Authorization Header Sent:', `Bearer ${accessToken.substring(0, 30)}...`);
    console.log('Items encontrados:', response.data.results?.length);

    const itemIds = response.data.results || [];
    console.log('Total items from ML API:', itemIds.length);
    const inventory = await Promise.all(
      itemIds.map(async (id) => {
        try {
          const item = await axios.get(`https://api.mercadolibre.com/items/${id}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          return item.data;
        } catch (e) {
          console.error('Error fetching item:', id, e.message);
          return null;
        }
      })
    );

    res.json({
      success: true,
      mlUserId: mlUserId,
      count: inventory.filter(p => p).length,
      items: inventory.filter(p => p)
    });
  } catch (error) {
    console.error('=== ERROR in /ml/inventory ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Response status:', error.response?.status);
    console.error('Response data:', error.response?.data);
    console.error('Error config URL:', error.config?.url);
    console.error('Error config headers:', error.config?.headers);

    if (error.response?.status === 400 || error.response?.status === 401) {
      console.error('❌ Token validation failed - returning 401');
      return res.status(401).json({
        error: 'token_expired',
        message: 'Token de ML expiró o es inválido, reconecta ML',
        details: {
          status: error.response?.status,
          mlError: error.response?.data
        }
      });
    }
    console.error('Error en inventory ML:', error.response?.data || error.message);
    res.status(500).json({
      error: error.response?.data?.message || error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════
// ML ORDENES ENDPOINT
// ═══════════════════════════════════════════════════════════
app.get('/ml/ordenes/:mlUserId', async (req, res) => {
  try {
    const { mlUserId } = req.params;

    if (!mlUserId) {
      return res.status(400).json({ error: 'mlUserId is required' });
    }

    console.log('Fetching órdenes for mlUserId:', mlUserId);
    const accessToken = await getValidMLToken(mlUserId);

    const response = await axios.get(
      `https://api.mercadolibre.com/orders/search?seller=${mlUserId}&sort=date_desc&limit=20`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    console.log('=== ML API Response - Órdenes ===');
    console.log('Status Code:', response.status);
    console.log('Órdenes encontradas:', response.data.results?.length);

    res.json({
      success: true,
      mlUserId: mlUserId,
      count: response.data.results?.length || 0,
      results: response.data.results || []
    });
  } catch (error) {
    console.error('=== ERROR in /ml/ordenes ===');
    console.error('Error type:', error.constructor.name);
    console.error('Error message:', error.message);
    console.error('Response status:', error.response?.status);
    console.error('Response data:', error.response?.data);

    if (error.response?.status === 401 || error.response?.data?.error?.message?.includes('invalid_token')) {
      return res.status(401).json({
        error: 'token_expired',
        message: 'Token de ML expiró o es inválido'
      });
    }

    res.status(500).json({
      error: error.response?.data?.message || error.message
    });
  }
});

// Legacy endpoint - keeps /ml/productos for backwards compatibility
app.get('/ml/productos/:mlUserId', async (req, res) => {
  try {
    const { mlUserId } = req.params;

    if (!mlUserId) {
      return res.status(400).json({ error: 'mlUserId is required' });
    }

    const accessToken = await getValidMLToken(mlUserId);

    const response = await axios.get(
      `https://api.mercadolibre.com/users/${mlUserId}/items/search`,
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

    res.json({
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
    res.status(500).json({
      error: error.response?.data?.message || error.message
    });
  }
});

// Sync product to ML
app.post('/ml/sync', async (req, res) => {
  try {
    const { mlUserId, itemId, quantity, price } = req.body;

    if (!mlUserId || !itemId) {
      return res.status(400).json({ error: 'mlUserId and itemId are required' });
    }

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

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Error syncing product:', error.message);
    res.status(500).json({
      error: 'Sync failed: ' + error.message
    });
  }
});

// Webhook endpoint (for future use)
app.post('/ml/webhook', async (req, res) => {
  try {
    console.log('Webhook received:', JSON.stringify(req.body));
    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
