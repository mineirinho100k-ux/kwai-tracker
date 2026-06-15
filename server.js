const express = require('express');
const crypto  = require('crypto');
const https   = require('https');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const CONFIG = {
  PORT:              process.env.PORT              || 3000,
  KWAI_PIXEL_ID:     process.env.KWAI_PIXEL_ID     || '',
  KWAI_ACCESS_TOKEN: process.env.KWAI_ACCESS_TOKEN || '',
  KWAI_TEST_EVENT:   process.env.KWAI_TEST_EVENT   || '',
};

const EVENT_MAP = {
  'VENDA_AGUARDANDO_PAGAMENTO': 'EVENT_ADD_TO_CART',
  'AGUARDANDO_PAGAMENTO':       'EVENT_ADD_TO_CART',
  'pending':                    'EVENT_ADD_TO_CART',
  'waiting_payment':            'EVENT_ADD_TO_CART',
  'VENDA_APROVADA':             'EVENT_COMPLETE_PAYMENT',
  'APROVADA':                   'EVENT_COMPLETE_PAYMENT',
  'paid':                       'EVENT_COMPLETE_PAYMENT',
  'approved':                   'EVENT_COMPLETE_PAYMENT',
  'PAID':                       'EVENT_COMPLETE_PAYMENT',
  'APPROVED':                   'EVENT_COMPLETE_PAYMENT',
};

// Extrai o click_id do utm_source (formato: KW-XXXXXXX-yyyyyyy)
function extractClickId(utmSource) {
  if (!utmSource) return '';
  // utm_source vem como "KW-1781436101560-kn6gt30dz3hw7"
  // o click_id é esse valor completo
  if (utmSource.startsWith('KW-')) return utmSource;
  return '';
}

function sendToKwai(kwaiEventName, payload) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.KWAI_PIXEL_ID || !CONFIG.KWAI_ACCESS_TOKEN) {
      return reject(new Error('Credenciais Kwai ausentes'));
    }

    const bodyObj = {
      access_token:    CONFIG.KWAI_ACCESS_TOKEN,
      callback:        payload.click_id || '',   // campo obrigatório = click_id do Kwai
      event_name:      kwaiEventName,
      is_attributed:   payload.click_id ? 1 : 0,
      mmpcode:         'PL',
      pixelId:         CONFIG.KWAI_PIXEL_ID,
      pixelSdkVersion: '9.9.9',
      properties: JSON.stringify({
        content_id:   payload.order_id || '',
        content_name: 'Pedido',
        currency:     'BRL',
        value:        String(payload.value || 0),
      }),
      testFlag:  !!CONFIG.KWAI_TEST_EVENT,
      trackFlag: true,
    };

    if (CONFIG.KWAI_TEST_EVENT) bodyObj.test_event_code = CONFIG.KWAI_TEST_EVENT;

    const body = JSON.stringify(bodyObj);
    console.log('[KwaiTracker] Enviando:', JSON.stringify(bodyObj, null, 2));

    const options = {
      hostname: 'www.adsnebula.com',
      path:     '/log/common/api',
      method:   'POST',
      headers:  {
        'accept':         'application/json;charset=utf-8',
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('[KwaiTracker] Resposta Kwai:', data);
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
  const checkout = order.checkout || body.checkout || {};

  const utmSource = checkout.utm_source || order.utm_source || body.utm_source || '';
  const clickId = extractClickId(utmSource) || 'Teste_KwaiTracker';

  console.log('[KwaiTracker] utm_source:', utmSource, '→ click_id:', clickId || '(não encontrado)');

  return {
    event_type: body.event || body.event_type || body.status || body.type || '',
    order_id:   order.transaction_id || order.id || order.order_id || body.id || '',
    value:      parseFloat(order.total_price || order.total || order.amount || 0),
    click_id:   clickId,
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

    console.log(`[KwaiTracker] ${data.event_type} → ${kwaiEvent} | #${data.order_id} | R$ ${data.value} | click_id: ${data.click_id || 'VAZIO'}`);
    const result = await sendToKwai(kwaiEvent, data);
    return res.json({ ok: true, event: kwaiEvent, order_id: data.order_id, kwai_response: result });

  } catch (err) {
    console.error('[KwaiTracker] Erro:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/', (req, res) => res.json({
  status: 'online', service: 'Kwai Tracker Webhook',
  pixel_id: CONFIG.KWAI_PIXEL_ID ? CONFIG.KWAI_PIXEL_ID.substring(0,6)+'***' : 'NÃO CONFIGURADO',
}));

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(CONFIG.PORT, () => {
  console.log('Kwai Tracker rodando na porta', CONFIG.PORT);
});

module.exports = app;
