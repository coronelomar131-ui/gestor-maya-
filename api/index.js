const express = require('express');
const cors = require('cors');
const axios = require('axios');
const admin = require('firebase-admin');

const app = express();

app.use(cors());
app.use(express.json());

// Firebase initialization
const firebaseConfig = {
  projectId: process.env.FIREBASE_PROJECT_ID || 'mayav3-f9d9b',
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\n/g, '\n'),
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL || 'firebase-adminsdk-abc@mayav3-f9d9b.iam.gserviceaccount.com'
};

if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID) {
  admin.initializeApp({
    credential: admin.credential.cert(firebaseConfig),
    databaseURL: `https://${firebaseConfig.projectId}.firebaseio.com`
  });
}

const db = admin.firestore?.() || null;

// ML API Config
const ML_APP_ID = process.env.ML_APP_ID || '6541042886481524';
const ML_SECRET_KEY = process.env.ML_SECRET_KEY || '0YCTfgEqnDE81vQgpKDdq2i0A9tUrXwr';

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Webhook from Mercado Libre - receive notifications
app.post('/webhooks/ml', async (req, res) => {
  try {
    const { resource, user_id, topic } = req.body;
    console.log('ML Webhook:', { resource, user_id, topic });

    // Handle different ML events
    if (topic === 'orders' && resource) {
      // Order was placed on ML
      const orderId = resource.split('/')[2];
      
      // Fetch order details from ML
      const mlOrder = await getMLOrder(orderId, user_id);
      
      // Sync to Firebase
      if (db && mlOrder) {
        await db.collection('ordenes').doc(`ml_${orderId}`).set({
          ...mlOrder,
          sincronizadoDesdeML: true,
          fecha: new Date(),
          fuente: 'mercado_libre'
        }, { merge: true });
      }
      
      console.log('Order synced:', orderId);
    }

    if (topic === 'items' && resource) {
      // Product was updated on ML
      const itemId = resource.split('/')[2];
      const mlProduct = await getMLProduct(itemId);
      
      if (db && mlProduct) {
        await db.collection('inventario').doc(`ml_${itemId}`).set({
          ...mlProduct,
          sincronizadoDesdeML: true,
          fecha: new Date()
        }, { merge: true });
      }
    }

    res.json({ success: true, processed: true });
  } catch (error) {
    console.error('Webhook error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get ML Order
async function getMLOrder(orderId, userId) {
  try {
    const response = await axios.get(`https://api.mercadolibre.com/orders/${orderId}`, {
      params: { access_token: await getMLAccessToken() }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching ML order:', error.message);
    return null;
  }
}

// Get ML Product
async function getMLProduct(itemId) {
  try {
    const response = await axios.get(`https://api.mercadolibre.com/items/${itemId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching ML product:', error.message);
    return null;
  }
}

// Store ML Access Token (in memory for now, use Redis in production)
let mlAccessToken = null;
let mlTokenExpiry = 0;

// Get ML Access Token via OAuth
async function getMLAccessToken(refreshToken = null) {
  try {
    // Check if we have a valid cached token
    if (mlAccessToken && Date.now() < mlTokenExpiry) {
      return mlAccessToken;
    }

    // If no token yet, use client credentials flow
    if (!refreshToken) {
      // For now, return null - full OAuth requires user interaction
      // In production, store refresh_token from user's initial OAuth login
      return null;
    }

    const response = await axios.post('https://api.mercadolibre.com/oauth/token', {
      grant_type: 'refresh_token',
      client_id: ML_APP_ID,
      client_secret: ML_SECRET_KEY,
      refresh_token: refreshToken
    });

    mlAccessToken = response.data.access_token;
    mlTokenExpiry = Date.now() + (response.data.expires_in * 1000);

    return mlAccessToken;
  } catch (error) {
    console.error('Error getting ML access token:', error.message);
    return null;
  }
}

// OAuth callback from Mercado Libre
app.get('/api/ml/callback', async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }

    // Exchange code for access token
    const response = await axios.post('https://api.mercadolibre.com/oauth/token', {
      grant_type: 'authorization_code',
      client_id: ML_APP_ID,
      client_secret: ML_SECRET_KEY,
      code: code,
      redirect_uri: `https://gestor-maya.vercel.app/api/ml/callback`
    });

    mlAccessToken = response.data.access_token;
    mlTokenExpiry = Date.now() + (response.data.expires_in * 1000);

    // Store refresh token in a safe place (cookie or localStorage in client)
    res.json({
      success: true,
      accessToken: mlAccessToken,
      refreshToken: response.data.refresh_token,
      expiresIn: response.data.expires_in
    });
  } catch (error) {
    console.error('OAuth callback error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync product to Mercado Libre (when you update inventory in your app)
app.post('/api/sync-to-ml', async (req, res) => {
  try {
    const { productId, price, quantity, title, description } = req.body;
    
    // Update on ML
    const response = await axios.put(
      `https://api.mercadolibre.com/items/${productId}`,
      {
        price,
        available_quantity: quantity,
        title,
        description
      },
      { headers: { Authorization: `Bearer ${await getMLAccessToken()}` } }
    );

    res.json({ success: true, mlResponse: response.data });
  } catch (error) {
    console.error('Sync to ML error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all synced orders
app.get('/api/ordenes-ml', async (req, res) => {
  try {
    if (!db) return res.json({ ordenes: [] });

    const snapshot = await db.collection('ordenes')
      .where('fuente', '==', 'mercado_libre')
      .orderBy('fecha', 'desc')
      .limit(50)
      .get();

    const ordenes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json({ ordenes });
  } catch (error) {
    console.error('Error fetching ML orders:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all products from Mercado Libre
app.get('/api/ml/productos', async (req, res) => {
  try {
    const token = mlAccessToken || process.env.ML_ACCESS_TOKEN;

    if (!token) {
      return res.status(401).json({
        error: 'No access token. Please login with Mercado Libre first.',
        loginUrl: `https://auth.mercadolibre.com.mx/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=https://gestor-maya.vercel.app/api/ml/callback`
      });
    }

    // Get user info first
    const userResponse = await axios.get('https://api.mercadolibre.com/users/me', {
      params: { access_token: token }
    });

    const userId = userResponse.data.id;

    // Get user's items (products)
    const itemsResponse = await axios.get(`https://api.mercadolibre.com/users/${userId}/items/search`, {
      params: { access_token: token }
    });

    const itemIds = itemsResponse.data.results || [];

    // Fetch details for each item
    const productos = await Promise.all(
      itemIds.slice(0, 50).map(async (itemId) => {
        try {
          const itemResponse = await axios.get(`https://api.mercadolibre.com/items/${itemId}`, {
            params: { access_token: token }
          });
          return itemResponse.data;
        } catch (error) {
          console.error(`Error fetching item ${itemId}:`, error.message);
          return null;
        }
      })
    );

    // Filter out nulls and sync to Firebase
    const validProductos = productos.filter(p => p !== null);

    if (db) {
      for (const producto of validProductos) {
        await db.collection('inventario').doc(`ml_${producto.id}`).set({
          id: producto.id,
          titulo: producto.title,
          precio: producto.price,
          stock: producto.available_quantity,
          descripcion: producto.description,
          enlaceMl: producto.permalink,
          imagen: producto.thumbnail,
          sincronizadoDesdeML: true,
          fechaSincronizacion: new Date(),
          fuente: 'mercado_libre'
        }, { merge: true });
      }
    }

    res.json({
      success: true,
      totalProductos: validProductos.length,
      productos: validProductos
    });
  } catch (error) {
    console.error('Error fetching ML products:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync inventory from app to Mercado Libre
app.post('/api/ml/sync-inventario', async (req, res) => {
  try {
    const { itemId, cantidad, precio } = req.body;
    const token = mlAccessToken || process.env.ML_ACCESS_TOKEN;

    if (!token) {
      return res.status(401).json({ error: 'No access token' });
    }

    const response = await axios.put(
      `https://api.mercadolibre.com/items/${itemId}`,
      {
        available_quantity: cantidad,
        price: precio
      },
      { params: { access_token: token } }
    );

    // Update Firebase
    if (db) {
      await db.collection('inventario').doc(`ml_${itemId}`).update({
        stock: cantidad,
        precio: precio,
        ultimaSincronizacion: new Date()
      });
    }

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Error syncing to ML:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get login URL for Mercado Libre OAuth
app.get('/api/ml/login-url', (req, res) => {
  const loginUrl = `https://auth.mercadolibre.com.mx/authorization?response_type=code&client_id=${ML_APP_ID}&redirect_uri=https://gestor-maya.vercel.app/api/ml/callback`;
  res.json({ loginUrl });
});

// Serve static files (HTML, CSS, JS)
app.use(express.static('public'));

// Fallback to index.html for SPA routing
app.get('*', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🔥 Maya Autopartes Backend running on port ${PORT}`);
  console.log(`ML_APP_ID: ${ML_APP_ID}`);
  console.log(`Firebase: ${process.env.FIREBASE_PROJECT_ID || 'LOCAL MODE'}`);
});

module.exports = app;
