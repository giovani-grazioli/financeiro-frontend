(function () {
  const DEFAULT_API_BASE = 'https://financeiro-backend-580167451147.southamerica-east1.run.app/v1';
  const API_BASE_KEY = 'gippo:apiBase';
  const AUTH_KEY = 'gippo:auth';

  class ApiError extends Error {
    constructor(message, { status, payload, url } = {}) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.payload = payload;
      this.url = url;
    }
  }

  function normalizeBase(url) {
    if (!url) return DEFAULT_API_BASE;
    return String(url).trim().replace(/\/+$/, '');
  }

  function getApiBase() {
    const fromWindow = typeof window.__API_BASE_URL === 'string' ? window.__API_BASE_URL : '';
    const fromStorage = localStorage.getItem(API_BASE_KEY) || '';
    return normalizeBase(fromWindow || fromStorage || DEFAULT_API_BASE);
  }

  function setApiBase(url) {
    localStorage.setItem(API_BASE_KEY, normalizeBase(url));
  }

  function readAuth() {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return { access_token: '', refresh_token: '' };
      const parsed = JSON.parse(raw);
      return {
        access_token: String(parsed?.access_token || ''),
        refresh_token: String(parsed?.refresh_token || '')
      };
    } catch {
      return { access_token: '', refresh_token: '' };
    }
  }

  function writeAuth(tokens) {
    const next = {
      access_token: String(tokens?.access_token || ''),
      refresh_token: String(tokens?.refresh_token || '')
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(next));
    return next;
  }

  function clearAuth() {
    localStorage.removeItem(AUTH_KEY);
    try {
      window.dispatchEvent(new CustomEvent('gippo:auth', { detail: { authed: false, reason: 'auth_cleared' } }));
    } catch {
      // ignore
    }
  }

  // Prevent refresh-token race conditions when multiple requests hit 401 at once.
  // Without this, one request can rotate the refresh token and the other refresh attempt fails,
  // causing an unwanted logout + auth modal even though the session is still valid.
  let refreshInFlight = null;

  async function readResponsePayload(res) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return await res.json();
      } catch {
        return null;
      }
    }

    try {
      const text = await res.text();
      return text || null;
    } catch {
      return null;
    }
  }

  function getErrorMessage(payload, fallback) {
    if (!payload) return fallback;
    if (typeof payload === 'string') return payload;
    if (payload?.error?.message) return String(payload.error.message);
    if (payload?.detail) {
      if (typeof payload.detail === 'string') return payload.detail;
      return fallback;
    }
    return fallback;
  }

  async function request(path, options = {}) {
    const {
      method = 'GET',
      query,
      body,
      headers,
      auth = true,
      timeoutMs = 15000,
      _retry = false
    } = options;

    const base = getApiBase();
    const url = new URL(base + path);

    if (query && typeof query === 'object') {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null || v === '') continue;
        url.searchParams.set(k, String(v));
      }
    }

    const h = new Headers(headers || {});

    let payloadBody = undefined;
    if (body !== undefined) {
      if (body instanceof FormData) {
        payloadBody = body;
      } else {
        h.set('Content-Type', 'application/json');
        payloadBody = JSON.stringify(body);
      }
    }

    if (auth) {
      const { access_token } = readAuth();
      if (access_token) h.set('Authorization', `Bearer ${access_token}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url.toString(), {
        method,
        headers: h,
        body: payloadBody,
        signal: controller.signal,
        credentials: 'omit'
      });

      // Attempt token refresh once on 401
      if (res.status === 401 && auth && !_retry) {
        const { refresh_token } = readAuth();
        if (refresh_token) {
          try {
            await refreshToken();
            return await request(path, { ...options, _retry: true });
          } catch (e) {
            // Only clear auth if refresh definitively says we're unauthorized.
            // Network/timeouts should not log the user out.
            const status = Number(e?.status);
            if (status === 401 || status === 403) clearAuth();
            throw e;
          }
        }
      }

      const payload = await readResponsePayload(res);

      if (!res.ok) {
        const msg = getErrorMessage(payload, `Erro HTTP ${res.status}`);
        throw new ApiError(msg, { status: res.status, payload, url: url.toString() });
      }

      return payload;
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new ApiError('Tempo esgotado ao conectar na API', { status: 0, payload: null, url: url.toString() });
      }
      if (err instanceof ApiError) throw err;
      throw new ApiError('Falha ao conectar na API', { status: 0, payload: String(err?.message || err), url: url.toString() });
    } finally {
      clearTimeout(timeout);
    }
  }

  async function login(email, password) {
    const payload = await request('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
      timeoutMs: 20000
    });

    const tokens = writeAuth(payload);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new ApiError('Login retornou tokens inválidos', { status: 0, payload });
    }

    return tokens;
  }

  async function refreshToken() {
    if (refreshInFlight) return await refreshInFlight;

    refreshInFlight = (async () => {
      const { refresh_token } = readAuth();
      if (!refresh_token) throw new ApiError('Sem refresh token', { status: 401 });

      const payload = await request('/auth/refresh', {
        method: 'POST',
        auth: false,
        body: { refresh_token }
      });

      const tokens = writeAuth(payload);
      if (!tokens.access_token || !tokens.refresh_token) {
        clearAuth();
        throw new ApiError('Refresh retornou tokens inválidos', { status: 401, payload });
      }

      return tokens;
    })();

    try {
      return await refreshInFlight;
    } finally {
      refreshInFlight = null;
    }
  }

  async function logout() {
    const { refresh_token } = readAuth();
    try {
      if (refresh_token) {
        await request('/auth/logout', {
          method: 'POST',
          auth: false,
          body: { refresh_token }
        });
      }
    } finally {
      clearAuth();
    }
  }

  async function me() {
    return await request('/me', { method: 'GET', auth: true });
  }

  async function listAccounts() {
    return await request('/accounts', { method: 'GET', auth: true });
  }

  async function listCategories({ type } = {}) {
    return await request('/categories', { method: 'GET', auth: true, query: type ? { type } : undefined });
  }

  async function createCategory({ name, type }) {
    return await request('/categories', {
      method: 'POST',
      auth: true,
      body: { name, type }
    });
  }

  async function createAccount({ name, initial_balance_cents }) {
    return await request('/accounts', {
      method: 'POST',
      auth: true,
      body: { name, initial_balance_cents }
    });
  }

  async function updateAccount(id, patch) {
    return await request(`/accounts/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      auth: true,
      body: patch
    });
  }

  async function deleteAccount(id) {
    return await request(`/accounts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      auth: true
    });
  }

  async function listTransactions(query = {}) {
    return await request('/transactions', { method: 'GET', auth: true, query });
  }

  async function createTransaction(body) {
    return await request('/transactions', { method: 'POST', auth: true, body });
  }

  async function createRecurringSeries({ base, frequency, interval_count, start_date, end_date, months_ahead }) {
    return await request('/transactions/recurring-series', {
      method: 'POST',
      auth: true,
      body: { base, frequency, interval_count, start_date, end_date: end_date ?? null, months_ahead }
    });
  }

  async function listRecurringSeries(query = {}) {
    return await request('/transactions/recurring-series', { method: 'GET', auth: true, query });
  }

  async function extendRecurringSeries(seriesId, { months_ahead } = {}) {
    return await request(`/transactions/recurring-series/${encodeURIComponent(seriesId)}/extend`, {
      method: 'POST',
      auth: true,
      body: { months_ahead }
    });
  }

  async function patchRecurringSeries(seriesId, { is_active, cancel_future } = {}) {
    return await request(`/transactions/recurring-series/${encodeURIComponent(seriesId)}`, {
      method: 'PATCH',
      auth: true,
      body: { is_active, cancel_future }
    });
  }

  async function patchTransaction(id, patch) {
    return await request(`/transactions/${encodeURIComponent(id)}`, { method: 'PATCH', auth: true, body: patch });
  }

  async function deleteTransaction(id) {
    return await request(`/transactions/${encodeURIComponent(id)}`, { method: 'DELETE', auth: true });
  }

  async function markTransactionPaid(id, paid_at) {
    return await request(`/transactions/${encodeURIComponent(id)}/mark-paid`, {
      method: 'POST',
      auth: true,
      body: paid_at ? { paid_at } : {}
    });
  }

  async function markTransactionPending(id) {
    return await request(`/transactions/${encodeURIComponent(id)}/mark-pending`, { method: 'POST', auth: true });
  }

  async function dashboardSummary({ month, year } = {}) {
    return await request('/dashboard/summary', { method: 'GET', auth: true, query: { month, year } });
  }

  function centsToBRL(cents) {
    const n = Number(cents) || 0;
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n / 100);
  }

  function brlToCentsFromNumber(valueReais) {
    const n = Number(valueReais);
    if (!Number.isFinite(n)) return NaN;
    return Math.round(n * 100);
  }

  window.GippoAPI = {
    ApiError,
    getApiBase,
    setApiBase,
    readAuth,
    clearAuth,
    request,
    login,
    refreshToken,
    logout,
    me,
    listAccounts,
    listCategories,
    createCategory,
    createAccount,
    updateAccount,
    deleteAccount,
    listTransactions,
    createTransaction,
    createRecurringSeries,
    listRecurringSeries,
    extendRecurringSeries,
    patchRecurringSeries,
    patchTransaction,
    deleteTransaction,
    markTransactionPaid,
    markTransactionPending,
    dashboardSummary,
    centsToBRL,
    brlToCentsFromNumber
  };
})();
