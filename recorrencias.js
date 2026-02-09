const fmtBRL = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

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

function setUiEnabled(enabled) {
  const controls = [document.getElementById('btnRefresh')].filter(Boolean);
  controls.forEach((el) => (el.disabled = !enabled));
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

function centsToText(cents) {
  const api = window.GippoAPI;
  if (api?.centsToBRL) return api.centsToBRL(cents);
  return fmtBRL((Number(cents) || 0) / 100);
}

function seriesTypeLabel(type) {
  return String(type) === 'expense' ? 'Despesa' : 'Receita';
}

function moneyView(type, amountCents) {
  const signPrefix = String(type) === 'expense' ? '-' : '+';
  const moneyClass = String(type) === 'expense' ? 'money--bad' : 'money--good';
  const valueText = `${signPrefix} ${centsToText(Number(amountCents) || 0)}`;
  return { moneyClass, valueText };
}

function normalizeSeries(raw) {
  const id = raw?.id ?? raw?.series_id ?? raw?.recurring_series_id;
  return {
    id: id == null ? '' : String(id),
    user_id: raw?.user_id,
    account_id: raw?.account_id ?? raw?.base?.account_id ?? raw?.account?.id,
    account_name: raw?.account_name || '',
    category_id: raw?.category_id ?? raw?.base?.category_id ?? raw?.category?.id,
    category_name: raw?.category_name || '',
    type: raw?.type ?? raw?.base?.type,
    description: raw?.description || raw?.base?.description || '',
    amount_cents:
      raw?.amount_cents ??
      raw?.base?.amount_cents ??
      raw?.amountCents ??
      raw?.amount_in_cents ??
      raw?.amount,
    frequency: raw?.frequency || raw?.freq || 'monthly',
    interval_count: raw?.interval_count ?? raw?.intervalCount ?? raw?.every_months ?? raw?.everyMonths ?? 1,
    start_date: raw?.start_date ?? raw?.startDate ?? raw?.start,
    end_date: raw?.end_date ?? raw?.endDate ?? raw?.end ?? null,
    generated_through:
      raw?.generated_through ?? raw?.generatedThrough ?? raw?.generated_until ?? raw?.generatedUntil ?? null,
    is_active:
      (raw?.is_active ?? raw?.isActive ?? raw?.active ?? (raw?.status ? raw.status === 'active' : undefined)) !== false
  };
}

function toArrayPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.items)) return payload.items;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && Array.isArray(payload.results)) return payload.results;
  if (payload && Array.isArray(payload.rows)) return payload.rows;
  return [];
}

function getNextCursor(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return (
    payload.next_cursor ??
    payload.nextCursor ??
    payload.next ??
    payload.cursor_next ??
    payload.cursorNext ??
    payload?.pagination?.next_cursor ??
    payload?.pagination?.nextCursor ??
    null
  );
}

async function fetchAllSeries() {
  const api = window.GippoAPI;
  if (!api) throw new Error('API não carregada');

  const all = [];
  let cursor = undefined;
  const hardCap = 2000;

  while (all.length < hardCap) {
    const res = await api.listRecurringSeries({ limit: 200, cursor });
    const batch = toArrayPayload(res);
    all.push(...batch);
    const next = getNextCursor(res);
    if (!next || !batch.length) break;
    cursor = next;
  }

  return all.map(normalizeSeries).filter((s) => s.id);
}

