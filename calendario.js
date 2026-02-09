const fmtBRL = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const monthNames = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

function loadJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Legacy localStorage helpers kept for backward-compat export compatibility (not used for rendering).
// (Some customers may still have old data stored, but production rendering is API-based.)

function parseISODate(iso) {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return Number.isFinite(d.getTime()) ? d : null;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(isoDate) {
  if (!isoDate) return '';
  try {
    const d = new Date(String(isoDate).slice(0, 10) + 'T12:00:00');
    return new Intl.DateTimeFormat('pt-BR').format(d);
  } catch {
    return String(isoDate);
  }
}

function inMonth(d, year, monthIndex) {
  return d && d.getFullYear() === year && d.getMonth() === monthIndex;
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

function toArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

function monthDateRange(year, monthIndex) {
  const y = Number(year);
  const m = Number(monthIndex);
  const start = new Date(Date.UTC(y, m, 1, 12, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 0, 12, 0, 0));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { due_date_from: iso(start), due_date_to: iso(end) };
}

function centsToText(cents) {
  const api = window.GippoAPI;
  if (api?.centsToBRL) return api.centsToBRL(Number(cents) || 0);
  return fmtBRL((Number(cents) || 0) / 100);
}

function txTypeLabel(type) {
  return String(type) === 'expense' ? 'Despesa' : 'Receita';
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

async function loadLookups() {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const accountsPayload = await api.listAccounts();
  const accounts = toArrayPayload(accountsPayload);
  const accountsById = new Map(accounts.map((a) => [String(a.id), a.name]));

  // Categories: use cache if available (same strategy as other screens)
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

  return { accounts, accountsById, categoriesById };
}

async function listAllTransactionsByStatus(status, { from, to } = {}) {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const all = [];
  let cursor = undefined;
  const hardCap = 5000;

  while (all.length < hardCap) {
    const res = await api.listTransactions({
      limit: 200,
      cursor,
      status,
      // Date filters supported by backend (do NOT send from/to to avoid conflict)
      due_date_from: from,
      due_date_to: to
    });
    const batch = toArrayPayload(res);
    all.push(...batch);
    if (!res?.next_cursor || !batch.length) break;
    cursor = res.next_cursor;
  }

  return all;
}

function filterToMonth(items, year, monthIndex) {
  return (Array.isArray(items) ? items : []).filter((it) => {
    const d = parseISODate(String(it?.due_date || '').slice(0, 10));
    return inMonth(d, year, monthIndex);
  });
}

function renderBucket(el, items) {
  if (!el) return;

  if (!items.length) {
    el.className = 'bucket__empty';
    el.textContent = 'Nenhum lançamento';
    return;
  }

  el.className = 'bucketList';
  el.innerHTML = items
    .slice(0, 6)
    .map((it) => {
      const isExpense = String(it.type) === 'expense';
      const moneyClass = isExpense ? 'money--bad' : 'money--good';
      const valueText = `${isExpense ? '-' : '+'} ${centsToText(Number(it.amount_cents) || 0)}`;
      return `
        <div class="bucketItem">
          <div>
            <div class="bucketItem__title">${escapeHtml(it.description || 'Lançamento')}</div>
            <div class="bucketItem__meta">${escapeHtml(txTypeLabel(it.type))}${it.category_name ? ` • ${escapeHtml(it.category_name)}` : ''}${it.account_name ? ` • ${escapeHtml(it.account_name)}` : ''} • ${escapeHtml(formatDate(it.due_date) || '')}</div>
          </div>
          <div class="bucketItem__value ${moneyClass}">${escapeHtml(valueText)}</div>
        </div>
      `;
    })
    .join('');
}

function setupSidebarToggle() {
  const btn = document.getElementById('btnSidebar');
  const btnBrand = document.getElementById('btnBrand');
  const root = document.getElementById('appRoot');
  if (!root) return;

  const toggle = () => root.classList.toggle('is-collapsed');
  btn?.addEventListener('click', toggle);
  btnBrand?.addEventListener('click', toggle);
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
  const rippleTargets = [document.getElementById('btnExport')].filter(Boolean);
  rippleTargets.forEach((el) => {
    el.classList.add('ripple');

    el.addEventListener('pointerdown', (ev) => {
      const rect = el.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      el.style.setProperty('--x', `${x}px`);
      el.style.setProperty('--y', `${y}px`);
      el.classList.remove('rippling');
      void el.offsetWidth;
      el.classList.add('rippling');
      window.setTimeout(() => el.classList.remove('rippling'), 680);
    });
  });
}

function setupDropdowns(onChange) {
  const dropdowns = [...document.querySelectorAll('[data-dd]')];

  const closeAll = (except) => {
    dropdowns.forEach((dd) => {
      if (dd !== except) dd.classList.remove('is-open');
      const btn = dd.querySelector('.dd__btn');
      if (btn) btn.setAttribute('aria-expanded', dd.classList.contains('is-open') ? 'true' : 'false');
    });
  };

  const setSelection = (dd, opt) => {
    const hidden = dd.querySelector('input[type="hidden"]');
    const text = dd.querySelector('.dd__text');
    const value = opt.getAttribute('data-value') ?? '';
    if (hidden) hidden.value = value;
    if (text) text.textContent = opt.textContent.trim();

    dd.querySelectorAll('.dd__opt').forEach((b) => {
      const isSelected = b === opt;
      b.classList.toggle('is-selected', isSelected);
      b.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    onChange?.();
  };

  dropdowns.forEach((dd) => {
    const btn = dd.querySelector('.dd__btn');
    const menu = dd.querySelector('.dd__menu');
    const opts = [...dd.querySelectorAll('.dd__opt')];

    if (!btn || !menu) return;

    const open = () => {
      closeAll(dd);
      dd.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      const localOpts = [...dd.querySelectorAll('.dd__opt')];
      const selected = dd.querySelector('.dd__opt.is-selected') || localOpts[0];
      localOpts.forEach((o) => o.classList.remove('is-active'));
      selected?.classList.add('is-active');
      selected?.scrollIntoView({ block: 'nearest' });
      menu.focus();
    };

    const close = () => {
      dd.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      dd.querySelectorAll('.dd__opt').forEach((o) => o.classList.remove('is-active'));
    };

    btn.addEventListener('click', () => {
      if (dd.classList.contains('is-open')) close();
      else open();
    });

    dd.addEventListener('click', (ev) => {
      const t = ev.target;
      const opt = t?.closest?.('.dd__opt');
      if (!opt) return;
      setSelection(dd, opt);
      close();
    });

    btn.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        open();
      }
    });

    menu.addEventListener('keydown', (ev) => {
      const localOpts = [...dd.querySelectorAll('.dd__opt')];
      const active = dd.querySelector('.dd__opt.is-active') || dd.querySelector('.dd__opt.is-selected') || localOpts[0];
      const idx = Math.max(0, localOpts.indexOf(active));

      if (ev.key === 'Escape') {
        ev.preventDefault();
        close();
        btn.focus();
        return;
      }

      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const nextIdx = ev.key === 'ArrowDown' ? Math.min(localOpts.length - 1, idx + 1) : Math.max(0, idx - 1);
        localOpts.forEach((o) => o.classList.remove('is-active'));
        localOpts[nextIdx].classList.add('is-active');
        localOpts[nextIdx].scrollIntoView({ block: 'nearest' });
        return;
      }

      if (ev.key === 'Enter') {
        ev.preventDefault();
        const pick = dd.querySelector('.dd__opt.is-active') || active;
        if (pick) setSelection(dd, pick);
        close();
        btn.focus();
      }
    });

    menu.setAttribute('tabindex', '0');

    // silence unused var warning (opts)
    void opts;
  });

  document.addEventListener('pointerdown', (ev) => {
    const target = ev.target;
    const inside = dropdowns.some((dd) => dd.contains(target));
    if (!inside) closeAll(null);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    closeAll(null);
  });
}

function buildMenu(menuEl, items, selectedValue) {
  if (!menuEl) return;
  menuEl.innerHTML = '';
  const frag = document.createDocumentFragment();

  items.forEach(({ label, value }, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd__opt';
    btn.setAttribute('role', 'option');
    btn.setAttribute('data-value', String(value));

    const isSelected = String(value) === String(selectedValue);
    btn.classList.toggle('is-selected', isSelected);
    btn.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    btn.textContent = label;

    frag.appendChild(btn);

    // first item focus hint
    if (idx === 0) btn.setAttribute('tabindex', '-1');
  });

  menuEl.appendChild(frag);
}

function setUiEnabled(enabled) {
  [
    document.getElementById('btnExport'),
    ...document.querySelectorAll('.dd__btn')
  ]
    .filter(Boolean)
    .forEach((el) => (el.disabled = !enabled));
}

async function refreshSaldoSidebar() {
  const api = window.GippoAPI;
  if (!api) return;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const summary = await api.dashboardSummary({ month, year });
  const text = centsToText(Number(summary?.balance_cents) || 0);
  const saldoHeader = document.getElementById('saldoHeader');
  const saldoTotal = document.getElementById('saldoTotal');
  if (saldoHeader) saldoHeader.textContent = text;
  if (saldoTotal) saldoTotal.textContent = text;
  return Number(summary?.balance_cents) || 0;
}

function renderStats({ aReceberCents, aPagarCents, saldoAtualCents }) {
  const saldoProjetadoCents = Number(saldoAtualCents) + (Number(aReceberCents) - Number(aPagarCents));

  const aReceberEl = document.getElementById('aReceber');
  const aPagarEl = document.getElementById('aPagar');
  const saldoAtualEl = document.getElementById('saldoAtual');
  const saldoProjEl = document.getElementById('saldoProjetado');

  if (aReceberEl) aReceberEl.textContent = centsToText(aReceberCents);
  if (aPagarEl) aPagarEl.textContent = centsToText(aPagarCents);
  if (saldoAtualEl) saldoAtualEl.textContent = centsToText(saldoAtualCents);
  if (saldoProjEl) {
    saldoProjEl.textContent = centsToText(saldoProjetadoCents);
    saldoProjEl.classList.toggle('miniStat__value--good', saldoProjetadoCents >= 0);
    saldoProjEl.classList.toggle('miniStat__value--bad', saldoProjetadoCents < 0);
  }
}

async function loadAndRender(state) {
  const monthIndex = Number(document.getElementById('calMonth')?.value ?? new Date().getMonth());
  const year = Number(document.getElementById('calYear')?.value ?? new Date().getFullYear());
  const range = monthDateRange(year, monthIndex);

  const [lookups, saldoAtualCents, pendingRaw, paidRaw, overdueRaw] = await Promise.all([
    loadLookups(),
    refreshSaldoSidebar(),
    listAllTransactionsByStatus('pending', { from: range.due_date_from, to: range.due_date_to }),
    listAllTransactionsByStatus('paid', { from: range.due_date_from, to: range.due_date_to }),
    listAllTransactionsByStatus('overdue', { from: range.due_date_from, to: range.due_date_to })
  ]);

  const pending = hydrateNames(filterToMonth(pendingRaw, year, monthIndex), lookups)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const paid = hydrateNames(filterToMonth(paidRaw, year, monthIndex), lookups)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const overdue = hydrateNames(filterToMonth(overdueRaw, year, monthIndex), lookups)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));

  state.view = { year, monthIndex, range, pending, paid, overdue };

  const unpaid = [...pending, ...overdue];
  const aReceberCents = unpaid
    .filter((t) => String(t.type) === 'income')
    .reduce((acc, t) => acc + (Number(t.amount_cents) || 0), 0);
  const aPagarCents = unpaid
    .filter((t) => String(t.type) === 'expense')
    .reduce((acc, t) => acc + (Number(t.amount_cents) || 0), 0);

  renderStats({ aReceberCents, aPagarCents, saldoAtualCents: Number(saldoAtualCents) || 0 });

  renderBucket(document.getElementById('bucketPendentes'), pending);
  renderBucket(document.getElementById('bucketPagos'), paid);
  renderBucket(document.getElementById('bucketVencidos'), overdue);
}

