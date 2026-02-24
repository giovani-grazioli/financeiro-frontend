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

const RECENT_PAGE_SIZE = 10;

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
  const style = document.createElement('style');
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
  const rippleTargets = [document.getElementById('btnExport'), document.getElementById('btnAdicionar')].filter(Boolean);

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

function setupSidebarToggle() {
  const btn = document.getElementById('btnSidebar');
  const btnBrand = document.getElementById('btnBrand');
  const root = document.getElementById('appRoot');
  if (!root) return;

  const toggle = () => root.classList.toggle('is-collapsed');
  btn?.addEventListener('click', toggle);
  btnBrand?.addEventListener('click', toggle);
}

function setUiEnabled(enabled) {
  const form = document.getElementById('formLancamento');
  const controls = [
    document.getElementById('tipo'),
    document.getElementById('categoria'),
    document.getElementById('btnAddCategoria'),
    document.getElementById('descricao'),
    document.getElementById('valor'),
    document.getElementById('data'),
    document.getElementById('conta'),
    document.getElementById('recorrente'),
    document.getElementById('btnAdicionar'),
    document.getElementById('btnExport'),
    document.getElementById('recentSearch'),
    document.getElementById('recentPrev'),
    document.getElementById('recentNext')
  ].filter(Boolean);

  if (form) form.style.opacity = enabled ? '1' : '.65';
  controls.forEach((el) => (el.disabled = !enabled));

  // Recurrence fields depend on checkbox state too.
  const recOn = Boolean(document.getElementById('recorrente')?.checked);
  [document.getElementById('recInterval'), document.getElementById('recMonthsAhead'), document.getElementById('recEndDate')]
    .filter(Boolean)
    .forEach((el) => (el.disabled = !enabled || !recOn));
}

function clampInt(n, { min = 1, max = 120 } = {}) {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}

function renderSaldoFromCents(balanceCents) {
  const api = window.GippoAPI;
  const text = api?.centsToBRL ? api.centsToBRL(balanceCents) : fmtBRL((Number(balanceCents) || 0) / 100);
  const saldoHeader = document.getElementById('saldoHeader');
  const saldoTotal = document.getElementById('saldoTotal');
  if (saldoHeader) saldoHeader.textContent = text;
  if (saldoTotal) saldoTotal.textContent = text;
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

  options.forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = String(value);
    opt.textContent = label;
    selectEl.appendChild(opt);
  });
}

function renderCategorySelect(state, tipoUi) {
  const filtered = normalizeCategories(state.categories || [])
    .filter((c) => categoryMatchesTipo(c, tipoUi))
    .map((c) => ({ value: getCategoryId(c), label: getCategoryName(c) }));

  const placeholder = filtered.length
    ? 'Selecione uma categoria'
    : 'Nenhuma categoria (clique em Adicionar)';

  fillSelect(document.getElementById('categoria'), filtered, { placeholder });
  return filtered.length;
}

function toArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  return [];
}

function getNextCursor(payload) {
  if (!payload || Array.isArray(payload)) return null;
  const next = payload.next_cursor ?? payload.nextCursor ?? payload.next ?? null;
  return next === undefined ? null : next;
}

function dueTime(it) {
  const raw = it?.due_date || it?.created_at || 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
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
    .map((c) => ({
      id: getCategoryId(c),
      name: getCategoryName(c),
      type: getCategoryType(c)
    }))
    .filter((c) => c.id && c.name);
}

function mergeUniqueById(a, b) {
  const map = new Map();
  (Array.isArray(a) ? a : []).forEach((x) => map.set(String(getCategoryId(x)), x));
  (Array.isArray(b) ? b : []).forEach((x) => map.set(String(getCategoryId(x)), x));
  return [...map.values()].sort((x, y) => getCategoryName(x).localeCompare(getCategoryName(y)));
}

function tipoUiToApiType(tipoUi) {
  const t = String(tipoUi || '').trim().toLowerCase();
  if (['despesa', 'expense', 'saida', 'out'].includes(t)) return 'expense';
  if (['receita', 'income', 'entrada', 'in'].includes(t)) return 'income';
  return 'income';
}

