# 🎯 Kwai Tracker — Sistema Gratuito de Rastreamento

Substitui a **Xtracky** completamente, sem custo. Envia os eventos **AddToCart** (Pix gerado) e **Purchase** (Pix pago) direto para a API de Conversões do Kwai.

---

## Como funciona

```
Visitante clica no anúncio Kwai
        ↓
Sua página de venda carrega o kwai-tracker.js
(captura o click_id e UTMs do Kwai)
        ↓
Cliente gera o Pix no checkout VEGA
        ↓
VEGA dispara webhook → seu servidor → Kwai API
(evento: AddToCart)
        ↓
Cliente paga o Pix
        ↓
VEGA dispara webhook → seu servidor → Kwai API
(evento: Purchase)
```

---

## Passo 1 — Pegar credenciais do Kwai

1. Acesse [Kwai for Business](https://business.kwai.com)
2. Vá em **Ferramentas → Pixels**
3. Crie ou selecione seu Pixel → copie o **Pixel ID**
4. Vá em **Ferramentas → API de Conversões** → gere o **Access Token**
5. (Opcional) Em **Pixels → Eventos de Teste** → copie o **Test Event Code**

---

## Passo 2 — Deploy do servidor (GRATUITO)

### Opção A: Railway (Recomendado — mais fácil)

1. Acesse [railway.app](https://railway.app) e crie conta gratuita
2. Clique em **New Project → Deploy from GitHub repo**
3. Faça upload dos arquivos desta pasta no GitHub
4. Na aba **Variables**, adicione:
   ```
   KWAI_PIXEL_ID     = seu_pixel_id
   KWAI_ACCESS_TOKEN = seu_access_token
   KWAI_TEST_EVENT   = (código de teste, se quiser)
   ```
5. O Railway gera uma URL automática tipo: `https://kwai-tracker-xxx.railway.app`

### Opção B: Render (também gratuito)

1. Acesse [render.com](https://render.com)
2. **New → Web Service → Connect Git**
3. Adicione as variáveis de ambiente igual ao Railway
4. URL gerada: `https://kwai-tracker.onrender.com`

### Opção C: Rodar local (para testes)

```bash
# Instalar dependências
npm install

# Configurar credenciais
cp .env.example .env
# edite o .env com seus dados

# Iniciar servidor
npm start
```

---

## Passo 3 — Configurar o script nas páginas de venda

Adicione em **todas as páginas de venda** (HTML, antes do `</body>`):

```html
<script
  src="https://SEU-SERVIDOR/kwai-tracker.js"
  data-pixel-id="SEU_PIXEL_ID"
></script>
```

> Substitua `SEU-SERVIDOR` pela URL gerada no Railway/Render
> Substitua `SEU_PIXEL_ID` pelo seu Pixel ID do Kwai

---

## Passo 4 — Configurar o Webhook no painel VEGA

1. Acesse o painel da **VEGA**
2. Vá em **Configurações → Webhooks**
3. Adicione novo webhook com a URL:
   ```
   https://SEU-SERVIDOR/webhook/vega
   ```
4. Ative os eventos:
   - ✅ **VENDA AGUARDANDO PAGAMENTO** → vira `AddToCart` no Kwai
   - ✅ **VENDA APROVADA** → vira `Purchase` no Kwai
5. Salve

---

## Testar se está funcionando

### Verificar se o servidor está online:
```
GET https://SEU-SERVIDOR/
```

### Simular um evento de teste:
```bash
curl -X POST https://SEU-SERVIDOR/test \
  -H "Content-Type: application/json" \
  -d '{"event_type": "VENDA_APROVADA", "value": 97.00, "email": "teste@email.com"}'
```

### Ver logs em tempo real:
No Railway: **seu projeto → Deployments → View Logs**
No Render: **seu serviço → Logs**

---

## Mapeamento de eventos

| Evento VEGA                    | Evento Kwai |
|--------------------------------|-------------|
| VENDA_AGUARDANDO_PAGAMENTO     | AddToCart   |
| AGUARDANDO_PAGAMENTO           | AddToCart   |
| pending / waiting_payment      | AddToCart   |
| VENDA_APROVADA                 | Purchase    |
| APROVADA / paid / approved     | Purchase    |

---

## Estrutura dos arquivos

```
kwai-tracker/
├── server.js            ← Servidor webhook (deploy no Railway/Render)
├── public/
│   └── kwai-tracker.js  ← Script para as páginas de venda
├── package.json
├── .env.example         ← Modelo de configuração
└── README.md
```

---

## Custo

| Plataforma | Plano gratuito |
|------------|----------------|
| Railway    | $5 créditos/mês (suficiente para uso normal) |
| Render     | Grátis (com spin-down após inatividade) |
| Fly.io     | Grátis (256MB RAM) |

**Comparado com Xtracky: R$ 0/mês** 🎉
