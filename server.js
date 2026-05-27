/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         KWAI TRACKER - Servidor Webhook Gratuito         ║
 * ║   Substitui api.xtracky.com/api/integrations/vega        ║
 * ╚══════════════════════════════════════════════════════════╝
 * 
 * Como usar:
 *   1. npm install
 *   2. Copie .env.example para .env e preencha suas credenciais
 *   3. node server.js  (ou: npm start)
 *   4. Faça deploy no Railway, Render, Fly.io (gratuito)
 *   5. No painel da VEGA, coloque a URL: https://SEU-SERVIDOR/webhook/vega
 *      Ative os eventos: VENDA APROVADA e VENDA AGUARDANDO PAGAMENTO
 */

const express = require('express');
const crypto  = require('crypto');
const https   = require('https');

const app  = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Configuração via variáveis de ambiente ──────────────────────────────────
const CONFIG = {
  PORT:              process.env.PORT              || 3000,
  KWAI_PIXEL_ID:     process.env.KWAI_PIXEL_ID     || '',   // seu Pixel ID do Kwai
  KWAI_ACCESS_TOKEN: process.env.KWAI_ACCESS_TOKEN || '',   // Access Token da API de conversões
  KWAI_TEST_EVENT:   process.env.KWAI_TEST_EVENT   || '',   // Test Event Code (opcional)
  VEGA_SECRET:       process.env.VEGA_SECRET       || '',   // Chave secreta do webhook VEGA (opcional)
};

// ─── Mapeamento de eventos VEGA → Kwai ──────────────────────────────────────
const EVENT_MAP = {
  // VENDA AGUARDANDO PAGAMENTO (pix gerado) → AddToCart
  'VENDA_AGUARDANDO_PAGAMENTO': 'AddToCart',
  'AGUARDANDO_PAGAMENTO':       'AddToCart',
  'WAITING_PAYMENT':            'AddToCart',
  'pending':                    'AddToCart',
  'waiting_payment':            'AddToCart',

  // VENDA APROVADA (pix pago) → Purchase
  'VENDA_APROVADA':  'Purchase',
  'APROVADA':        'Purchase',
  'PAID':            'Purchase',
  'paid':            'Purchase',
  'approved':        'Purchase',
  'APPROVED':        'Purchase',
  'completed':       'Purchase',
};

// ─── Hash SHA-256 para dados do usuário ─────────────────────────────────────
function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

