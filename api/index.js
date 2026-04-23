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

// Get ML Access Token (placeholder - needs OAuth flow)
async function getMLAccessToken() {
  // TODO: Implement proper OAuth flow
  // For now, this is a placeholder
  return null;
}

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
