const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const axios = require('axios');
const { getValidToken } = require('./auth');

const upload = multer({ storage: multer.memoryStorage() });

const MDR_RATES = {
    'visa':       { 'credito a vista': 2.17, 'debito': 0.81, 'credito parcelado 2-4': 2.76, 'credito parcelado 5-6': 2.99, 'credito parcelado 7-12': 3.18 },
    'mastercard': { 'credito a vista': 2.17, 'debito': 0.81, 'credito parcelado 2-4': 2.76, 'credito parcelado 5-6': 2.99, 'credito parcelado 7-12': 3.18 },
    'elo':        { 'credito a vista': 2.17, 'debito': 0.81, 'credito parcelado 2-4': 2.76, 'credito parcelado 5-6': 2.99, 'credito parcelado 7-12': 3.18 },
    'amex':       { 'credito a vista': 2.97, 'credito parcelado 2-4': 3.36, 'credito parcelado 5-6': 3.55, 'credito parcelado 7-12': 3.74 },
    'hipercard':  { 'credito a vista': 2.17, 'debito': 0.81 },
};

const STORE_CONFIG = {
    SIDE:    { costCenterId: process.env.CA_SIDE_COST_CENTER_ID,    accountId: process.env.CA_SIDE_ACCOUNT_ID,    categoryId: process.env.CA_SIDE_CATEGORY_ID },
    ZONE:    { costCenterId: process.env.CA_ZONE_COST_CENTER_ID,    accountId: process.env.CA_ZONE_ACCOUNT_ID,    categoryId: process.env.CA_ZONE_CATEGORY_ID },
    PLACE:   { costCenterId: process.env.CA_PLACE_COST_CENTER_ID,   accountId: process.env.CA_PLACE_ACCOUNT_ID,   categoryId: process.env.CA_PLACE_CATEGORY_ID },
    STATION: { costCenterId: process.env.CA_STATION_COST_CENTER_ID, accountId: process.env.CA_STATION_ACCOUNT_ID, categoryId: process.env.CA_STATION_CATEGORY_ID },
};

// POST /api/upload - import sales to Conta Azul
router.post('/', upload.single('file'), async (req, res) => {
    const { store } = req.body;
    if (!store || !STORE_CONFIG[store.toUpperCase()]) return res.status(400).json({ error: 'Loja invalida' });
    if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });
    const storeName = store.toUpperCase();
    try {
          const token = await getValidToken(storeName);
          const sales = parseRedeExcel(req.file.buffer);
          const results = [];
          for (const sale of sales) {
                  try {
                            const result = await createContaAzulSale(token, sale, storeName);
                            results.push({ success: true, sale, id: result.id });
                  } catch (err) {
                            results.push({ success: false, sale, error: err.response?.data || err.message });
                  }
          }
          const ok = results.filter(r => r.success).length;
          res.json({ message: `${ok} vendas importadas, ${results.length - ok} com erro.`, total: sales.length, results });
    } catch (err) {
          if (err.message.includes('nao autenticada')) return res.status(401).json({ error: err.message });
          res.status(500).json({ error: err.message });
    }
});

// POST /api/upload/preview - parse without importing
router.post('/preview', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });
    try {
          const sales = parseRedeExcel(req.file.buffer);
          res.json({ total: sales.length, sales });
    } catch (err) {
          res.status(400).json({ error: 'Erro ao processar Excel: ' + err.message });
    }
});

function parseRedeExcel(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    const sales = [];
    for (const row of rows) {
          const n = {};
          for (const [k, v] of Object.entries(row)) n[k.toLowerCase().trim().replace(/\s+/g, '_')] = v;
          const dateRaw = n['data'] || n['data_transacao'] || n['data_da_transacao'] || '';
          const status = (n['status'] || n['situacao'] || '').toString().toLowerCase();
          const valueRaw = n['valor'] || n['valor_bruto'] || n['valor_da_transacao'] || 0;
          const brandRaw = (n['bandeira'] || n['cartao'] || '').toString().toLowerCase().trim();
          const modalityRaw = (n['modalidade'] || n['tipo'] || n['produto'] || '').toString().toLowerCase().trim();
          const channelRaw = (n['canal'] || n['origem'] || '').toString().toLowerCase().trim();
          const installmentsRaw = n['parcelas'] || n['numero_de_parcelas'] || 1;
          if (status.includes('negad') || status.includes('cancel') || status.includes('revert')) continue;
          const value = parseFloat(typeof valueRaw === 'string' ? valueRaw.replace('R$','').replace(/\./g,'').replace(',','.').trim() : valueRaw);
          if (!value || isNaN(value) || value <= 0) continue;
          const saleDate = parseDate(dateRaw);
          if (!saleDate) continue;
          const brand = normalizeBrand(brandRaw);
          const installments = parseInt(installmentsRaw) || 1;
          const { modality, modalityKey } = normalizeModality(modalityRaw, installments, channelRaw);
          const mdrRate = getMDR(brand, modalityKey);
          sales.push({
                  date: saleDate, brand, brandDisplay: capitalize(brand),
                  modality, modalityKey, value, mdrRate,
                  channel: channelRaw.includes('link') ? 'link de pagamento' : 'maquininha',
                  status, installments,
                  description: `PRESTACAO DE SERVICO DE LAVANDERIA - ${capitalize(brand)} ${modality}`,
          });
    }
    return sales;
}