function exportData(state) {
  const view = state?.view || {};
  const payload = {
    generatedAt: new Date().toISOString(),
    year: view.year,
    monthIndex: view.monthIndex,
    range: view.range,
    buckets: {
      pending: view.pending || [],
      paid: view.paid || [],
      overdue: view.overdue || []
    }
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'calendario.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function main() {
  injectToastStyles();
  setupAnimations();
  setupRipple();
  setupSidebarToggle();

  const api = window.GippoAPI;
  const state = { view: null };

  const isUnauthorizedError = (e) => {
    const status = Number(e?.status);
    return status === 401 || status === 403;
  };

  // Default to current month/year
  const now = new Date();
  const defaultMonth = now.getMonth();
  const defaultYear = now.getFullYear();

  const monthHidden = document.getElementById('calMonth');
  const yearHidden = document.getElementById('calYear');
  if (monthHidden) monthHidden.value = String(defaultMonth);
  if (yearHidden) yearHidden.value = String(defaultYear);

  const monthMenu = document.getElementById('calMonthMenu');
  const yearMenu = document.getElementById('calYearMenu');

  buildMenu(
    monthMenu,
    monthNames.map((m, i) => ({ label: m, value: i })),
    defaultMonth
  );

  buildMenu(
    yearMenu,
    Array.from({ length: 7 }, (_, i) => ({ label: String(2024 + i), value: 2024 + i })),
    defaultYear
  );

  // sync labels
  document.getElementById('calMonthLabel').textContent = monthNames[defaultMonth];
  document.getElementById('calYearLabel').textContent = String(defaultYear);


  const triggerLoad = async () => {
    try {
      await loadAndRender(state);
    } catch (e) {
      if (isUnauthorizedError(e)) {
        window.GippoAuthGate?.open?.();
      }
      toast(e?.message || 'Erro ao carregar calendário');
    }
  };

  setupDropdowns(triggerLoad);

  document.getElementById('btnExport')?.addEventListener('click', () => exportData(state));

  setUiEnabled(false);

  window.addEventListener('gippo:auth', async (ev) => {
    const authed = Boolean(ev?.detail?.authed);
    if (!authed) {
      setUiEnabled(false);
      renderStats({ aReceberCents: 0, aPagarCents: 0, saldoAtualCents: 0 });
      renderBucket(document.getElementById('bucketPendentes'), []);
      renderBucket(document.getElementById('bucketPagos'), []);
      renderBucket(document.getElementById('bucketVencidos'), []);
      window.GippoAuthGate?.open?.();
      return;
    }

    setUiEnabled(true);
    await triggerLoad();
  });

  (async () => {
    if (!api) return;
    try {
      await api.me();
      setUiEnabled(true);
      await triggerLoad();
    } catch (e) {
      setUiEnabled(false);
      if (isUnauthorizedError(e)) window.GippoAuthGate?.open?.();
      else toast(e?.message || 'API indisponível');
    }
  })();
}

main();
