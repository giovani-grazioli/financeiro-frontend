const fmtBRL = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const parseBRL = (raw) => {
  if (typeof raw !== 'string') return NaN;
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/R\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
};

const CATEGORIES_CACHE_PREFIX = 'gippo:categories:v1:';

function categoriesCacheKey(type) {
  const t = String(type || 'both').toLowerCase();
  if (!['income', 'expense', 'both'].includes(t)) return `${CATEGORIES_CACHE_PREFIX}both`;
  return `${CATEGORIES_CACHE_PREFIX}${t}`;
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

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function readCategoriesCache(type) {
  try {
    const raw = localStorage.getItem(categoriesCacheKey(type));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    return items;
  } catch {
    return [];
  }
}

function writeCategoriesCache(type, items) {
  try {
    localStorage.setItem(
      categoriesCacheKey(type),
      JSON.stringify({ updatedAt: new Date().toISOString(), items: Array.isArray(items) ? items : [] })
    );
  } catch {
    // ignore
  }
}

function getCategoryId(c) {
  const id = c?.id ?? c?.category_id ?? c?.uuid ?? c?._id;
  return id == null ? '' : String(id);
}

function getCategoryName(c) {
  return String(c?.name ?? c?.nome ?? c?.title ?? c?.descricao ?? c?.description ?? '').trim();
}

function getCategoryType(c) {
  const raw = c?.type ?? c?.tipo ?? c?.kind ?? c?.category_type ?? 'both';
  const t = String(raw).toLowerCase();
  if (['both', 'ambos', 'all', 'any'].includes(t)) return 'both';
  if (['income', 'receita', 'revenue', 'entrada', 'in'].includes(t)) return 'income';
  if (['expense', 'despesa', 'cost', 'saida', 'out'].includes(t)) return 'expense';
  return 'both';
}

function normalizeCategories(list) {
  return (Array.isArray(list) ? list : [])
    .map((c) => ({ id: getCategoryId(c), name: getCategoryName(c), type: getCategoryType(c) }))
    .filter((c) => c.id && c.name);
}

function mergeUniqueById(a, b) {
  const map = new Map();
  (Array.isArray(a) ? a : []).forEach((x) => map.set(String(getCategoryId(x)), x));
  (Array.isArray(b) ? b : []).forEach((x) => map.set(String(getCategoryId(x)), x));
  return [...map.values()].sort((x, y) => getCategoryName(x).localeCompare(getCategoryName(y)));
}

function toArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

function tipoUiToApiType(tipoUi) {
  const t = String(tipoUi || '').trim().toLowerCase();
  if (['despesa', 'expense', 'saida', 'out'].includes(t)) return 'expense';
  if (['receita', 'income', 'entrada', 'in'].includes(t)) return 'income';
  return 'income';
}

function categoryMatchesTipo(category, tipoUi) {
  const type = getCategoryType(category);
  if (type === 'both') return true;
  return tipoUiToApiType(tipoUi) === type;
}

function centsToText(cents) {
  const api = window.GippoAPI;
  return api?.centsToBRL ? api.centsToBRL(cents) : fmtBRL((Number(cents) || 0) / 100);
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

function setupSidebarToggle() {
  const btn = document.getElementById('btnSidebar');
  const btnBrand = document.getElementById('btnBrand');
  const root = document.getElementById('appRoot');
  if (!root) return;

  const toggle = () => root.classList.toggle('is-collapsed');
  btn?.addEventListener('click', toggle);
  btnBrand?.addEventListener('click', toggle);
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

let dropdownsWired = false;

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
    if (dd.dataset.wired === '1') return;
    dd.dataset.wired = '1';

    const btn = dd.querySelector('.dd__btn');
    const menu = dd.querySelector('.dd__menu');
    if (!btn || !menu) return;

    const open = () => {
      closeAll(dd);
      dd.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      const opts = [...dd.querySelectorAll('.dd__opt')];
      const selected = dd.querySelector('.dd__opt.is-selected') || opts[0];
      opts.forEach((o) => o.classList.remove('is-active'));
      selected?.classList.add('is-active');
      selected?.scrollIntoView?.({ block: 'nearest' });
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

    menu.addEventListener('click', (ev) => {
      const opt = ev.target?.closest?.('.dd__opt');
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
      const opts = [...dd.querySelectorAll('.dd__opt')];
      const active = dd.querySelector('.dd__opt.is-active') || dd.querySelector('.dd__opt.is-selected') || opts[0];
      const idx = Math.max(0, opts.indexOf(active));

      if (ev.key === 'Escape') {
        ev.preventDefault();
        close();
        btn.focus();
        return;
      }

      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        const nextIdx = ev.key === 'ArrowDown' ? Math.min(opts.length - 1, idx + 1) : Math.max(0, idx - 1);
        opts.forEach((o) => o.classList.remove('is-active'));
        opts[nextIdx]?.classList.add('is-active');
        opts[nextIdx]?.scrollIntoView?.({ block: 'nearest' });
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
  });

  if (dropdownsWired) return;
  dropdownsWired = true;

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

function setUiEnabled(enabled) {
  const controls = [
    ...document.querySelectorAll('.dd__btn'),
    document.getElementById('btnCriarPendencia'),
    document.getElementById('btnExport')
  ].filter(Boolean);

  controls.forEach((el) => (el.disabled = !enabled));
}

function setModalError(msg) {
  const el = document.getElementById('pendError');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function openModal() {
  const modal = document.getElementById('pendModal');
  if (!modal) return;
  setModalError('');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('pendDescricao')?.focus(), 0);
}

function closeModal() {
  const modal = document.getElementById('pendModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  setModalError('');
}

function fillSelect(selectEl, options, { placeholder } = {}) {
  if (!selectEl) return;
  selectEl.innerHTML = '';

  if (placeholder) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.disabled = true;
    opt.selected = true;
    opt.textContent = placeholder;
    selectEl.appendChild(opt);
  }

  (Array.isArray(options) ? options : []).forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = label;
    selectEl.appendChild(opt);
  });
}

async function ensureAllCategories(state) {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const cachedBoth = normalizeCategories(readCategoriesCache('both'));
  const cachedIncome = normalizeCategories(readCategoriesCache('income'));
  const cachedExpense = normalizeCategories(readCategoriesCache('expense'));

  let both = cachedBoth;
  let income = cachedIncome;
  let expense = cachedExpense;

  if (!both.length) {
    const payload = await api.listCategories({ type: 'both' });
    both = normalizeCategories(toArrayPayload(payload));
    writeCategoriesCache('both', both);
  }
  if (!income.length) {
    const payload = await api.listCategories({ type: 'income' });
    income = normalizeCategories(toArrayPayload(payload));
    writeCategoriesCache('income', income);
  }
  if (!expense.length) {
    const payload = await api.listCategories({ type: 'expense' });
    expense = normalizeCategories(toArrayPayload(payload));
    writeCategoriesCache('expense', expense);
  }

  state.categories = mergeUniqueById(mergeUniqueById(both, income), expense);
  return state.categories;
}

function rebuildCategoryFilterDropdown(state) {
  const dd = document.getElementById('fCategoria')?.closest?.('[data-dd]');
  const menu = dd?.querySelector?.('.dd__menu');
  if (!dd || !menu) return;

  const selectedValue = String(document.getElementById('fCategoria')?.value || '');

  const cats = normalizeCategories(state.categories || []);
  const opts = [{ value: '', label: 'Todas as Categorias' }].concat(
    cats.map((c) => ({ value: String(c.id), label: c.name }))
  );

  menu.innerHTML = '';
  opts.forEach(({ value, label }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dd__opt';
    b.setAttribute('role', 'option');
    b.setAttribute('data-value', value);
    b.textContent = label;
    menu.appendChild(b);
  });

  const all = [...menu.querySelectorAll('.dd__opt')];
  const selected = all.find((b) => String(b.getAttribute('data-value') || '') === selectedValue) || all[0];
  all.forEach((b) => {
    const isSel = b === selected;
    b.classList.toggle('is-selected', isSel);
    b.setAttribute('aria-selected', isSel ? 'true' : 'false');
  });
  const text = dd.querySelector('.dd__text');
  if (text && selected) text.textContent = selected.textContent.trim();
}

function toTxArray(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.items)) return res.items;
  return [];
}