function parseDate(raw) {
    if (!raw) return null;
    const s = raw.toString().trim();
    const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return s.substring(0, 10);
    if (!isNaN(s)) {
          const d = XLSX.SSF.parse_date_code(parseInt(s));
          if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    }
    return null;
}

function normalizeBrand(raw) {
    if (raw.includes('visa')) return 'visa';
    if (raw.includes('master')) return 'mastercard';
    if (raw.includes('elo')) return 'elo';
    if (raw.includes('amex') || raw.includes('american')) return 'amex';
    if (raw.includes('hiper')) return 'hipercard';
    return raw;
}

function normalizeModality(r, installments, channel) {
    const isLink = channel.includes('link');
    let key = 'credito a vista', mod = 'Credito a Vista';
    if (r.includes('debito') || r.includes('debit')) { key = 'debito'; mod = 'Debito'; }
    else if (installments > 1) {
          if (installments <= 4) { key = 'credito parcelado 2-4'; mod = `Credito Parcelado ${installments}x`; }
          else if (installments <= 6) { key = 'credito parcelado 5-6'; mod = `Credito Parcelado ${installments}x`; }
          else { key = 'credito parcelado 7-12'; mod = `Credito Parcelado ${installments}x`; }
    }
    if (isLink) mod += ' - Link de Pagamento';
    return { modality: mod, modalityKey: key };
}

function getMDR(brand, key) {
    const r = MDR_RATES[brand] || MDR_RATES['visa'];
    return r[key] || r['credito a vista'] || 2.17;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }

async function createContaAzulSale(token, sale, store) {
    const cfg = STORE_CONFIG[store];
    const clientId = await getOrCreateClient(token, sale.brandDisplay);
    const discount = parseFloat((sale.value * sale.mdrRate / 100).toFixed(2));
    const net = parseFloat((sale.value - discount).toFixed(2));
    const payload = {
          id_cliente: clientId,
          numero: Math.floor(Date.now() / 1000) % 1000000,
          situacao: 'APROVADO',
          data_venda: sale.date,
          id_categoria: cfg.categoryId,
          id_centro_custo: cfg.costCenterId,
          observacoes: sale.description,
          itens: [{ descricao: sale.description, quantidade: 1, valor_unitario: sale.value, desconto: { tipo: 'PERCENTUAL', valor: sale.mdrRate } }],
          condicao_pagamento: {
                  tipo_condicao_pagamento: 'A vista',
                  id_conta_recebimento: cfg.accountId,
                  parcelas: [{ data_vencimento: sale.date, valor: net, descricao: `${sale.brandDisplay} ${sale.modality}` }],
          },
    };
    const res = await axios.post('https://api-v2.contaazul.com/v1/venda', payload, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    return res.data;
}

const clientCache = {};
async function getOrCreateClient(token, brand) {
    const k = `${token.substring(0,8)}_${brand}`;
    if (clientCache[k]) return clientCache[k];
    try {
          const r = await axios.get('https://api-v2.contaazul.com/v1/pessoa/busca', {
                  params: { nome: brand.toUpperCase(), page: 0, size: 5 },
                  headers: { Authorization: `Bearer ${token}` },
          });
          const items = r.data?.content || r.data || [];
          if (items.length > 0) { clientCache[k] = items[0].id; return items[0].id; }
    } catch (e) { console.warn('Erro ao buscar cliente:', e.message); }
    throw new Error(`Cliente "${brand}" nao encontrado no Conta Azul. Cadastre-o primeiro.`);
}

module.exports = router;
