const monthLabel = (date) => {
  const months = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
  return `${months[date.getMonth()]} de ${date.getFullYear()}`;
};

const pad2 = (n) => String(n).padStart(2, '0');

function isoDateLocal(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = pad2(dt.getMonth() + 1);
  const day = pad2(dt.getDate());
  return `${y}-${m}-${day}`;
}

function startOfMonth(date) {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(12, 0, 0, 0);
  return d;
}

function endOfMonth(date) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(12, 0, 0, 0);
  return d;
}

function addMonths(date, m) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + m);
  return d;
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--in'));
  setTimeout(() => el.classList.remove('toast--in'), 1800);
  setTimeout(() => el.remove(), 2300);
}

function injectToastStyles() {
  if (document.getElementById('toastStyles')) return;
  const style = document.createElement('style');
  style.id = 'toastStyles';
  style.textContent = `
    .toast{
      position: fixed;
      left: 50%;
      bottom: 18px;
      transform: translateX(-50%) translateY(10px);
      opacity: 0;
      background: rgba(15,23,42,.92);
      color:#fff;
      padding: 10px 12px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 12px;
      box-shadow: 0 18px 36px rgba(15,23,42,.22);
      transition: transform .35s cubic-bezier(.2,.8,.2,1), opacity .35s cubic-bezier(.2,.8,.2,1);
      z-index: 50;
    }
    .toast--in{opacity: 1; transform: translateX(-50%) translateY(0px)}
  `;
  document.head.appendChild(style);
}

function setUiEnabled(enabled) {
  [document.getElementById('btnExport'), ...document.querySelectorAll('.quickItem')]
    .filter(Boolean)
    .forEach((el) => (el.disabled = !enabled));
}

