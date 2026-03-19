const express = require('express');
const router = express.Router();
const axios = require('axios');

const CONTAAZUL_AUTH_URL = 'https://api-v2.contaazul.com/oauth2/token';

// Store tokens in memory (in production, use a DB or encrypted file)
const tokens = {};

/**
 * GET /api/auth/login/:store
 * Redirects user to Conta Azul OAuth2 login page
 */
router.get('/login/:store', (req, res) => {
    const { store } = req.params;
    const config = getStoreConfig(store);
    if (!config) return res.status(400).json({ error: 'Loja desconhecida' });

             const params = new URLSearchParams({
                   response_type: 'code',
                   client_id: config.clientId,
                   redirect_uri: config.redirectUri,
                   state: store,
             });

             res.redirect(`https://api-v2.contaazul.com/oauth2/auth?${params}`);
});

/**
 * GET /api/auth/callback
 * OAuth2 callback - exchanges code for access token
 */
router.get('/callback', async (req, res) => {
    const { code, state: store } = req.query;
    if (!code || !store) return res.status(400).json({ error: 'Parametros invalidos' });

             const config = getStoreConfig(store);
    if (!config) return res.status(400).json({ error: 'Loja desconhecida' });

             try {
                   const response = await axios.post(CONTAAZUL_AUTH_URL,
                                                           new URLSearchParams({
                                                                     grant_type: 'authorization_code',
                                                                     code,
                                                                     redirect_uri: config.redirectUri,
                                                                     client_id: config.clientId,
                                                                     client_secret: config.clientSecret,
                                                           }),
                                                     { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                                                         );

      tokens[store] = {
              access_token: response.data.access_token,
              refresh_token: response.data.refresh_token,
              expires_at: Date.now() + (response.data.expires_in * 1000),
      };

      res.redirect(`/?auth=success&store=${store}`);
             } catch (err) {
                   console.error('Erro ao obter token:', err.response?.data || err.message);
                   res.status(500).json({ error: 'Falha na autenticacao' });
             }
});

/**
 * GET /api/auth/status
 * Returns authentication status for all stores
 */
router.get('/status', (req, res) => {
    const status = {};
    const stores = ['SIDE', 'ZONE', 'PLACE', 'STATION'];
    stores.forEach(s => {
          const t = tokens[s];
          status[s] = t ? { authenticated: true, expires_at: t.expires_at } : { authenticated: false };
    });
    res.json(status);
});

/**
 * Refreshes token if expired
 */
async function getValidToken(store) {
    const t = tokens[store];
    if (!t) throw new Error(`Loja ${store} nao autenticada`);

  if (Date.now() >= t.expires_at - 60000) {
        const config = getStoreConfig(store);
        const response = await axios.post(CONTAAZUL_AUTH_URL,
                                                new URLSearchParams({
                                                          grant_type: 'refresh_token',
                                                          refresh_token: t.refresh_token,
                                                          client_id: config.clientId,
                                                          client_secret: config.clientSecret,
                                                }),
                                          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
                                              );
        tokens[store] = {
                access_token: response.data.access_token,
                refresh_token: response.data.refresh_token,
                expires_at: Date.now() + (response.data.expires_in * 1000),
        };
  }
    return tokens[store].access_token;
}

function getStoreConfig(store) {
    const configs = {
          SIDE:    { clientId: process.env.CA_SIDE_CLIENT_ID,    clientSecret: process.env.CA_SIDE_CLIENT_SECRET,    redirectUri: process.env.REDIRECT_URI },
          ZONE:    { clientId: process.env.CA_ZONE_CLIENT_ID,    clientSecret: process.env.CA_ZONE_CLIENT_SECRET,    redirectUri: process.env.REDIRECT_URI },
          PLACE:   { clientId: process.env.CA_PLACE_CLIENT_ID,   clientSecret: process.env.CA_PLACE_CLIENT_SECRET,   redirectUri: process.env.REDIRECT_URI },
          STATION: { clientId: process.env.CA_STATION_CLIENT_ID, clientSecret: process.env.CA_STATION_CLIENT_SECRET, redirectUri: process.env.REDIRECT_URI },
    };
    return configs[store.toUpperCase()] || null;
}

module.exports = router;
module.exports.getValidToken = getValidToken;
