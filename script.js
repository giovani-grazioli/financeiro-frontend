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
  [
    document.getElementById('btnExport'),
    ...document.querySelectorAll('.quickItem'),
    document.getElementById('historySearch'),
    document.getElementById('historyDateFrom'),
    document.getElementById('historyDateTo'),
    document.getElementById('historyPrev'),
    document.getElementById('historyNext')
  ]
    .filter(Boolean)
    .forEach((el) => (el.disabled = !enabled));
}

function centsToText(cents) {
  const api = window.GippoAPI;
  if (api?.centsToBRL) return api.centsToBRL(Number(cents) || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((Number(cents) || 0) / 100);
}

function parseBRLToCents(raw) {
  if (typeof raw !== 'string') return NaN;
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/R\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

const HISTORY_PAGE_SIZE = 6;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function computeProjection({ currentBalanceCents, months, allTransactions }) {
  const map = new Map(months.map((m) => [monthKey(m), { entradas: 0, saidas: 0 }]));
  let paidNetInHorizon = 0;

  const addTx = (tx) => {
    const status = String(tx?.status || 'pending');
    if (status === 'canceled') return;

    const type = String(tx?.type);
    const amount = Number(tx?.amount_cents) || 0;
    const key = monthKey(String(tx?.due_date || '').slice(0, 10) + 'T12:00:00');
    const bucket = map.get(key);
    if (!bucket) return;

    if (type === 'expense') bucket.saidas += amount;
    else bucket.entradas += amount;

    if (status === 'paid') {
      paidNetInHorizon += type === 'expense' ? -amount : amount;
    }
  };

  (Array.isArray(allTransactions) ? allTransactions : []).forEach((t) => addTx(t));

  const openingBalance = (Number(currentBalanceCents) || 0) - paidNetInHorizon;

  let acumulado = openingBalance;
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

  return {
    rows,
    opening_balance_cents: openingBalance
  };
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

function statusLabel(status) {
  const s = String(status || 'pending');
  if (s === 'paid') return 'Efetivada';
  if (s === 'overdue') return 'Vencida';
  if (s === 'canceled') return 'Cancelada';
  return 'Pendente';
}

let historyStateItems = [];
const historyView = {
  q: '',
  dateFrom: '',
  dateTo: '',
  pageIndex: 0,
  filteredCount: 0
};

function normalizeSearch(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function buildTxSearchBlob(it) {
  const amountCents = Number(it?.amount_cents) || 0;
  const amountNum = (amountCents / 100).toFixed(2);
  const amountPt = amountNum.replace('.', ',');
  const amountMoney = centsToText(amountCents);
  const due = String(it?.due_date || '').slice(0, 10);

  return normalizeSearch(
    [
      it?.description,
      it?.category_name,
      it?.account_name,
      it?.type === 'expense' ? 'despesa' : 'receita',
      statusLabel(it?.status),
      it?.status,
      amountNum,
      amountPt,
      amountMoney,
      due
    ].join(' ')
  );
}

function applyHistoryFilters(items, view) {
  const q = normalizeSearch(view?.q || '');
  const from = String(view?.dateFrom || '').slice(0, 10);
  const to = String(view?.dateTo || '').slice(0, 10);

  return (Array.isArray(items) ? items : []).filter((it) => {
    if (String(it?.status || 'pending') === 'canceled') return false;

    const due = String(it?.due_date || '').slice(0, 10);
    if (from && (!due || due < from)) return false;
    if (to && (!due || due > to)) return false;

    if (q) {
      const blob = buildTxSearchBlob(it);
      if (!blob.includes(q)) return false;
    }

    return true;
  });
}

function renderHistoryPager(view) {
  const pager = document.getElementById('historyPager');
  const info = document.getElementById('historyPagerInfo');
  const prevBtn = document.getElementById('historyPrev');
  const nextBtn = document.getElementById('historyNext');
  if (!pager || !info || !prevBtn || !nextBtn) return;

  const total = Number(view?.filteredCount) || 0;
  const pageIndex = Number(view?.pageIndex) || 0;
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));
  const hasPrev = pageIndex > 0;
  const hasNext = pageIndex + 1 < pages;

  pager.hidden = total <= HISTORY_PAGE_SIZE;
  prevBtn.disabled = !hasPrev;
  nextBtn.disabled = !hasNext;
  info.textContent = total ? `Página ${pageIndex + 1} de ${pages}` : '';
}

function renderHistoryFromState() {
  const sorted = historyStateItems
    .slice()
    .sort((a, b) => String(a?.due_date || '').localeCompare(String(b?.due_date || '')));
  const filtered = applyHistoryFilters(sorted, historyView);

  historyView.filteredCount = filtered.length;

  const pages = Math.max(1, Math.ceil(filtered.length / HISTORY_PAGE_SIZE));
  if (historyView.pageIndex > pages - 1) historyView.pageIndex = pages - 1;

  const start = historyView.pageIndex * HISTORY_PAGE_SIZE;
  const paged = filtered.slice(start, start + HISTORY_PAGE_SIZE);

  renderHistory(paged);
  renderHistoryPager(historyView);
}

function renderHistory(items) {
  const body = document.getElementById('historyBody');
  const empty = document.getElementById('historyEmpty');
  if (!body) return;

  body.querySelectorAll('.tx').forEach((n) => n.remove());

  const txs = Array.isArray(items) ? items : [];

  if (!txs.length) {
    if (empty) empty.style.display = 'grid';
    return;
  }

  if (empty) empty.style.display = 'none';

  const frag = document.createDocumentFragment();

  txs.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'tx';
    row.style.animationDelay = `${idx * 20}ms`;
    row.dataset.txId = String(it.id);

    const isExpense = String(it.type) === 'expense';
    const signPrefix = isExpense ? '-' : '+';
    const moneyClass = isExpense ? 'money--bad' : 'money--good';
    const valueText = `${signPrefix} ${centsToText(Number(it.amount_cents) || 0)}`;
    const dueText = it?.due_date
      ? new Intl.DateTimeFormat('pt-BR').format(new Date(String(it.due_date).slice(0, 10) + 'T12:00:00'))
      : '';

    row.innerHTML = `
      <div class="tx__main">
        <div class="tx__title">${escapeHtml(String(it.description || '(Sem descrição)'))}</div>
        <div class="tx__meta">
          <span class="pill pill--soft">${isExpense ? 'Despesa' : 'Receita'}</span>
          ${it.category_name ? `<span class="pill">${escapeHtml(String(it.category_name))}</span>` : ''}
          ${it.account_name ? `<span class="pill">${escapeHtml(String(it.account_name))}</span>` : ''}
          <span class="pill">${escapeHtml(statusLabel(it.status))}</span>
        </div>
      </div>
      <div class="tx__side">
        <div class="tx__value money ${moneyClass}">${escapeHtml(valueText)}</div>
        <div class="tx__date">${escapeHtml(dueText)}</div>
        <div class="tx__actions">
          <button class="txBtn" type="button" data-act="edit" aria-label="Editar transação">
            <i class="bi bi-pencil-square"></i>
          </button>
        </div>
      </div>
    `;

    frag.appendChild(row);
  });

  body.appendChild(frag);
}