function centsToText(cents) {
  const api = window.GippoAPI;
  if (api?.centsToBRL) return api.centsToBRL(Number(cents) || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
}

function toArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

function getNextCursor(payload) {
  if (!payload || Array.isArray(payload)) return null;
  return payload.next_cursor ?? payload.nextCursor ?? payload.next ?? null;
}

async function listAllTransactions(query) {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const all = [];
  let cursor = undefined;
  const hardCap = 12000;

  while (all.length < hardCap) {
    const res = await api.listTransactions({ limit: 200, cursor, ...(query || {}) });
    const batch = toArrayPayload(res);
    all.push(...batch);
    const next = getNextCursor(res);
    if (!next || !batch.length) break;
    cursor = next;
  }

  return all;
}

async function loadLookups() {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const accountsPayload = await api.listAccounts();
  const accounts = Array.isArray(accountsPayload) ? accountsPayload : toArrayPayload(accountsPayload);
  const accountsById = new Map(accounts.map((a) => [String(a.id), a.name]));

  const cats = [];
  ['both', 'income', 'expense'].forEach((k) => {
    try {
      const raw = localStorage.getItem(`gippo:categories:v1:${k}`);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
      cats.push(...items);
    } catch {
      // ignore
    }
  });

  let categories = cats;
  if (!categories.length) {
    const [both, income, expense] = await Promise.all([
      api.listCategories({ type: 'both' }),
      api.listCategories({ type: 'income' }),
      api.listCategories({ type: 'expense' })
    ]);
    categories = [...toArrayPayload(both), ...toArrayPayload(income), ...toArrayPayload(expense)];
  }

  const categoriesById = new Map(
    categories
      .map((c) => ({ id: c?.id, name: c?.name }))
      .filter((c) => c.id != null && c.name)
      .map((c) => [String(c.id), String(c.name)])
  );

  return { accountsById, categoriesById };
}

function hydrateNames(items, lookups) {
  const accById = lookups?.accountsById || new Map();
  const catById = lookups?.categoriesById || new Map();
  return (Array.isArray(items) ? items : []).map((it) => ({
    ...it,
    account_name: it.account_name || accById.get(String(it.account_id)) || '',
    category_name: it.category_name || catById.get(String(it.category_id)) || ''
  }));
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function isUnauthorizedError(e) {
  const status = Number(e?.status);
  return status === 401 || status === 403;
}

function buildHorizonMonths(baseDate, monthsCount) {
  const base = startOfMonth(baseDate);
  return Array.from({ length: monthsCount }, (_, i) => startOfMonth(addMonths(base, i)));
}

function computeProjection({ balanceCents, months, pending, overdue }) {
  const startMonth = months[0];
  const map = new Map(months.map((m) => [monthKey(m), { entradas: 0, saidas: 0 }]));
  const firstKey = monthKey(startMonth);

  const addTx = (tx, forceKey) => {
    const type = String(tx?.type);
    const amount = Number(tx?.amount_cents) || 0;
    const key = forceKey || monthKey(String(tx?.due_date || '').slice(0, 10) + 'T12:00:00');
    const bucket = map.get(key);
    if (!bucket) return;
    if (type === 'expense') bucket.saidas += amount;
    else bucket.entradas += amount;
  };

  // Pending: count on their due month
  (Array.isArray(pending) ? pending : []).forEach((t) => addTx(t, null));
  // Overdue: treat as expected to be resolved in the current month
  (Array.isArray(overdue) ? overdue : []).forEach((t) => addTx(t, firstKey));

  let acumulado = Number(balanceCents) || 0;
  const rows = months.map((m) => {
    const key = monthKey(m);
    const b = map.get(key) || { entradas: 0, saidas: 0 };
    const saldoLiquido = b.entradas - b.saidas;
    acumulado += saldoLiquido;
    return {
      key,
      month: m,
      mes: monthLabel(m),
      entradas_cents: b.entradas,
      saidas_cents: b.saidas,
      saldo_liquido_cents: saldoLiquido,
      saldo_acumulado_cents: acumulado
    };
  });

  return rows;
}

function renderProjection({ balanceCents, rows }) {
  const cardSaldo = document.getElementById('cardSaldo');
  const cardProj3 = document.getElementById('cardProj3');
  const cardProj6 = document.getElementById('cardProj6');
  const saldoHeader = document.getElementById('saldoHeader');
  const saldoTotal = document.getElementById('saldoTotal');

  const saldoText = centsToText(balanceCents);
  if (saldoHeader) saldoHeader.textContent = saldoText;
  if (saldoTotal) saldoTotal.textContent = saldoText;
  if (cardSaldo) cardSaldo.textContent = saldoText;

  const proj3Cents = rows?.[2]?.saldo_acumulado_cents ?? balanceCents;
  const proj6Cents = rows?.[5]?.saldo_acumulado_cents ?? balanceCents;
  if (cardProj3) cardProj3.textContent = centsToText(proj3Cents);
  if (cardProj6) cardProj6.textContent = centsToText(proj6Cents);

  const tbody = document.getElementById('projectionBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  (Array.isArray(rows) ? rows : []).forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.style.animationDelay = `${idx * 30}ms`;

    const entradasClass = r.entradas_cents > 0 ? 'money--good' : '';
    const saidasClass = r.saidas_cents > 0 ? 'money--bad' : 'money--bad';
    const saldoLiquidoClass = r.saldo_liquido_cents >= 0 ? 'money--good' : 'money--bad';

    tr.innerHTML = `
      <td class="month">${r.mes}</td>
      <td class="align-right money ${entradasClass}">${centsToText(r.entradas_cents)}</td>
      <td class="align-right money ${saidasClass}">${centsToText(r.saidas_cents)}</td>
      <td class="align-right money ${saldoLiquidoClass}">${centsToText(r.saldo_liquido_cents)}</td>
      <td class="align-right money">${centsToText(r.saldo_acumulado_cents)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function computeInsights({ rows, overdue, pending, lookups }) {
  const titleEl = document.getElementById('insightTitle');
  const descEl = document.getElementById('insightDesc');

  const firstNegative = (Array.isArray(rows) ? rows : []).find((r) => Number(r.saldo_acumulado_cents) < 0);

  // top expense category in horizon (pending + overdue)
  const txs = [...(pending || []), ...(overdue || [])];
  const byCat = new Map();
  for (const t of txs) {
    if (String(t.type) !== 'expense') continue;
    const k = String(t.category_id ?? '');
    byCat.set(k, (byCat.get(k) || 0) + (Number(t.amount_cents) || 0));
  }
  let topCat = null;
  for (const [k, v] of byCat.entries()) {
    if (!topCat || v > topCat.value) topCat = { key: k, value: v };
  }
  const topCatName = topCat?.key ? lookups?.categoriesById?.get(String(topCat.key)) : '';

  let title = 'Fluxo de Caixa Estável';
  let desc = 'Suas projeções indicam estabilidade financeira nos próximos meses.';

  if (firstNegative) {
    title = 'Atenção: risco de saldo negativo';
    desc = `O saldo projetado fica negativo em ${firstNegative.mes}.`;
  } else {
    const end = rows?.[rows.length - 1];
    if (end && Number(end.saldo_acumulado_cents) > Number(rows?.[0]?.saldo_acumulado_cents || 0)) {
      title = 'Tendência positiva no horizonte';
      desc = 'O saldo acumulado cresce ao longo dos próximos meses.';
    }
  }

  if (topCatName && topCat?.value) {
    desc += ` Maior saída prevista: ${topCatName} (${centsToText(topCat.value)}).`;
  }

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;
}

function setupAnimations() {
  const els = [...document.querySelectorAll('[data-anim]')];
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) e.target.classList.add('in');
      }
    },
    { threshold: 0.12 }
  );

  els.forEach((el, i) => {
    el.style.transitionDelay = `${i * 45}ms`;
    io.observe(el);
  });
}

function setupRipple() {
  const rippleTargets = [
    document.getElementById('btnExport'),
    ...document.querySelectorAll('.quickItem')
  ];

  rippleTargets.forEach((el) => {
    if (!el) return;
    el.classList.add('ripple');

    el.addEventListener('pointerdown', (ev) => {
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      el.style.setProperty('--x', `${x}px`);
      el.style.setProperty('--y', `${y}px`);
      el.classList.remove('rippling');
      // force reflow
      void el.offsetWidth;
      el.classList.add('rippling');
      window.setTimeout(() => el.classList.remove('rippling'), 680);
    });
  });
}

function exportData() {
  // Populated at runtime
  const payload = window.__gippoFluxoExport || { generatedAt: new Date().toISOString() };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'fluxo-de-caixa.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setupSidebarToggle() {
  const btn = document.getElementById('btnSidebar');
  const btnBrand = document.getElementById('btnBrand');
  const root = document.getElementById('appRoot');
  if (!btn || !root) return;

  const toggle = () => root.classList.toggle('is-collapsed');
  btn.addEventListener('click', toggle);

  // Requirement: allow returning by clicking the wallet icon
  btnBrand?.addEventListener('click', toggle);
}

function setupQuickActions() {
  document.getElementById('quickNovo')?.addEventListener('click', () => (window.location.href = 'lancamentos.html'));
  document.getElementById('quickContas')?.addEventListener('click', () => (window.location.href = 'contas.html'));
  document.getElementById('quickRelatorios')?.addEventListener('click', () => (window.location.href = 'pendencias.html'));
  document.getElementById('quickCalendario')?.addEventListener('click', () => (window.location.href = 'calendario.html'));
}

async function loadAndRenderFluxo() {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const now = new Date();
  const months = buildHorizonMonths(now, 6);
  const horizonEnd = endOfMonth(months[months.length - 1]);
  const currentMonthStart = startOfMonth(now);

  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [summary, lookups, pending, overdue] = await Promise.all([
    api.dashboardSummary({ month, year }),
    loadLookups(),
    listAllTransactions({
      status: 'pending',
      due_date_from: isoDateLocal(currentMonthStart),
      due_date_to: isoDateLocal(horizonEnd)
    }),
    listAllTransactions({
      status: 'overdue',
      // include very old overdue too, but cap by horizon end
      due_date_from: '1970-01-01',
      due_date_to: isoDateLocal(horizonEnd)
    })
  ]);

  const balanceCents = Number(summary?.balance_cents) || 0;
  const pendingHydrated = hydrateNames(pending, lookups);
  const overdueHydrated = hydrateNames(overdue, lookups);

  const rows = computeProjection({
    balanceCents,
    months,
    pending: pendingHydrated,
    overdue: overdueHydrated
  });

  renderProjection({ balanceCents, rows });
  computeInsights({ rows, overdue: overdueHydrated, pending: pendingHydrated, lookups });

  window.__gippoFluxoExport = {
    generatedAt: new Date().toISOString(),
    balance_cents: balanceCents,
    horizon: {
      start: isoDateLocal(currentMonthStart),
      end: isoDateLocal(horizonEnd)
    },
    projections: rows,
    counts: {
      pending: pendingHydrated.length,
      overdue: overdueHydrated.length
    }
  };
}

function main() {
  injectToastStyles();
  setupAnimations();
  setupRipple();
  setupSidebarToggle();
  setupQuickActions();

  document.getElementById('btnExport')?.addEventListener('click', exportData);

  setUiEnabled(false);

  window.addEventListener('gippo:auth', async (ev) => {
    const authed = Boolean(ev?.detail?.authed);
    if (!authed) {
      setUiEnabled(false);
      renderProjection({ balanceCents: 0, rows: [] });
      document.getElementById('insightTitle') && (document.getElementById('insightTitle').textContent = 'Faça login para ver seus dados');
      document.getElementById('insightDesc') && (document.getElementById('insightDesc').textContent = '');
      window.GippoAuthGate?.open?.();
      return;
    }

    setUiEnabled(true);
    try {
      await loadAndRenderFluxo();
    } catch (e) {
      if (isUnauthorizedError(e)) window.GippoAuthGate?.open?.();
      toast(e?.message || 'Erro ao carregar Fluxo de Caixa');
    }
  });

  (async () => {
    const api = window.GippoAPI;
    if (!api) return;
    try {
      await api.me();
      setUiEnabled(true);
      await loadAndRenderFluxo();
    } catch (e) {
      setUiEnabled(false);
      if (isUnauthorizedError(e)) window.GippoAuthGate?.open?.();
      else toast(e?.message || 'API indisponível');
    }
  })();
}

main();