function dedupeById(items) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((x) => {
    const id = x?.id;
    if (id == null) return;
    map.set(String(id), x);
  });
  return [...map.values()];
}

function isPendingTx(tx) {
  const status = String(tx?.status || 'pending');
  if (status === 'paid' || status === 'canceled') return false;
  if (tx?.paid_at) return false;
  return status === 'pending' || status === 'overdue' || status === 'canceled' ? status !== 'canceled' : true;
}

function hydrateNames(items, state) {
  const accountById = new Map((state.accounts || []).map((a) => [String(a.id), a.name]));
  const catById = new Map((state.categories || []).map((c) => [String(c.id), c.name]));

  return (Array.isArray(items) ? items : []).map((it) => {
    const account_name = it.account_name || accountById.get(String(it.account_id)) || '';
    const category_name = it.category_name || catById.get(String(it.category_id)) || '';
    return { ...it, account_name, category_name };
  });
}

function computeTotalsCents(items) {
  const income = (Array.isArray(items) ? items : [])
    .filter((x) => x.type === 'income')
    .reduce((acc, x) => acc + (Number(x.amount_cents) || 0), 0);

  const expense = (Array.isArray(items) ? items : [])
    .filter((x) => x.type === 'expense')
    .reduce((acc, x) => acc + (Number(x.amount_cents) || 0), 0);

  return { income, expense, total: income + expense };
}