function renderSeries(items) {
  const body = document.getElementById('seriesBody');
  const empty = document.getElementById('seriesEmpty');
  const countEl = document.getElementById('seriesCount');
  if (!body) return;

  body.querySelectorAll('.tx').forEach((n) => n.remove());

  if (countEl) countEl.textContent = items.length ? `(${items.length})` : '';

  if (!items.length) {
    if (empty) empty.style.display = 'grid';
    return;
  }

  if (empty) empty.style.display = 'none';

  const frag = document.createDocumentFragment();

  items
    .slice()
    .sort((a, b) => String(a.description || '').localeCompare(String(b.description || '')))
    .forEach((s, idx) => {
      const row = document.createElement('div');
      row.className = 'tx';
      row.style.animationDelay = `${idx * 35}ms`;
      row.dataset.seriesId = String(s.id);

      const { moneyClass, valueText } = moneyView(s.type, s.amount_cents);
      const statusPill = s.is_active
        ? { label: 'Ativa', pillClass: 'pill pill--ring' }
        : { label: 'Pausada', pillClass: 'pill pill--soft' };

      const freqLabel = s.frequency === 'monthly' ? 'Mensal' : String(s.frequency || '');
      const intervalLabel = Number(s.interval_count) > 1 ? `a cada ${s.interval_count} meses` : 'todo mês';

      row.innerHTML = `
        <div class="tx__main">
          <div class="tx__title">${escapeHtml(s.description || '(Sem descrição)')}</div>
          <div class="tx__meta">
            <span class="pill pill--soft">${escapeHtml(seriesTypeLabel(s.type))}</span>
            ${s.category_name ? `<span class="pill">${escapeHtml(s.category_name)}</span>` : ''}
            ${s.account_name ? `<span class="pill">${escapeHtml(s.account_name)}</span>` : ''}
            <span class="pill">${escapeHtml(freqLabel)} • ${escapeHtml(intervalLabel)}</span>
            <span class="${statusPill.pillClass}">${escapeHtml(statusPill.label)}</span>
            <span class="pill">Início: ${escapeHtml(formatDate(s.start_date))}</span>
            ${s.end_date ? `<span class="pill">Fim: ${escapeHtml(formatDate(s.end_date))}</span>` : '<span class="pill">Sem fim</span>'}
            ${s.generated_through ? `<span class="pill">Gerado até: ${escapeHtml(formatDate(s.generated_through))}</span>` : ''}
          </div>
        </div>
        <div class="tx__side">
          <div class="tx__value money ${moneyClass}">${valueText}</div>
          <div class="tx__date">ID série: ${escapeHtml(s.id)}</div>
          <div class="tx__actions">
            <button class="txBtn" type="button" data-act="extend" aria-label="Estender (+meses)"><i class="bi bi-calendar-plus"></i></button>
            <button class="txBtn" type="button" data-act="toggle" aria-label="Pausar/Retomar"><i class="bi bi-pause-circle"></i></button>
            <button class="txBtn txBtn--bad" type="button" data-act="cancel" aria-label="Cancelar recorrência"><i class="bi bi-slash-circle"></i></button>
          </div>
        </div>
      `;

      frag.appendChild(row);
    });

  body.appendChild(frag);
}

function findSeriesById(items, seriesId) {
  return (Array.isArray(items) ? items : []).find((s) => String(s.id) === String(seriesId)) || null;
}

async function refreshSaldo() {
  const api = window.GippoAPI;
  if (!api) return;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const summary = await api.dashboardSummary({ month, year });

  const text = api?.centsToBRL
    ? api.centsToBRL(Number(summary?.balance_cents) || 0)
    : fmtBRL((Number(summary?.balance_cents) || 0) / 100);

  const saldoHeader = document.getElementById('saldoHeader');
  const saldoTotal = document.getElementById('saldoTotal');
  if (saldoHeader) saldoHeader.textContent = text;
  if (saldoTotal) saldoTotal.textContent = text;
}

