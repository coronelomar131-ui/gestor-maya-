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
    const expiresAt = tokenData.expires_at?.toDate?.() || new Date(0);

    // If token is still valid, return it
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

    await db.collection('ml_tokens').doc(String(mlUserId)).set({
      access_token: accessToken,
      refresh_token: refreshToken || null,
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

// ═══════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════

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
    if (!code) {
      return res.status(400).json({ error: 'No authorization code' });
    }

    console.log('Code received:', code, 'Length:', code?.length);

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('client_id', ML_APP_ID);
    params.append('client_secret', ML_SECRET_KEY);
    params.append('code', code);
    params.append('redirect_uri', ML_REDIRECT_URI);

    const tokenResponse = await axios.post('https://api.mercadolibre.com/oauth/token', params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log('ML token response:', JSON.stringify(tokenResponse.data));

    const mlUserResponse = await axios.get('https://api.mercadolibre.com/users/me', {
      headers: { 'Authorization': `Bearer ${tokenResponse.data.access_token}` }
    });

    const mlUserId = String(mlUserResponse.data.id);
    const accessToken = tokenResponse.data.access_token;
    const refreshToken = tokenResponse.data.refresh_token;
    const expiresIn = tokenResponse.data.expires_in || 21600;

    // Save tokens to Firestore
    await saveMLTokens(mlUserId, accessToken, refreshToken, expiresIn);

    // Redirect to frontend with mlUserId
    const frontendUrl = process.env.FRONTEND_URL || 'https://gestor-maya.vercel.app';
    res.redirect(`${frontendUrl}?ml_user_id=${mlUserId}`);
  } catch (error) {
    console.error('ML Error:', error.response?.data || error.message);
    res.status(400).json({
      error: 'Token exchange failed: ' + (error.response?.data?.message || error.message),
      details: error.response?.data
    });
  }
});

// Get user's products from ML
app.get('/ml/productos/:mlUserId', async (req, res) => {
  try {
    const { mlUserId } = req.params;

    if (!mlUserId) {
      return res.status(400).json({ error: 'mlUserId is required' });
    }

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