function getFilteredItems(state) {
  const tipoUi = String(document.getElementById('fTipo')?.value || '');
  const catId = String(document.getElementById('fCategoria')?.value || '');
  const typeFilter = tipoUi ? tipoUiToApiType(tipoUi) : '';

  return (Array.isArray(state.items) ? state.items : []).filter((x) => {
    if (typeFilter && String(x.type) !== typeFilter) return false;
    if (catId && String(x.category_id || '') !== catId) return false;
    return true;
  });
}

function renderSummary(items) {
  const totals = computeTotalsCents(items);
  const totalEl = document.getElementById('totalPendente');
  const incEl = document.getElementById('receitasPendentes');
  const expEl = document.getElementById('despesasPendentes');

  if (totalEl) totalEl.textContent = centsToText(totals.total);
  if (incEl) incEl.textContent = centsToText(totals.income);
  if (expEl) expEl.textContent = centsToText(totals.expense);
}

function statusPill(tx) {
  const status = String(tx?.status || 'pending');
  const due = String(tx?.due_date || '').slice(0, 10);
  const today = new Date();
  const todayIso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const isOverdue = status === 'overdue' || (status === 'pending' && due && due < todayIso);
  return isOverdue
    ? { label: 'Vencido', pillClass: 'pill' }
    : { label: 'Pendente', pillClass: 'pill pill--soft' };
}

function renderList(items) {
  const body = document.getElementById('pendListBody');
  const emptyList = document.getElementById('pendListEmpty');
  const emptyFilters = document.getElementById('pendEmpty');
  if (!body) return;

  body.querySelectorAll('.tx').forEach((n) => n.remove());

  if (!items.length) {
    if (emptyList) emptyList.style.display = 'grid';
    if (emptyFilters) emptyFilters.style.display = 'grid';
    return;
  }

  if (emptyList) emptyList.style.display = 'none';
  if (emptyFilters) emptyFilters.style.display = 'none';

  const api = window.GippoAPI;
  const frag = document.createDocumentFragment();

  items
    .slice()
    .sort((a, b) => String(a?.due_date || '').localeCompare(String(b?.due_date || '')))
    .forEach((it, idx) => {
      const row = document.createElement('div');
      row.className = 'tx';
      row.style.animationDelay = `${idx * 35}ms`;
      row.dataset.txId = String(it.id);

      const signPrefix = it.type === 'expense' ? '-' : '+';
      const moneyClass = it.type === 'expense' ? 'money--bad' : 'money--good';
      const amountText = api?.centsToBRL
        ? api.centsToBRL(Number(it.amount_cents) || 0)
        : fmtBRL((Number(it.amount_cents) || 0) / 100);
      const valueText = `${signPrefix} ${amountText}`;

      const { label: stLabel, pillClass: stClass } = statusPill(it);

      row.innerHTML = `
        <div class="tx__main">
          <div class="tx__title">${escapeHtml(it.description || '')}</div>
          <div class="tx__meta">
            <span class="pill pill--soft">${escapeHtml(it.type === 'expense' ? 'Despesa' : 'Receita')}</span>
            ${it.category_name ? `<span class="pill">${escapeHtml(it.category_name)}</span>` : ''}
            ${it.account_name ? `<span class="pill">${escapeHtml(it.account_name)}</span>` : ''}
            <span class="${stClass}">${escapeHtml(stLabel)}</span>
          </div>
        </div>
        <div class="tx__side">
          <div class="tx__value money ${moneyClass}">${valueText}</div>
          <div class="tx__date">Venc.: ${formatDate(it.due_date)}</div>
          <div class="tx__actions">
            <button class="txBtn txBtn--good" type="button" data-act="paid" aria-label="Marcar como pago"><i class="bi bi-check2-circle"></i></button>
            <button class="txBtn txBtn--bad" type="button" data-act="delete" aria-label="Excluir"><i class="bi bi-trash3"></i></button>
          </div>
        </div>
      `;

      frag.appendChild(row);
    });

  body.appendChild(frag);
}

