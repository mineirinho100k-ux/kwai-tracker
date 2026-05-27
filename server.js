/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         KWAI TRACKER - Servidor Webhook Gratuito         ║
 * ║   Substitui api.xtracky.com/api/integrations/vega        ║
 * ╚══════════════════════════════════════════════════════════╝
 */

const express = require('express');
const crypto  = require('crypto');
const https   = require('https');

const app  = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CONFIG = {
  PORT:              process.env.PORT              || 3000,
  KWAI_PIXEL_ID:     process.env.KWAI_PIXEL_ID     || '',
  KWAI_ACCESS_TOKEN: process.env.KWAI_ACCESS_TOKEN || '',
  KWAI_TEST_EVENT:   process.env.KWAI_TEST_EVENT   || '',
  VEGA_SECRET:       process.env.VEGA_SECRET       || '',
};

// Mapeamento eventos VEGA → nome oficial Kwai Event API
const EVENT_MAP = {
  'VENDA_AGUARDANDO_PAGAMENTO': 'EVENT_ADD_TO_CART',
  'AGUARDANDO_PAGAMENTO':       'EVENT_ADD_TO_CART',
  'WAITING_PAYMENT':            'EVENT_ADD_TO_CART',
  'pending':                    'EVENT_ADD_TO_CART',
  'waiting_payment':            'EVENT_ADD_TO_CART',
  'VENDA_APROVADA':             'EVENT_COMPLETE_PAYMENT',
  'APROVADA':                   'EVENT_COMPLETE_PAYMENT',
  'PAID':                       'EVENT_COMPLETE_PAYMENT',
  'paid':                       'EVENT_COMPLETE_PAYMENT',
  'approved':                   'EVENT_COMPLETE_PAYMENT',
  'APPROVED':                   'EVENT_COMPLETE_PAYMENT',
  'completed':                  'EVENT_COMPLETE_PAYMENT',
};

function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function sendToKwai(kwaiEventName, payload) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.KWAI_PIXEL_ID || !CONFIG.KWAI_ACCESS_TOKEN) {
      console.error('[KwaiTracker] KWAI_PIXEL_ID ou KWAI_ACCESS_TOKEN não configurados!');
      return reject(new Error('Credenciais Kwai ausentes'));
    }

    const bodyObj = {
      pixel_id:     CONFIG.KWAI_PIXEL_ID,
      access_token: CONFIG.KWAI_ACCESS_TOKEN,
      data: [
        {
          event:      kwaiEventName,
          event_time: Math.floor(Date.now() / 1000),
          click_id:   payload.click_id || '',
          user_data: {
            email: sha256(payload.email),
            phone: sha256(payload.phone),
          },
          custom_data: {
            currency: 'BRL',
            value:    String(payload.value || 0),
            order_id: payload.order_id || '',
          },
          page: {
            url: payload.landing_url || '',
          },
        }
      ]
    };

    if (CONFIG.KWAI_TEST_EVENT) {
      bodyObj.test_event_code = CONFIG.KWAI_TEST_EVENT;
    }

    const body = JSON.stringify(bodyObj);
    console.log('[KwaiTracker] Enviando para Kwai:', JSON.stringify(bodyObj, null, 2));

    const options = {
      hostname: 'e.kwai.com',
      path:     '/track/api/v1/event',
      method:   'POST',
      headers:  {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[KwaiTracker] Resposta Kwai API:', data);
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function parseVegaPayload(body) {
  const order = body.order || body.data || body;
  return {
    event_type:  body.event || body.event_type || body.status || body.type || '',
    order_id:    order.transaction_id || order.id || order.order_id || body.id || '',
    value:       parseFloat(order.total_price || order.total || order.amount || order.value || 0),
    email:       order.customer?.email   || order.email   || body.email   || '',
    phone:       order.customer?.phone   || order.phone   || body.phone   || '',
    click_id:    order.checkout?.click_id || order.checkout?.kwai_click_id || body.click_id || '',
    landing_url: order.checkout?.src || order.landing_url || body.landing_url || '',
    raw:         body,
  };
}

app.post('/webhook/vega', async (req, res) => {
  try {
    console.log('[KwaiTracker] Webhook recebido:', JSON.stringify(req.body, null, 2));

    const data      = parseVegaPayload(req.body);
    const eventType = data.event_type.toUpperCase().replace(/ /g, '_');
    const kwaiEvent = EVENT_MAP[eventType] || EVENT_MAP[data.event_type];

    if (!kwaiEvent) {
      console.log(`[KwaiTracker] Evento ignorado: "${data.event_type}"`);
      return res.json({ ok: true, message: `Evento "${data.event_type}" ignorado` });
    }

    console.log(`[KwaiTracker] Mapeando: ${data.event_type} → ${kwaiEvent}`);
    console.log(`[KwaiTracker] Pedido: #${data.order_id} | Valor: R$ ${data.value}`);

    await sendToKwai(kwaiEvent, data);

    return res.json({ ok: true, event: kwaiEvent, order_id: data.order_id, value: data.value });

  } catch (err) {
    console.error('[KwaiTracker] Erro:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Kwai Tracker Webhook',
    pixel_id: CONFIG.KWAI_PIXEL_ID ? CONFIG.KWAI_PIXEL_ID.substring(0,6) + '***' : 'NÃO CONFIGURADO',
    endpoints: {
      webhook: 'POST /webhook/vega',
      health:  'GET  /health',
    }
  });
});

app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.listen(CONFIG.PORT, () => {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Kwai Tracker Webhook - RODANDO             ║');
  console.log(`║   Porta: ${CONFIG.PORT}                              ║`);
  console.log(`║   Pixel: ${CONFIG.KWAI_PIXEL_ID ? CONFIG.KWAI_PIXEL_ID.substring(0,10) + '...' : 'NÃO CONFIGURADO    '}       ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('URL webhook VEGA: http://localhost:' + CONFIG.PORT + '/webhook/vega');
});

module.exports = app;