function setHistoryEditError(msg) {
  const errorEl = document.getElementById('historyEditError');
  if (!errorEl) return;
  if (!msg) {
    errorEl.hidden = true;
    errorEl.textContent = '';
    return;
  }
  errorEl.hidden = false;
  errorEl.textContent = msg;
}

function findHistoryTxById(id) {
  return historyStateItems.find((it) => String(it?.id) === String(id)) || null;
}

function setupHistoryEditor(onSaved) {
  const modal = document.getElementById('historyEditModal');
  const backdrop = document.getElementById('historyEditBackdrop');
  const btnClose = document.getElementById('historyEditClose');
  const btnCancel = document.getElementById('historyEditCancel');
  const form = document.getElementById('historyEditForm');
  const submitBtn = document.getElementById('historyEditSubmit');
  const historyBody = document.getElementById('historyBody');

  if (!modal || !form || !historyBody) return;

  let editingTxId = null;

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    editingTxId = null;
    setHistoryEditError('');
  };

  const open = (tx) => {
    const descriptionEl = document.getElementById('historyEditDescription');
    const amountEl = document.getElementById('historyEditAmount');
    const dateEl = document.getElementById('historyEditDate');
    const statusEl = document.getElementById('historyEditStatus');
    if (!descriptionEl || !amountEl || !dateEl || !statusEl) return;

    editingTxId = String(tx.id);
    descriptionEl.value = String(tx.description || '');
    amountEl.value = (Number(tx.amount_cents || 0) / 100).toFixed(2).replace('.', ',');
    dateEl.value = String(tx.due_date || '').slice(0, 10);
    statusEl.value = String(tx.status || 'pending');

    setHistoryEditError('');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => descriptionEl.focus(), 0);
  };

  btnClose?.addEventListener('click', close);
  btnCancel?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && !modal.hidden) close();
  });

  historyBody.addEventListener('click', (ev) => {
    const btn = ev.target?.closest?.('button[data-act="edit"]');
    if (!btn) return;
    const row = btn.closest('.tx');
    const txId = row?.dataset?.txId;
    if (!txId) return;
    const tx = findHistoryTxById(txId);
    if (!tx) return;
    open(tx);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const api = window.GippoAPI;
    if (!api) {
      setHistoryEditError('API não carregada.');
      return;
    }
    if (!editingTxId) {
      setHistoryEditError('Transação não identificada.');
      return;
    }

    const currentTx = findHistoryTxById(editingTxId);
    if (!currentTx) {
      setHistoryEditError('Transação não encontrada no histórico atual.');
      return;
    }

    const description = String(document.getElementById('historyEditDescription')?.value || '').trim();
    const amount_cents = parseBRLToCents(String(document.getElementById('historyEditAmount')?.value || ''));
    const due_date = String(document.getElementById('historyEditDate')?.value || '').trim();
    const status = String(document.getElementById('historyEditStatus')?.value || 'pending');

    if (!description) {
      setHistoryEditError('Informe a descrição.');
      return;
    }
    if (!due_date) {
      setHistoryEditError('Informe a data.');
      return;
    }
    if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
      setHistoryEditError('Informe um valor válido.');
      return;
    }

    const patch = { description, amount_cents, due_date, status };
    if (status === 'paid' && String(currentTx.status) !== 'paid') {
      patch.paid_at = new Date().toISOString();
    }
    if (status !== 'paid') {
      patch.paid_at = null;
    }

    try {
      setHistoryEditError('');
      if (submitBtn) submitBtn.disabled = true;
      await api.patchTransaction(editingTxId, patch);
      close();
      toast('Transação atualizada');
      await onSaved?.();
    } catch (e) {
      setHistoryEditError(e?.message || 'Erro ao atualizar transação.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function setupHistoryFilters() {
  const searchEl = document.getElementById('historySearch');
  const fromEl = document.getElementById('historyDateFrom');
  const toEl = document.getElementById('historyDateTo');
  const prevBtn = document.getElementById('historyPrev');
  const nextBtn = document.getElementById('historyNext');

  let searchTimer = null;

  searchEl?.addEventListener('input', () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      historyView.q = String(searchEl.value || '');
      historyView.pageIndex = 0;
      renderHistoryFromState();
    }, 260);
  });

  const onDateChange = () => {
    historyView.dateFrom = String(fromEl?.value || '');
    historyView.dateTo = String(toEl?.value || '');
    historyView.pageIndex = 0;
    renderHistoryFromState();
  };

  fromEl?.addEventListener('change', onDateChange);
  toEl?.addEventListener('change', onDateChange);

  prevBtn?.addEventListener('click', () => {
    if (historyView.pageIndex <= 0) return;
    historyView.pageIndex -= 1;
    renderHistoryFromState();
  });

  nextBtn?.addEventListener('click', () => {
    const pages = Math.max(1, Math.ceil((Number(historyView.filteredCount) || 0) / HISTORY_PAGE_SIZE));
    if (historyView.pageIndex + 1 >= pages) return;
    historyView.pageIndex += 1;
    renderHistoryFromState();
  });
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

  const [summary, lookups, pending, overdue, paid] = await Promise.all([
    api.dashboardSummary({ month, year }),
    loadLookups(),
    listAllTransactions({
      status: 'pending',
      due_date_from: isoDateLocal(currentMonthStart),
      due_date_to: isoDateLocal(horizonEnd)
    }),
    listAllTransactions({
      status: 'overdue',
      due_date_from: isoDateLocal(currentMonthStart),
      due_date_to: isoDateLocal(horizonEnd)
    }),
    listAllTransactions({
      status: 'paid',
      due_date_from: isoDateLocal(currentMonthStart),
      due_date_to: isoDateLocal(horizonEnd)
    })
  ]);

  const balanceCents = Number(summary?.balance_cents) || 0;
  const pendingHydrated = hydrateNames(pending, lookups);
  const overdueHydrated = hydrateNames(overdue, lookups);
  const paidHydrated = hydrateNames(paid, lookups);
  const allHydrated = [...pendingHydrated, ...overdueHydrated, ...paidHydrated];
  historyStateItems = allHydrated.slice();

  const projection = computeProjection({
    currentBalanceCents: balanceCents,
    months,
    allTransactions: allHydrated
  });

  renderProjection({ balanceCents, rows: projection.rows });
  renderHistoryFromState();

  window.__gippoFluxoExport = {
    generatedAt: new Date().toISOString(),
    balance_cents: balanceCents,
    horizon: {
      start: isoDateLocal(currentMonthStart),
      end: isoDateLocal(horizonEnd)
    },
    projections: projection.rows,
    counts: {
      paid: paidHydrated.length,
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
  setupHistoryFilters();
  setupHistoryEditor(async () => {
    await loadAndRenderFluxo();
  });

  document.getElementById('btnExport')?.addEventListener('click', exportData);

  setUiEnabled(false);

  window.addEventListener('gippo:auth', async (ev) => {
    const authed = Boolean(ev?.detail?.authed);
    if (!authed) {
      setUiEnabled(false);
      renderProjection({ balanceCents: 0, rows: [] });
      historyStateItems = [];
      historyView.pageIndex = 0;
      historyView.filteredCount = 0;
      renderHistoryFromState();
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