async function refreshSaldo() {
  const api = window.GippoAPI;
  if (!api) return;
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const summary = await api.dashboardSummary({ month, year });
  const text = api?.centsToBRL ? api.centsToBRL(Number(summary?.balance_cents) || 0) : fmtBRL((Number(summary?.balance_cents) || 0) / 100);
  const saldoHeader = document.getElementById('saldoHeader');
  const saldoTotal = document.getElementById('saldoTotal');
  if (saldoHeader) saldoHeader.textContent = text;
  if (saldoTotal) saldoTotal.textContent = text;
}

async function listAllByStatus(status) {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const all = [];
  let cursor = undefined;
  const hardCap = 3000;

  while (all.length < hardCap) {
    const res = await api.listTransactions({ limit: 200, cursor, status });
    const batch = toTxArray(res);
    all.push(...batch);
    if (!res?.next_cursor || !batch.length) break;
    cursor = res.next_cursor;
  }

  return all;
}

async function loadPendingItems(state) {
  const [pendingRaw, overdueRaw] = await Promise.all([
    listAllByStatus('pending'),
    listAllByStatus('overdue')
  ]);

  const merged = dedupeById([...(pendingRaw || []), ...(overdueRaw || [])]);
  const pendingOnly = merged.filter(isPendingTx);
  state.items = hydrateNames(pendingOnly, state);
  return state.items;
}

function setModalSelectOptions(state) {
  fillSelect(
    document.getElementById('pendConta'),
    (state.accounts || []).map((a) => ({ value: a.id, label: a.name })),
    { placeholder: 'Selecione uma conta' }
  );

  const tipoUi = String(document.getElementById('pendTipo')?.value || 'Receita');
  const filtered = normalizeCategories(state.categories || [])
    .filter((c) => categoryMatchesTipo(c, tipoUi))
    .map((c) => ({ value: c.id, label: c.name }));

  fillSelect(document.getElementById('pendCategoria'), filtered, {
    placeholder: filtered.length ? 'Selecione uma categoria' : 'Nenhuma categoria'
  });
}