// ─── Chama a Kwai Conversions API ───────────────────────────────────────────
function sendToKwai(eventName, payload) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.KWAI_PIXEL_ID || !CONFIG.KWAI_ACCESS_TOKEN) {
      console.error('[KwaiTracker] KWAI_PIXEL_ID ou KWAI_ACCESS_TOKEN não configurados!');
      return reject(new Error('Credenciais Kwai ausentes'));
    }

    const body = JSON.stringify({
      pixel_id:    CONFIG.KWAI_PIXEL_ID,
      test_event_code: CONFIG.KWAI_TEST_EVENT || undefined,
      data: [
        {
          event:        eventName,
          event_time:   Math.floor(Date.now() / 1000),
          event_id:     payload.order_id || crypto.randomUUID(),
          user_data: {
            email:        sha256(payload.email),
            phone_number: sha256(payload.phone),
            external_id:  sha256(payload.customer_id || payload.email),
            client_ip_address: payload.ip,
            client_user_agent: payload.user_agent,
          },
          custom_data: {
            currency: 'BRL',
            value:    payload.value || 0,
            order_id: payload.order_id,
            content_ids: payload.product_ids || [],
          },
          event_source_url: payload.landing_url,
          action_source: 'website',
        }
      ]
    });

    const options = {
      hostname: 'api.kwai.com',
      path:     `/openapi/v1/pixel/event?access_token=${CONFIG.KWAI_ACCESS_TOKEN}`,
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
        console.log(`[KwaiTracker] Resposta Kwai API (${eventName}):`, data);
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Parser do payload da VEGA ───────────────────────────────────────────────
function parseVegaPayload(body) {
  // A VEGA pode enviar em diferentes formatos — normalizamos aqui
  const order = body.order || body.data || body;
  
  return {
    event_type:  body.event || body.event_type || body.status || body.type || '',
    order_id:    order.id   || order.order_id  || order.uuid || body.id || '',
    value:       parseFloat(order.total || order.amount || order.value || 0),
    email:       order.customer?.email   || order.email   || body.email   || '',
    phone:       order.customer?.phone   || order.phone   || body.phone   || '',
    customer_id: order.customer?.id      || order.customer_id || '',
    ip:          order.customer?.ip      || order.ip      || body.ip      || '',
    user_agent:  order.customer?.user_agent || order.user_agent || '',
    landing_url: order.landing_url || body.landing_url || body.source_url || '',
    product_ids: (order.items || order.products || []).map(i => String(i.id || i.product_id || '')),
    raw:         body,
  };
}

// ─── ROTA PRINCIPAL: Webhook da VEGA ────────────────────────────────────────
app.post('/webhook/vega', async (req, res) => {
  try {
    console.log('[KwaiTracker] Webhook recebido:', JSON.stringify(req.body, null, 2));

    const data      = parseVegaPayload(req.body);
    const eventType = data.event_type.toUpperCase().replace(/ /g, '_');
    const kwaiEvent = EVENT_MAP[eventType] || EVENT_MAP[data.event_type];

    if (!kwaiEvent) {
      console.log(`[KwaiTracker] Evento ignorado: "${data.event_type}" (não mapeado)`);
      return res.json({ ok: true, message: `Evento "${data.event_type}" ignorado` });
    }

    console.log(`[KwaiTracker] Mapeando: ${data.event_type} → ${kwaiEvent}`);
    console.log(`[KwaiTracker] Pedido: #${data.order_id} | Valor: R$ ${data.value}`);

    await sendToKwai(kwaiEvent, data);

    return res.json({
      ok: true,
      event: kwaiEvent,
      order_id: data.order_id,
      value: data.value,
    });

  } catch (err) {
    console.error('[KwaiTracker] Erro:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Rota de teste / health check ───────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Kwai Tracker Webhook',
    pixel_id: CONFIG.KWAI_PIXEL_ID ? `${CONFIG.KWAI_PIXEL_ID.substring(0,6)}***` : 'NÃO CONFIGURADO',
    endpoints: {
      webhook: 'POST /webhook/vega  ← coloque esta URL no painel da VEGA',
      test:    'POST /test          ← para testar sem a VEGA',
      health:  'GET  /health',
    }
  });
});

app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── Rota de teste manual ────────────────────────────────────────────────────
app.post('/test', async (req, res) => {
  const { event_type = 'VENDA_APROVADA', value = 97.00, email = 'teste@email.com' } = req.body;

  try {
    const data      = { event_type, value, email, order_id: 'TEST-' + Date.now() };
    const eventType = data.event_type.toUpperCase().replace(/ /g, '_');
    const kwaiEvent = EVENT_MAP[eventType];

    if (!kwaiEvent) {
      return res.json({ ok: false, message: `Evento "${event_type}" não reconhecido` });
    }

    const result = await sendToKwai(kwaiEvent, data);
    return res.json({ ok: true, kwai_event: kwaiEvent, kwai_response: result });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(CONFIG.PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Kwai Tracker Webhook - RODANDO             ║');
  console.log(`║   Porta: ${CONFIG.PORT}                              ║`);
  console.log(`║   Pixel: ${CONFIG.KWAI_PIXEL_ID ? CONFIG.KWAI_PIXEL_ID.substring(0,10) + '...' : 'NÃO CONFIGURADO    '}       ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('URL do webhook para o painel VEGA:');
  console.log('  http://localhost:' + CONFIG.PORT + '/webhook/vega');
  console.log('');
});

module.exports = app;