async function ensureCategoriesForTipo(state, tipoUi) {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const selectedType = tipoUiToApiType(tipoUi);

  const cachedSelected = normalizeCategories(readCategoriesCache(selectedType));
  const cachedBoth = normalizeCategories(readCategoriesCache('both'));

  let selected = cachedSelected;
  let both = cachedBoth;

  if (!both.length) {
    const payload = await api.listCategories({ type: 'both' });
    both = normalizeCategories(toArrayPayload(payload));
    writeCategoriesCache('both', both);
  }

  if (!selected.length) {
    const payload = await api.listCategories({ type: selectedType });
    selected = normalizeCategories(toArrayPayload(payload));
    writeCategoriesCache(selectedType, selected);
  }

  state.categories = mergeUniqueById(both, selected);
  return state.categories;
}

function categoryMatchesTipo(category, tipoUi) {
  const type = getCategoryType(category);
  if (type === 'both') return true;
  return tipoUiToApiType(tipoUi) === type;
}

function getStatusView(status) {
  const s = String(status || 'pending');
  if (s === 'paid') return { label: 'Pago', pillClass: 'pill pill--ring' };
  if (s === 'overdue') return { label: 'Vencido', pillClass: 'pill' };
  if (s === 'canceled') return { label: 'Cancelado', pillClass: 'pill pill--soft' };
  return { label: 'Pendente', pillClass: 'pill pill--soft' };
}