function exportData(items) {
  const payload = {
    generatedAt: new Date().toISOString(),
    pendencias: items
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'pendencias.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function wireModal(state, onCreated) {
  const btnOpen = document.getElementById('btnCriarPendencia');
  const modal = document.getElementById('pendModal');
  const backdrop = document.getElementById('pendBackdrop');
  const btnClose = document.getElementById('pendClose');
  const btnCancel = document.getElementById('pendCancel');
  const form = document.getElementById('pendForm');
  const submitBtn = document.getElementById('pendSubmit');

  btnOpen?.addEventListener('click', () => {
    if (!window.GippoAPI) return toast('API não carregada');
    setModalSelectOptions(state);
    const dateEl = document.getElementById('pendData');
    if (dateEl && !dateEl.value) dateEl.valueAsDate = new Date();
    openModal();
  });

  const close = () => closeModal();
  btnClose?.addEventListener('click', close);
  btnCancel?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modal && !modal.hidden) close();
  });

  document.getElementById('pendTipo')?.addEventListener('change', () => setModalSelectOptions(state));

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const api = window.GippoAPI;
    if (!api) {
      setModalError('API não carregada.');
      return;
    }

    const tipoUi = String(document.getElementById('pendTipo')?.value || 'Receita');
    const type = tipoUiToApiType(tipoUi);
    const categoryId = String(document.getElementById('pendCategoria')?.value || '');
    const accountId = String(document.getElementById('pendConta')?.value || '');
    const description = String(document.getElementById('pendDescricao')?.value || '').trim();
    const due_date = String(document.getElementById('pendData')?.value || '');
    const valorReais = parseBRL(String(document.getElementById('pendValor')?.value || ''));

    const accountIdNum = Number(accountId);
    const categoryIdNum = Number(categoryId);
    const amount_cents = api.brlToCentsFromNumber(valorReais);

    if (!description) return setModalError('Informe a descrição.');
    if (!due_date) return setModalError('Informe o vencimento.');
    if (!accountId || !Number.isFinite(accountIdNum)) return setModalError('Selecione uma conta válida.');
    if (!categoryId || !Number.isFinite(categoryIdNum)) return setModalError('Selecione uma categoria válida.');
    if (!Number.isFinite(amount_cents) || amount_cents <= 0) return setModalError('Informe um valor válido.');

    try {
      setModalError('');
      if (submitBtn) submitBtn.disabled = true;

      await api.createTransaction({
        account_id: accountIdNum,
        category_id: categoryIdNum,
        type,
        status: 'pending',
        amount_cents,
        description,
        due_date
      });

      toast('Pendência criada');
      closeModal();
      await onCreated?.();
    } catch (e) {
      const msg = e?.message || 'Erro ao criar pendência.';
      setModalError(msg);
      toast(msg);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function main() {
  injectToastStyles();
  setupAnimations();
  setupRipple();
  setupSidebarToggle();

  const api = window.GippoAPI;
  const state = { accounts: [], categories: [], items: [] };

  setUiEnabled(false);

  setupDropdowns(() => {
    const filtered = getFilteredItems(state);
    renderSummary(filtered);
    renderList(filtered);
  });

  document.getElementById('pendListBody')?.addEventListener('click', async (ev) => {
    const btn = ev.target?.closest?.('button[data-act]');
    if (!btn) return;
    if (!api) return toast('API não carregada');
    const row = btn.closest?.('.tx');
    const id = row?.dataset?.txId;
    if (!id) return;

    const act = btn.getAttribute('data-act');
    try {
      if (act === 'delete') {
        const ok = confirm('Excluir esta pendência?');
        if (!ok) return;
        await api.deleteTransaction(id);
        toast('Pendência removida');
      }

      if (act === 'paid') {
        await api.markTransactionPaid(id);
        toast('Marcado como pago');
      }

      await loadPendingItems(state);
      const filtered = getFilteredItems(state);
      renderSummary(filtered);
      renderList(filtered);
      await refreshSaldo();
    } catch (e) {
      toast(e?.message || 'Erro ao atualizar pendência');
    }
  });

  wireModal(state, async () => {
    await loadPendingItems(state);
    const filtered = getFilteredItems(state);
    renderSummary(filtered);
    renderList(filtered);
    await refreshSaldo();
  });

  document.getElementById('btnExport')?.addEventListener('click', () => {
    const filtered = getFilteredItems(state);
    exportData(filtered);
  });

  async function onAuthed() {
    setUiEnabled(true);

    const accountsPayload = await api.listAccounts();
    state.accounts = Array.isArray(accountsPayload) ? accountsPayload : toArrayPayload(accountsPayload);

    await ensureAllCategories(state);
    rebuildCategoryFilterDropdown(state);

    await loadPendingItems(state);
    const filtered = getFilteredItems(state);
    renderSummary(filtered);
    renderList(filtered);
    await refreshSaldo();
  }

  async function onLoggedOut() {
    setUiEnabled(false);
    state.accounts = [];
    state.categories = [];
    state.items = [];
    renderSummary([]);
    renderList([]);
    const saldoHeader = document.getElementById('saldoHeader');
    const saldoTotal = document.getElementById('saldoTotal');
    if (saldoHeader) saldoHeader.textContent = 'R$ 0,00';
    if (saldoTotal) saldoTotal.textContent = 'R$ 0,00';
    window.GippoAuthGate?.open?.();
  }

  window.addEventListener('gippo:auth', async (ev) => {
    const authed = Boolean(ev?.detail?.authed);
    try {
      if (authed) await onAuthed();
      else await onLoggedOut();
    } catch (e) {
      toast(e?.message || 'Erro ao carregar pendências');
    }
  });

  (async () => {
    if (!api) return;
    try {
      await api.me();
      await onAuthed();
    } catch {
      await onLoggedOut();
    }
  })();
}

main();