async function hydrateLookups(series) {
  const api = window.GippoAPI;
  if (!api) return series;

  const accountsPayload = await api.listAccounts();
  const accounts = Array.isArray(accountsPayload) ? accountsPayload : toArrayPayload(accountsPayload);
  const accountById = new Map(accounts.map((a) => [String(a.id), a.name]));

  // Categories: try cache first, then fetch all types (both/income/expense)
  const cats = [];
  const cacheKeys = ['both', 'income', 'expense'];
  cacheKeys.forEach((k) => {
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

  const catById = new Map(
    categories
      .map((c) => ({ id: c?.id, name: c?.name }))
      .filter((c) => c.id != null && c.name)
      .map((c) => [String(c.id), String(c.name)])
  );

  return series.map((s) => ({
    ...s,
    account_name: s.account_name || accountById.get(String(s.account_id)) || '',
    category_name: s.category_name || catById.get(String(s.category_id)) || ''
  }));
}

function main() {
  injectToastStyles();
  setupAnimations();
  setupSidebarToggle();

  const api = window.GippoAPI;
  const state = { series: [] };

  const isUnauthorizedError = (e) => {
    const status = Number(e?.status);
    return status === 401 || status === 403;
  };

  setUiEnabled(false);

  async function load() {
    if (!api) throw new Error('API não carregada');

    const raw = await fetchAllSeries();
    state.series = await hydrateLookups(raw);
    renderSeries(state.series);
    await refreshSaldo();
  }

  document.getElementById('btnRefresh')?.addEventListener('click', async () => {
    try {
      await load();
      toast('Atualizado');
    } catch (e) {
      toast(e?.message || 'Erro ao atualizar');
    }
  });

  document.getElementById('seriesBody')?.addEventListener('click', async (ev) => {
    const btn = ev.target?.closest?.('button[data-act]');
    if (!btn) return;
    if (!api) return toast('API não carregada');

    const row = btn.closest?.('.tx');
    const seriesId = row?.dataset?.seriesId;
    if (!seriesId) return;

    const act = btn.getAttribute('data-act');
    const series = findSeriesById(state.series, seriesId);

    try {
      if (act === 'extend') {
        const rawMonths = prompt('Gerar próximos quantos meses?', '12');
        if (rawMonths == null) return;
        const months_ahead = Math.min(120, Math.max(1, Math.trunc(Number(rawMonths)) || 12));
        const res = await api.extendRecurringSeries(seriesId, { months_ahead });
        const created = Number(res?.created) || 0;
        toast(created ? `Estendida (+${created})` : 'Estendida');
        await load();
      }

      if (act === 'toggle') {
        const nextActive = !(series?.is_active !== false);
        await api.patchRecurringSeries(seriesId, { is_active: nextActive });
        toast(nextActive ? 'Recorrência retomada' : 'Recorrência pausada');
        await load();
      }

      if (act === 'cancel') {
        const ok = confirm('Cancelar esta recorrência?');
        if (!ok) return;
        const cancelFuture = confirm('Também marcar ocorrências futuras como canceladas?');
        await api.patchRecurringSeries(seriesId, { is_active: false, cancel_future: cancelFuture });
        toast('Recorrência cancelada');
        await load();
      }
    } catch (e) {
      toast(e?.message || 'Erro ao atualizar recorrência');
    }
  });

  async function onAuthed() {
    setUiEnabled(true);
    await load();
  }

  async function onLoggedOut({ promptLogin = true } = {}) {
    setUiEnabled(false);
    state.series = [];
    renderSeries([]);
    const saldoHeader = document.getElementById('saldoHeader');
    const saldoTotal = document.getElementById('saldoTotal');
    if (saldoHeader) saldoHeader.textContent = 'R$ 0,00';
    if (saldoTotal) saldoTotal.textContent = 'R$ 0,00';
    if (promptLogin) window.GippoAuthGate?.open?.();
  }

  window.addEventListener('gippo:auth', async (ev) => {
    const authed = Boolean(ev?.detail?.authed);
    try {
      if (authed) await onAuthed();
      else await onLoggedOut();
    } catch (e) {
      toast(e?.message || 'Erro ao carregar recorrências');
    }
  });

  (async () => {
    if (!api) return;
    try {
      await api.me();
      await onAuthed();
    } catch (e) {
      if (isUnauthorizedError(e)) {
        await onLoggedOut({ promptLogin: true });
      } else {
        await onLoggedOut({ promptLogin: false });
        toast(e?.message || 'API indisponível');
      }
    }
  })();
}

main();