function setEditTxError(msg) {
  const el = document.getElementById('editTxError');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function normalizeRecurringSeriesId(value) {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (!s || s === '0' || s === 'null' || s === 'undefined') return '';
  return s;
}

function renderRecent(items) {
  const body = document.getElementById('recentBody');
  const empty = document.getElementById('emptyState');
  if (!body) return;

  if (!items.length) {
    if (empty) empty.style.display = 'grid';
    body.querySelectorAll('.tx').forEach((n) => n.remove());
    return;
  }

  if (empty) empty.style.display = 'none';
  body.querySelectorAll('.tx').forEach((n) => n.remove());

  const api = window.GippoAPI;
  const frag = document.createDocumentFragment();

  items.forEach((it, idx) => {
    const row = document.createElement('div');
    row.className = 'tx';
    row.style.animationDelay = `${idx * 45}ms`;
    row.dataset.txId = String(it.id);
    const seriesId = normalizeRecurringSeriesId(it.recurring_series_id);
    const hasSeries = Boolean(seriesId);
    if (hasSeries) row.dataset.seriesId = seriesId;

    const signPrefix = it.type === 'expense' ? '-' : '+';
    const moneyClass = it.type === 'expense' ? 'money--bad' : 'money--good';
    const amountText = api?.centsToBRL ? api.centsToBRL(Number(it.amount_cents) || 0) : fmtBRL((Number(it.amount_cents) || 0) / 100);
    const valueText = `${signPrefix} ${amountText}`;

    const { label: statusLabel, pillClass: statusPillClass } = getStatusView(it.status);

    row.innerHTML = `
      <div class="tx__main">
        <div class="tx__title">${escapeHtml(it.description || '')}</div>
        <div class="tx__meta">
          <span class="pill pill--soft">${escapeHtml(it.type === 'expense' ? 'Despesa' : 'Receita')}</span>
          ${it.category_name ? `<span class="pill">${escapeHtml(it.category_name)}</span>` : ''}
          ${it.account_name ? `<span class="pill">${escapeHtml(it.account_name)}</span>` : ''}
          ${hasSeries ? `<span class="pill pill--ring">Recorrente</span>` : ''}
          <span class="${statusPillClass}">${escapeHtml(statusLabel)}</span>
        </div>
      </div>
      <div class="tx__side">
        <div class="tx__value money ${moneyClass}">${valueText}</div>
        <div class="tx__date">${formatDate(it.due_date)}</div>
        <div class="tx__actions">
          <button class="txBtn" type="button" data-act="edit" aria-label="Editar lançamento"><i class="bi bi-pencil-square"></i></button>
          ${it.status !== 'paid' ? '<button class="txBtn txBtn--good" type="button" data-act="paid" aria-label="Marcar como pago"><i class="bi bi-check2-circle"></i></button>' : '<button class="txBtn" type="button" data-act="pending" aria-label="Marcar como pendente"><i class="bi bi-arrow-counterclockwise"></i></button>'}
          ${hasSeries ? '<button class="txBtn" type="button" data-act="extend-series" aria-label="Estender recorrência (+12 meses)"><i class="bi bi-calendar-plus"></i></button>' : ''}
          ${hasSeries ? '<button class="txBtn" type="button" data-act="cancel-series" aria-label="Cancelar recorrência"><i class="bi bi-slash-circle"></i></button>' : ''}
          <button class="txBtn txBtn--bad" type="button" data-act="delete" aria-label="Excluir"><i class="bi bi-trash3"></i></button>
        </div>
      </div>
    `;

    frag.appendChild(row);
  });

  body.appendChild(frag);
}

function renderRecentPager(view, itemsCount) {
  const pager = document.getElementById('recentPager');
  const info = document.getElementById('recentPagerInfo');
  const prevBtn = document.getElementById('recentPrev');
  const nextBtn = document.getElementById('recentNext');

  if (!pager || !info || !prevBtn || !nextBtn) return;

  const pageIndex = Number(view?.pageIndex) || 0;
  const hasPrev = pageIndex > 0;
  const hasNext = view?.nextCursor != null;

  pager.hidden = !(hasPrev || hasNext);
  prevBtn.disabled = !hasPrev || Boolean(view?.loading);
  nextBtn.disabled = !hasNext || Boolean(view?.loading);
  info.textContent = itemsCount ? `Página ${pageIndex + 1}` : '';
}

function exportData(items) {
  const payload = {
    generatedAt: new Date().toISOString(),
    lancamentos: items
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'lancamentos.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function refreshSaldo() {
  const api = window.GippoAPI;
  if (!api) return;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const summary = await api.dashboardSummary({ month, year });
  renderSaldoFromCents(Number(summary?.balance_cents) || 0);
}

async function loadLookups(state) {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const accountsPayload = await api.listAccounts();
  state.accounts = Array.isArray(accountsPayload) ? accountsPayload : toArrayPayload(accountsPayload);

  // Categories: prefer cache to avoid hitting DB every load
  const tipoEl = document.getElementById('tipo');
  const tipoUi = String(tipoEl?.value || 'Receita');
  await ensureCategoriesForTipo(state, tipoUi);

  fillSelect(
    document.getElementById('conta'),
    state.accounts.map((a) => ({ value: a.id, label: a.name })),
    { placeholder: 'Selecione uma conta' }
  );

  const count = renderCategorySelect(state, tipoUi);
  if (!count) toast('Nenhuma categoria encontrada. Clique em “Adicionar” para criar a primeira.');
}

function setCategoryModalError(msg) {
  const el = document.getElementById('categoriaError');
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = msg;
}

function openCategoryModal() {
  const modal = document.getElementById('categoriaModal');
  if (!modal) return;
  setCategoryModalError('');

  // Default type based on current launch type
  const tipoUi = String(document.getElementById('tipo')?.value || 'Receita');
  const typeSelect = document.getElementById('categoriaTipo');
  if (typeSelect) typeSelect.value = tipoUiToApiType(tipoUi);

  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('categoriaNome')?.focus(), 0);
}

function closeCategoryModal() {
  const modal = document.getElementById('categoriaModal');
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
  setCategoryModalError('');
}

function wireCategoryModal(state) {
  const api = window.GippoAPI;

  const btnOpen = document.getElementById('btnAddCategoria');
  const modal = document.getElementById('categoriaModal');
  const backdrop = document.getElementById('categoriaBackdrop');
  const btnClose = document.getElementById('categoriaClose');
  const btnCancel = document.getElementById('categoriaCancel');
  const form = document.getElementById('categoriaForm');
  const submitBtn = document.getElementById('categoriaSubmit');

  btnOpen?.addEventListener('click', () => {
    if (!api) return toast('API não carregada');
    openCategoryModal();
  });

  const close = () => closeCategoryModal();
  btnClose?.addEventListener('click', close);
  btnCancel?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && modal && !modal.hidden) close();
  });

  form?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!api) {
      setCategoryModalError('API não carregada.');
      return;
    }

    const name = String(document.getElementById('categoriaNome')?.value || '').trim();
    const type = String(document.getElementById('categoriaTipo')?.value || 'both');
    if (!name) {
      setCategoryModalError('Informe um nome.');
      return;
    }

    try {
      setCategoryModalError('');
      if (submitBtn) submitBtn.disabled = true;

      const createdRaw = await api.createCategory({ name, type });
      const created = normalizeCategories([createdRaw])[0] || null;
      toast('Categoria criada');
      closeCategoryModal();

      // Update cache/state without refetching (refetch only if API didn't return a usable object)
      if (created?.id) {
        const createdType = getCategoryType(created);
        if (createdType === 'both') {
          const bothExisting = normalizeCategories(readCategoriesCache('both'));
          const bothNext = mergeUniqueById(bothExisting, [created]);
          writeCategoriesCache('both', bothNext);
        } else {
          const typedExisting = normalizeCategories(readCategoriesCache(createdType));
          const typedNext = mergeUniqueById(typedExisting, [created]);
          writeCategoriesCache(createdType, typedNext);
        }
      } else {
        const [bothPayload, incomePayload, expensePayload] = await Promise.all([
          api.listCategories({ type: 'both' }),
          api.listCategories({ type: 'income' }),
          api.listCategories({ type: 'expense' })
        ]);
        writeCategoriesCache('both', normalizeCategories(toArrayPayload(bothPayload)));
        writeCategoriesCache('income', normalizeCategories(toArrayPayload(incomePayload)));
        writeCategoriesCache('expense', normalizeCategories(toArrayPayload(expensePayload)));
      }

      const tipoUi = String(document.getElementById('tipo')?.value || 'Receita');
      await ensureCategoriesForTipo(state, tipoUi);

      renderCategorySelect(state, tipoUi);

      if (created?.id) {
        const catSelect = document.getElementById('categoria');
        if (catSelect) catSelect.value = String(created.id);
      }
    } catch (e) {
      const msg = e?.message || 'Erro ao criar categoria.';
      setCategoryModalError(msg);
      toast(msg);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function hydrateNames(items, state) {
  const accountById = new Map((state.accounts || []).map((a) => [String(a.id), a.name]));
  const catById = new Map((state.categories || []).map((c) => [String(c.id), c.name]));

  return items.map((it) => {
    const account_name = it.account_name || accountById.get(String(it.account_id)) || '';
    const category_name = it.category_name || catById.get(String(it.category_id)) || '';
    return { ...it, account_name, category_name };
  });
}

async function loadRecentPage(state, view) {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const cursor = view?.cursors?.[view.pageIndex] ?? null;
  const q = String(view?.q || '').trim();

  const res = await api.listTransactions({
    limit: RECENT_PAGE_SIZE,
    cursor: cursor == null ? undefined : cursor,
    q: q ? q : undefined
  });

  const list = Array.isArray(res?.items) ? res.items : [];

  // "Por ordem": mais recente primeiro (pela due_date).
  list.sort((a, b) => {
    const db = dueTime(b);
    const da = dueTime(a);
    if (db !== da) return db - da;
    return Number(b?.id || 0) - Number(a?.id || 0);
  });

  const hydrated = hydrateNames(list, state);

  const next = getNextCursor(res);
  view.nextCursor = next;
  view.cursors[view.pageIndex + 1] = next;

  return hydrated;
}

async function exportAllTransactions() {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const all = [];
  let cursor = undefined;
  const hardCap = 5000;

  while (all.length < hardCap) {
    const res = await api.listTransactions({ limit: 200, cursor });
    const batch = Array.isArray(res?.items) ? res.items : [];
    all.push(...batch);
    const next = getNextCursor(res);
    if (next == null || !batch.length) break;
    cursor = next;
  }

  return all;
}

function setupRecentEditor({ getItems, onSaved }) {
  const modal = document.getElementById('editTxModal');
  const backdrop = document.getElementById('editTxBackdrop');
  const btnClose = document.getElementById('editTxClose');
  const btnCancel = document.getElementById('editTxCancel');
  const form = document.getElementById('editTxForm');
  const submitBtn = document.getElementById('editTxSubmit');
  const recentBody = document.getElementById('recentBody');

  if (!modal || !form || !recentBody) return;

  let editingTxId = null;

  const close = () => {
    modal.hidden = true;
    document.body.style.overflow = '';
    editingTxId = null;
    setEditTxError('');
  };

  const findById = (id) => {
    const items = Array.isArray(getItems?.()) ? getItems() : [];
    return items.find((it) => String(it?.id) === String(id)) || null;
  };

  const open = (tx) => {
    const descriptionEl = document.getElementById('editTxDescription');
    const amountEl = document.getElementById('editTxAmount');
    const dateEl = document.getElementById('editTxDate');
    const statusEl = document.getElementById('editTxStatus');
    if (!descriptionEl || !amountEl || !dateEl || !statusEl) return;

    editingTxId = String(tx.id);
    descriptionEl.value = String(tx.description || '');
    amountEl.value = (Number(tx.amount_cents || 0) / 100).toFixed(2).replace('.', ',');
    dateEl.value = String(tx.due_date || '').slice(0, 10);
    statusEl.value = String(tx.status || 'pending');

    setEditTxError('');
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

  recentBody.addEventListener('click', (ev) => {
    const btn = ev.target?.closest?.('button[data-act="edit"]');
    if (!btn) return;
    const row = btn.closest('.tx');
    const txId = row?.dataset?.txId;
    if (!txId) return;
    const tx = findById(txId);
    if (!tx) return;
    open(tx);
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const api = window.GippoAPI;
    if (!api) {
      setEditTxError('API não carregada.');
      return;
    }
    if (!editingTxId) {
      setEditTxError('Lançamento não identificado.');
      return;
    }

    const currentTx = findById(editingTxId);
    if (!currentTx) {
      setEditTxError('Lançamento não encontrado.');
      return;
    }

    const description = String(document.getElementById('editTxDescription')?.value || '').trim();
    const amountReais = parseBRL(String(document.getElementById('editTxAmount')?.value || ''));
    const due_date = String(document.getElementById('editTxDate')?.value || '').trim();
    const status = String(document.getElementById('editTxStatus')?.value || 'pending');
    const amount_cents = api.brlToCentsFromNumber(amountReais);

    if (!description) {
      setEditTxError('Informe a descrição.');
      return;
    }
    if (!due_date) {
      setEditTxError('Informe a data.');
      return;
    }
    if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
      setEditTxError('Informe um valor válido.');
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
      if (submitBtn) submitBtn.disabled = true;
      setEditTxError('');
      await api.patchTransaction(editingTxId, patch);
      close();
      toast('Lançamento atualizado');
      await onSaved?.();
    } catch (e) {
      setEditTxError(e?.message || 'Erro ao atualizar lançamento.');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function setupForm(state, onCreated) {
  const api = window.GippoAPI;
  const form = document.getElementById('formLancamento');
  if (!form) return;

  const dateInput = document.getElementById('data');
  if (dateInput && !dateInput.value) {
    const now = new Date();
    const iso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    dateInput.value = iso;
  }

  const valorInput = document.getElementById('valor');
  valorInput?.addEventListener('blur', () => {
    const n = parseBRL(valorInput.value);
    if (!Number.isFinite(n)) return;
    valorInput.value = (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
  });

  const tipoEl = document.getElementById('tipo');
  tipoEl?.addEventListener('change', async () => {
    const tipoUi = String(tipoEl.value || 'Receita');
    try {
      await ensureCategoriesForTipo(state, tipoUi);

      renderCategorySelect(state, tipoUi);
    } catch (e) {
      toast(e?.message || 'Erro ao carregar categorias');
      fillSelect(document.getElementById('categoria'), [], { placeholder: 'Sem categorias' });
    }
  });

  const recEl = document.getElementById('recorrente');
  const recFields = document.getElementById('recorrenciaFields');
  const recEndWrap = document.getElementById('recEndWrap');
  const recIntervalEl = document.getElementById('recInterval');
  const recMonthsEl = document.getElementById('recMonthsAhead');
  const recEndDateEl = document.getElementById('recEndDate');

  const syncRecUi = () => {
    const on = Boolean(recEl?.checked);
    if (recFields) recFields.hidden = !on;
    if (recEndWrap) recEndWrap.hidden = !on;

    const globallyEnabled = !(recEl?.disabled);
    if (recIntervalEl) recIntervalEl.disabled = !globallyEnabled || !on;
    if (recMonthsEl) recMonthsEl.disabled = !globallyEnabled || !on;
    if (recEndDateEl) recEndDateEl.disabled = !globallyEnabled || !on;

    if (on) {
      if (recIntervalEl && !recIntervalEl.value) recIntervalEl.value = '1';
      if (recMonthsEl && !recMonthsEl.value) recMonthsEl.value = '12';
    }
  };

  recEl?.addEventListener('change', syncRecUi);
  syncRecUi();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!api) return toast('API não carregada');

    const tipoUi = String(document.getElementById('tipo')?.value || 'Receita');
    const categoryId = String(document.getElementById('categoria')?.value || '');
    const accountId = String(document.getElementById('conta')?.value || '');
    const description = String(document.getElementById('descricao')?.value || '').trim();
    const due_date = String(document.getElementById('data')?.value || '');
    const valorReais = parseBRL(String(document.getElementById('valor')?.value || ''));
    const recorrente = Boolean(document.getElementById('recorrente')?.checked);

    const type = tipoUi === 'Despesa' ? 'expense' : 'income';
    const amount_cents = api.brlToCentsFromNumber(valorReais);

    const accountIdNum = Number(accountId);
    const categoryIdNum = Number(categoryId);

    if (!description) return toast('Informe a descrição');
    if (!due_date) return toast('Informe a data');
    if (!accountId || !Number.isFinite(accountIdNum)) return toast('Selecione uma conta válida');
    if (!categoryId || !Number.isFinite(categoryIdNum)) return toast('Selecione uma categoria válida');
    if (!Number.isFinite(amount_cents) || amount_cents <= 0) return toast('Informe um valor válido');

    const btn = document.getElementById('btnAdicionar');
    if (btn) btn.disabled = true;

    try {
      if (recorrente) {
        const interval_count = clampInt(recIntervalEl?.value, { min: 1, max: 60 });
        const months_ahead = clampInt(recMonthsEl?.value, { min: 1, max: 120 });
        const end_date_raw = String(recEndDateEl?.value || '').trim();
        const end_date = end_date_raw ? end_date_raw : null;

        const res = await api.createRecurringSeries({
          base: {
            account_id: accountIdNum,
            category_id: categoryIdNum,
            type,
            status: 'pending',
            amount_cents,
            description
          },
          frequency: 'monthly',
          interval_count,
          start_date: due_date,
          end_date,
          months_ahead
        });

        const created = Number(res?.created) || 0;
        toast(created ? `Recorrência criada: ${created} lançamentos` : 'Recorrência criada');
      } else {
        await api.createTransaction({
          account_id: accountIdNum,
          category_id: categoryIdNum,
          type,
          status: 'paid',
          amount_cents,
          description,
          due_date,
          paid_at: new Date().toISOString()
        });
        toast('Lançamento adicionado');
      }

      form.reset();
      if (dateInput) dateInput.valueAsDate = new Date();
      syncRecUi();
      tipoEl?.dispatchEvent(new Event('change'));
      await onCreated?.();
    } catch (e) {
      toast(e?.message || 'Erro ao criar lançamento');
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}

function main() {
  injectToastStyles();
  setupAnimations();
  setupRipple();
  setupSidebarToggle();

  const api = window.GippoAPI;
  const state = { accounts: [], categories: [] };
  let recentItems = [];
  const recentView = { q: '', pageIndex: 0, cursors: [null], nextCursor: null, loading: false };

  setupRecentEditor({
    getItems: () => recentItems,
    onSaved: async () => {
      await loadAndRenderRecent();
      await refreshSaldo();
    }
  });

  function resetRecentView() {
    recentView.pageIndex = 0;
    recentView.cursors = [null];
    recentView.nextCursor = null;
  }

  async function loadAndRenderRecent() {
    recentView.loading = true;
    renderRecentPager(recentView, recentItems.length);
    try {
      recentItems = await loadRecentPage(state, recentView);
      renderRecent(recentItems);
    } finally {
      recentView.loading = false;
      renderRecentPager(recentView, recentItems.length);
    }
  }

  setUiEnabled(false);

  const dateEl = document.getElementById('data');
  if (dateEl && !dateEl.value) dateEl.valueAsDate = new Date();

  const recentBody = document.getElementById('recentBody');
  recentBody?.addEventListener('click', async (ev) => {
    const btn = ev.target?.closest?.('button[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const row = btn.closest?.('.tx');
    const id = row?.dataset?.txId;
    const seriesId = row?.dataset?.seriesId;
    if (!id) return;
    if (!api) return toast('API não carregada');

    try {
      if (act === 'delete') {
        const ok = confirm('Excluir este lançamento?');
        if (!ok) return;
        await api.deleteTransaction(id);
        toast('Lançamento removido');
      }

      if (act === 'edit') {
        return;
      }

      if (act === 'paid') {
        await api.markTransactionPaid(id);
        toast('Marcado como pago');
      }

      if (act === 'pending') {
        await api.markTransactionPending(id);
        toast('Marcado como pendente');
      }

      if (act === 'extend-series') {
        if (!seriesId) return toast('Série não identificada');
        const res = await api.extendRecurringSeries(seriesId, { months_ahead: 12 });
        const created = Number(res?.created) || 0;
        toast(created ? `Recorrência estendida (+${created})` : 'Recorrência estendida');
      }

      if (act === 'cancel-series') {
        if (!seriesId) return toast('Série não identificada');
        const ok = confirm('Cancelar a recorrência desta assinatura?');
        if (!ok) return;
        const cancelFuture = confirm('Também marcar ocorrências futuras como canceladas?');
        await api.patchRecurringSeries(seriesId, { is_active: false, cancel_future: cancelFuture });
        toast('Recorrência cancelada');
      }

      // If we deleted the last item of a page, step back one page.
      if (act === 'delete' && recentItems.length <= 1 && recentView.pageIndex > 0) {
        recentView.pageIndex -= 1;
      }

      await loadAndRenderRecent();
      await refreshSaldo();
    } catch (e) {
      toast(e?.message || 'Erro ao atualizar lançamento');
    }
  });

  // Search + pagination
  const searchEl = document.getElementById('recentSearch');
  let searchTimer = null;
  searchEl?.addEventListener('input', () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(async () => {
      recentView.q = String(searchEl.value || '').trim();
      resetRecentView();
      try {
        await loadAndRenderRecent();
      } catch (e) {
        toast(e?.message || 'Erro ao pesquisar');
      }
    }, 320);
  });

  document.getElementById('recentPrev')?.addEventListener('click', async () => {
    if (recentView.loading) return;
    if (recentView.pageIndex <= 0) return;
    recentView.pageIndex -= 1;
    try {
      await loadAndRenderRecent();
    } catch (e) {
      toast(e?.message || 'Erro ao paginar');
    }
  });

  document.getElementById('recentNext')?.addEventListener('click', async () => {
    if (recentView.loading) return;
    if (recentView.nextCursor == null) return;
    recentView.pageIndex += 1;
    try {
      await loadAndRenderRecent();
    } catch (e) {
      toast(e?.message || 'Erro ao paginar');
    }
  });

  setupForm(state, async () => {
    resetRecentView();
    await loadAndRenderRecent();
    await refreshSaldo();
  });

  wireCategoryModal(state);

  document.getElementById('btnExport')?.addEventListener('click', async () => {
    if (!api) return toast('API não carregada');
    try {
      const all = await exportAllTransactions();
      exportData(all);
    } catch (e) {
      toast(e?.message || 'Erro ao exportar');
    }
  });

  async function onAuthed() {
    setUiEnabled(true);
    await loadLookups(state);
    resetRecentView();
    await loadAndRenderRecent();
    await refreshSaldo();
  }

  async function onLoggedOut() {
    setUiEnabled(false);
    recentItems = [];
    renderRecent(recentItems);
    renderRecentPager(recentView, 0);
    renderSaldoFromCents(0);
    window.GippoAuthGate?.open?.();
  }

  window.addEventListener('gippo:auth', async (ev) => {
    const authed = Boolean(ev?.detail?.authed);
    try {
      if (authed) await onAuthed();
      else await onLoggedOut();
    } catch (e) {
      toast(e?.message || 'Erro ao carregar dados');
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
