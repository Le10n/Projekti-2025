const STORAGE_KEYS = {
  accountId: 'fintracker.v1.accountId',
  transactions: 'fintracker.v1.transactions',
  settings: 'fintracker.v1.settings'
};

const DEFAULT_FILTERS = {
  text: '',
  type: 'all',
  category: '',
  accountId: '',
  minCents: null,
  maxCents: null,
  from: '',
  to: '',
  sort: 'date-desc',
  affectChart: false
};

const DEFAULT_EXCHANGE_RATES = {
  USD: 1.08,
  HRK: 7.5345
};

const MAX_LOG_ENTRIES = 1000;

const DEFAULT_SETTINGS = {
  lastMonth: '',
  budgets: {},
  darkMode: false,
  autoDarkMode: false,
  weeklyBackup: false,
  lastBackupAt: '',
  pinHash: '',
  accounts: [],
  defaultAccountId: '',
  filters: { ...DEFAULT_FILTERS },
  goals: [],
  recurring: [],
  log: [],
  exchangeRates: { ...DEFAULT_EXCHANGE_RATES },
  pdfStyle: 'modern',
  recurringApplied: {}
};

function normalizeBudgetConfig(config) {
  if (typeof config === 'number') {
    const value = Number(config);
    return { limitCents: Number.isFinite(value) ? Math.round(value) : 0, active: true };
  }
  if (config && typeof config === 'object') {
    const raw = Number(config.limitCents);
    const limit = Number.isFinite(raw) ? Math.round(raw) : 0;
    return { limitCents: limit, active: config.active !== false };
  }
  return { limitCents: 0, active: false };
}

const state = {
  transactions: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  selectedMonth: '',
  historyDate: '',
  chartMode: 'expense',
  categoryChart: null,
  trendChart: null,
  compareChart: null,
  editingId: null,
  calendarMonth: '',
  fullViewActive: false,
  budgetWarnings: new Map(),
  recurringPromptOpen: false
};

const CenterNoDataPlugin = {
  id: 'centerNoData',
  beforeDraw(chart, args, options) {
    const dataset = chart.data?.datasets?.[0];
    const total = dataset ? dataset.data.reduce((acc, val) => acc + (+val || 0), 0) : 0;
    if (total > 0) return;
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    const { left, right, top, bottom, width, height } = chartArea;
    ctx.save();
    ctx.clearRect(left, top, width, height);
    ctx.font = `600 ${Math.max(16, Math.min(28, width / 18))}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const message = options?.message || 'Nema podataka za odabrani mjesec i tip.';
    ctx.fillText(message, (left + right) / 2, (top + bottom) / 2, width * 0.9);
    ctx.restore();
  }
};

function getLogList() {
  if (!Array.isArray(state.settings.log)) {
    state.settings.log = [];
  }
  return state.settings.log;
}

function addLog(type, meta = {}) {
  const entry = { id: uuid(), ts: nowISO(), type, meta: meta || {} };
  const log = getLogList();
  log.push(entry);
  if (log.length > MAX_LOG_ENTRIES) {
    log.splice(0, log.length - MAX_LOG_ENTRIES);
  }
  state.settings.log = log;
  saveSettings(state.settings);
}

function clearLog() {
  state.settings.log = [];
  saveSettings(state.settings);
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const sum = arr => arr.reduce((a, b) => a + b, 0);

function formatCurrencyHR(cents) {
  return new Intl.NumberFormat('hr-HR', { style: 'currency', currency: 'EUR' }).format((cents || 0) / 100);
}

function parseAmountToCents(value) {
  if (typeof value !== 'string') value = String(value ?? '').trim();
  value = value.replace(/\s/g, '').replace(',', '.');
  if (!value) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function nowISO() {
  return new Date().toISOString();
}

function ensureAccountId() {
  let id = localStorage.getItem(STORAGE_KEYS.accountId);
  if (!id) {
    id = uuid();
    localStorage.setItem(STORAGE_KEYS.accountId, id);
  }
  return id;
}

function loadTransactions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.transactions);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Greška pri čitanju transakcija', err);
    return [];
  }
}

function saveTransactions(list) {
  localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(list));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    const parsed = raw ? JSON.parse(raw) : {};
    const settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      filters: { ...structuredClone(DEFAULT_FILTERS), ...(parsed?.filters || {}) }
    };
    let migrated = false;
    if (settings.budgets && typeof settings.budgets === 'object' && !Array.isArray(settings.budgets)) {
      const normalizedBudgets = {};
      for (const [category, cfg] of Object.entries(settings.budgets)) {
        const normalized = normalizeBudgetConfig(cfg);
        normalizedBudgets[category] = normalized;
        if (
          typeof cfg !== 'object' ||
          cfg === null ||
          cfg.limitCents !== normalized.limitCents ||
          (cfg.active ?? true) !== normalized.active
        ) {
          migrated = true;
        }
      }
      settings.budgets = normalizedBudgets;
    } else {
      settings.budgets = {};
    }
    if (migrated) {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    }
    return settings;
  } catch (err) {
    console.error('Greška pri čitanju postavki', err);
    return structuredClone(DEFAULT_SETTINGS);
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function ensureDefaultAccount(settings) {
  if (!Array.isArray(settings.accounts) || settings.accounts.length === 0) {
    const defaultAccount = { id: uuid(), name: 'Glavni račun', currency: 'EUR', order: 0, hidden: false };
    settings.accounts = [defaultAccount];
    settings.defaultAccountId = defaultAccount.id;
  }
  if (!settings.defaultAccountId || !settings.accounts.some(acc => acc.id === settings.defaultAccountId)) {
    settings.defaultAccountId = settings.accounts[0].id;
  }
}

function applyDarkMode(enabled) {
  document.documentElement.classList.toggle('dark', Boolean(enabled));
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function setPIN(newPin) {
  const normalized = newPin.trim();
  state.settings.pinHash = await sha256(normalized);
  saveSettings(state.settings);
  alert('PIN postavljen!');
}

function clearPIN() {
  state.settings.pinHash = '';
  saveSettings(state.settings);
  alert('PIN uklonjen.');
}

async function verifyPIN(pinInput) {
  if (!state.settings.pinHash) return true;
  const entered = await sha256(pinInput.trim());
  return entered === state.settings.pinHash;
}

async function requirePINOnStartup() {
  if (!state.settings.pinHash) return;
  const modal = document.getElementById('pinModal');
  const input = document.getElementById('pinInput');
  const confirmBtn = document.getElementById('pinConfirm');
  const cancelBtn = document.getElementById('pinCancel');
  const title = document.getElementById('pinTitle');
  if (!modal || !input || !confirmBtn || !cancelBtn || !title) return;

  title.textContent = 'Unesi PIN za otključavanje';
  cancelBtn.style.display = '';
  openModal('#pinModal');
  input.value = '';
  input.focus();

  await new Promise(resolve => {
    const cleanup = () => {
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      input.onkeydown = null;
    };
    const attemptUnlock = async () => {
      const ok = await verifyPIN(input.value);
      if (ok) {
        cleanup();
        closeModal('#pinModal');
        input.value = '';
        resolve(true);
      } else {
        alert('Pogrešan PIN!');
        input.select();
      }
    };
    confirmBtn.onclick = attemptUnlock;
    input.onkeydown = event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        attemptUnlock();
      }
    };
    cancelBtn.onclick = () => {
      cleanup();
      alert('Aplikacija zaključana. Osvježi da pokušaš ponovno.');
      location.reload();
    };
  });
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.dataset.type = type;
  toast.classList.remove('show');
  toast.hidden = false;
  void toast.offsetWidth;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

function showBanner(message, tone = 'info', { persist = false, kind = null } = {}) {
  const stack = document.getElementById('bannerStack');
  if (!stack) return;
  if (kind) {
    stack.querySelectorAll(`[data-kind="${kind}"]`).forEach(el => el.remove());
  }
  const banner = document.createElement('div');
  banner.className = `banner banner-${tone}`;
  banner.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
  if (kind) banner.dataset.kind = kind;
  const span = document.createElement('span');
  span.textContent = message;
  banner.appendChild(span);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'banner-close';
  closeBtn.setAttribute('aria-label', 'Zatvori upozorenje');
  closeBtn.textContent = '✕';
  closeBtn.addEventListener('click', () => banner.remove());
  banner.appendChild(closeBtn);
  stack.appendChild(banner);
  if (!persist) {
    setTimeout(() => banner.remove(), 6000);
  }
}

function isTransfer(tx) {
  return tx.type === 'transfer' || (tx.category || '').trim().toLowerCase() === 'transfer';
}

function normalizeCategory(name) {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function isDuplicateTransaction(candidate, list = state.transactions) {
  return list.some(tx => tx.date === candidate.date && tx.type === candidate.type && tx.amountCents === candidate.amountCents && (tx.title || '').trim().toLowerCase() === candidate.title.trim().toLowerCase());
}

function filterByMonth(txs, yyyyMm) {
  if (!yyyyMm) return [];
  return txs.filter(tx => tx.date?.startsWith(yyyyMm));
}

function sumByType(txs, type) {
  return txs
    .filter(tx => tx.type === type && !isTransfer(tx))
    .reduce((acc, tx) => acc + (tx.amountCents || 0), 0);
}

function splitEntries(tx) {
  if (Array.isArray(tx.splits) && tx.splits.length > 0) {
    return tx.splits.map(split => ({ category: normalizeCategory(split.category), amountCents: split.amountCents || 0 }));
  }
  return [{ category: normalizeCategory(tx.category), amountCents: tx.amountCents || 0 }];
}
function groupByCategory(txs, type) {
  const map = new Map();
  txs.forEach(tx => {
    if (isTransfer(tx)) return;
    if (tx.type !== type) return;
    splitEntries(tx).forEach(entry => {
      if (!entry.category) return;
      const prev = map.get(entry.category) || 0;
      map.set(entry.category, prev + entry.amountCents);
    });
  });
  return map;
}

function getDaysInMonth(yyyyMm) {
  const [yearStr, monthStr] = yyyyMm.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(year, month - 1, 1);
  const days = [];
  while (date.getMonth() === month - 1) {
    days.push(date.toISOString().slice(0, 10));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function buildTrendData(txs, yyyyMm) {
  const days = getDaysInMonth(yyyyMm);
  const incomeDaily = new Map();
  const expenseDaily = new Map();
  days.forEach(day => {
    incomeDaily.set(day, 0);
    expenseDaily.set(day, 0);
  });
  txs.forEach(tx => {
    if (!days.includes(tx.date)) return;
    if (isTransfer(tx)) return;
    if (tx.type === 'income') {
      incomeDaily.set(tx.date, (incomeDaily.get(tx.date) || 0) + (tx.amountCents || 0));
    } else if (tx.type === 'expense') {
      expenseDaily.set(tx.date, (expenseDaily.get(tx.date) || 0) + (tx.amountCents || 0));
    }
  });
  const incomes = days.map(day => incomeDaily.get(day) || 0);
  const expenses = days.map(day => expenseDaily.get(day) || 0);
  const balance = [];
  let running = 0;
  days.forEach((day, index) => {
    running += (incomeDaily.get(day) || 0) - (expenseDaily.get(day) || 0);
    balance[index] = running;
  });
  return { days, incomes, expenses, balance };
}

function getActiveFilters() {
  return { ...DEFAULT_FILTERS, ...state.settings.filters };
}

function applyFilters(list) {
  const filters = getActiveFilters();
  let filtered = list.slice();
  if (filters.text) {
    const needle = filters.text.toLowerCase();
    filtered = filtered.filter(tx =>
      (tx.title || '').toLowerCase().includes(needle) ||
      (tx.category || '').toLowerCase().includes(needle) ||
      (tx.note || '').toLowerCase().includes(needle)
    );
  }
  if (filters.type !== 'all') {
    filtered = filtered.filter(tx => tx.type === filters.type);
  }
  if (filters.category) {
    filtered = filtered.filter(tx => splitEntries(tx).some(entry => entry.category.toLowerCase().includes(filters.category.toLowerCase())));
  }
  if (filters.accountId) {
    filtered = filtered.filter(tx => tx.accountId === filters.accountId);
  }
  if (filters.from) {
    filtered = filtered.filter(tx => tx.date >= filters.from);
  }
  if (filters.to) {
    filtered = filtered.filter(tx => tx.date <= filters.to);
  }
  if (filters.minCents != null) {
    filtered = filtered.filter(tx => tx.amountCents >= filters.minCents);
  }
  if (filters.maxCents != null) {
    filtered = filtered.filter(tx => tx.amountCents <= filters.maxCents);
  }
  filtered.sort((a, b) => {
    switch (filters.sort) {
      case 'date-asc':
        return a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '');
      case 'amount-desc':
        return (b.amountCents || 0) - (a.amountCents || 0);
      case 'amount-asc':
        return (a.amountCents || 0) - (b.amountCents || 0);
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date) || (b.time || '').localeCompare(a.time || '');
    }
  });
  return filtered;
}

function getMonthlyTransactions(applyFilterToChart = false) {
  const monthTxs = filterByMonth(state.transactions, state.selectedMonth);
  if (!applyFilterToChart) return monthTxs;
  return applyFilters(monthTxs);
}

function setSelectedMonth(yyyyMm) {
  state.selectedMonth = yyyyMm;
  state.settings.lastMonth = yyyyMm;
  state.budgetWarnings.clear();
  const picker = document.getElementById('monthPicker');
  if (picker && picker.value !== yyyyMm) picker.value = yyyyMm;
  const bannerStack = document.getElementById('bannerStack');
  if (bannerStack) bannerStack.innerHTML = '';
  saveSettings(state.settings);
}

function setHistoryDate(dateStr) {
  state.historyDate = dateStr;
  const historyDateInput = document.getElementById('historyDate');
  historyDateInput.value = dateStr;
  document.getElementById('historyDateLabel').textContent = formatDateLabel(dateStr);
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00');
  return date.toLocaleDateString('hr-HR');
}
function renderKPIs() {
  const monthTxs = getMonthlyTransactions(false);
  const sumIncomes = sumByType(monthTxs, 'income');
  const sumExpenses = sumByType(monthTxs, 'expense');
  const balance = sumIncomes - sumExpenses;
  document.getElementById('sumIncomes').textContent = formatCurrencyHR(sumIncomes);
  document.getElementById('sumExpenses').textContent = formatCurrencyHR(sumExpenses);
  const balanceEl = document.getElementById('sumBalance');
  balanceEl.textContent = formatCurrencyHR(balance);
  const card = document.getElementById('card-balance');
  card.dataset.state = balance >= 0 ? 'positive' : 'negative';
}

function renderCategoryChart() {
  const filters = getActiveFilters();
  const applyFilter = Boolean(filters.affectChart);
  const monthTxs = getMonthlyTransactions(applyFilter);
  if (state.chartMode === 'trend') {
    renderTrendChart(monthTxs);
    toggleChartView('trend');
    return;
  }
  toggleChartView('doughnut');
  const type = state.chartMode === 'expense' ? 'expense' : 'income';
  const grouping = groupByCategory(monthTxs, type);
  const labels = Array.from(grouping.keys());
  const centsValues = Array.from(grouping.values());
  const canvas = document.getElementById('categoryChart');
  const ctx = canvas.getContext('2d');
  if (state.categoryChart) {
    state.categoryChart.destroy();
    state.categoryChart = null;
  }
  const total = sum(centsValues);
  state.categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: centsValues,
        borderWidth: 1,
        hoverOffset: 8
      }]
    },
    options: {
      parsing: false,
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 450,
        animateRotate: true,
        animateScale: false,
        easing: 'easeOutQuart'
      },
      plugins: {
        title: {
          display: true,
          text: type === 'expense' ? 'Troškovi po kategorijama' : 'Prihodi po kategorijama'
        },
        tooltip: {
          enabled: total > 0,
          callbacks: {
            label(ctx) {
              const label = ctx.label || '';
              const cents = ctx.parsed || 0;
              const pct = total ? ((cents / total) * 100) : 0;
              return `${label}: ${formatCurrencyHR(cents)} (${pct.toFixed(1)}%)`;
            }
          }
        },
        legend: { position: 'right' },
        centerNoData: { message: 'Nema podataka za odabrani mjesec i tip.' }
      },
      layout: { padding: 8 },
      onHover: (evt, elements) => {
        canvas.classList.toggle('is-hot', elements.length > 0);
      }
    },
    plugins: [CenterNoDataPlugin]
  });
  state.categoryChart.update();
}

function toggleChartView(view) {
  document.querySelectorAll('.chart-canvas').forEach(el => {
    el.hidden = el.dataset.view !== view;
  });
}

function renderTrendChart(monthTxs) {
  const filters = getActiveFilters();
  const baseTxs = filters.affectChart ? applyFilters(monthTxs) : monthTxs;
  const { days, incomes, expenses, balance } = buildTrendData(baseTxs, state.selectedMonth);
  const ctx = document.getElementById('trendChart').getContext('2d');
  if (state.trendChart) {
    state.trendChart.destroy();
    state.trendChart = null;
  }
  state.trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days.map(day => new Date(day + 'T00:00').toLocaleDateString('hr-HR')),
      datasets: [
        {
          label: 'Prihodi',
          data: incomes.map(v => v / 100),
          borderColor: '#16a34a',
          backgroundColor: 'rgba(22,163,74,0.1)',
          tension: 0.25,
          fill: false
        },
        {
          label: 'Troškovi',
          data: expenses.map(v => v / 100),
          borderColor: '#dc2626',
          backgroundColor: 'rgba(220,38,38,0.1)',
          tension: 0.25,
          fill: false
        },
        {
          label: 'Saldo',
          data: balance.map(v => v / 100),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.15)',
          tension: 0.2,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        y: {
          ticks: {
            callback: value => formatCurrencyHR(Number(value) * 100)
          }
        },
        y1: {
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: {
            callback: value => formatCurrencyHR(Number(value) * 100)
          }
        }
      },
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label(ctx) {
              const value = ctx.parsed.y;
              return `${ctx.dataset.label}: ${formatCurrencyHR(Math.round(value * 100))}`;
            }
          }
        }
      }
    }
  });
}

function renderHistoryDay() {
  const tbody = document.querySelector('#txTable tbody');
  tbody.innerHTML = '';
  const monthTxs = getMonthlyTransactions(false);
  const dayTxs = applyFilters(monthTxs).filter(tx => tx.date === state.historyDate);
  if (dayTxs.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'table-empty';
    cell.textContent = 'Nema transakcija za odabrani dan.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }
  const accountsMap = new Map(state.settings.accounts.map(acc => [acc.id, acc]));
  dayTxs.forEach(tx => {
    const row = document.createElement('tr');
    const typeCell = document.createElement('td');
    let pillClass = 'pill neutral';
    let pillText = 'Transfer';
    let pillIcon = '↔';
    if (tx.type === 'income') {
      pillClass = 'pill income';
      pillText = 'Prihod';
      pillIcon = '▲';
    } else if (tx.type === 'expense') {
      pillClass = 'pill expense';
      pillText = 'Trošak';
      pillIcon = '▼';
    }
    typeCell.innerHTML = `<span class="${pillClass}" title="${pillText}">${pillIcon} ${pillText}</span>`;
    row.appendChild(typeCell);

    const titleCell = document.createElement('td');
    titleCell.textContent = tx.title || '';
    row.appendChild(titleCell);

    const categoryCell = document.createElement('td');
    const splits = splitEntries(tx);
    if (splits.length > 1) {
      categoryCell.innerHTML = `${normalizeCategory(tx.category)} <span class="split-icon" title="Razdijeljeno">⚑</span>`;
      categoryCell.title = splits.map(s => `${s.category}: ${formatCurrencyHR(s.amountCents)}`).join('\n');
    } else {
      categoryCell.textContent = splits[0]?.category || '';
    }
    row.appendChild(categoryCell);

    const accountCell = document.createElement('td');
    const acc = accountsMap.get(tx.accountId);
    accountCell.textContent = acc ? acc.name : '—';
    row.appendChild(accountCell);

    const amountCell = document.createElement('td');
    amountCell.className = 'align-right';
    const sign = tx.type === 'expense' ? '-' : '';
    amountCell.textContent = `${sign}${formatCurrencyHR(tx.amountCents)}`;
    if (isTransfer(tx)) {
      const span = document.createElement('span');
      span.className = 'transfer-indicator';
      span.textContent = ' (transfer)';
      amountCell.appendChild(span);
    }
    row.appendChild(amountCell);

    const timeCell = document.createElement('td');
    timeCell.textContent = tx.time || '';
    row.appendChild(timeCell);

    const noteCell = document.createElement('td');
    noteCell.textContent = tx.note || '';
    row.appendChild(noteCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = 'table-actions';
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.textContent = 'Uredi';
    editBtn.addEventListener('click', () => openEditModal(tx.id));
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Obriši';
    deleteBtn.addEventListener('click', () => deleteTransaction(tx.id));
    actionsCell.append(editBtn, deleteBtn);
    row.appendChild(actionsCell);

    tbody.appendChild(row);
  });
}
function renderAccountsSelects() {
  const txAccount = document.getElementById('txAccount');
  const editTxAccount = document.getElementById('editTxAccount');
  const filterAccount = document.getElementById('filterAccount');
  const recurringAccount = document.getElementById('recurringAccount');
  const transferFrom = document.getElementById('transferFrom');
  const transferTo = document.getElementById('transferTo');

  const options = state.settings.accounts
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  function fill(select, includeBlank = false) {
    if (!select) return;
    select.innerHTML = '';
    if (includeBlank) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Svi računi';
      select.appendChild(opt);
    }
    options.forEach(acc => {
      if (select === txAccount || select === editTxAccount || select === recurringAccount || select === transferFrom || select === transferTo) {
        if (acc.hidden) return;
      }
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = acc.name;
      select.appendChild(opt);
    });
  }

  fill(txAccount);
  fill(editTxAccount);
  fill(filterAccount, true);
  fill(recurringAccount);
  fill(transferFrom);
  fill(transferTo);

  if (txAccount && state.settings.defaultAccountId) {
    txAccount.value = state.settings.defaultAccountId;
  }
  if (filterAccount) {
    filterAccount.value = getActiveFilters().accountId || '';
  }
}

function handleTxFormSubmit(event) {
  event.preventDefault();
  const tx = collectTransactionForm();
  if (!tx) return;
  if (isDuplicateTransaction(tx)) {
    const proceed = confirm('Ova transakcija možda već postoji. Želiš li je svejedno spremiti?');
    if (!proceed) return;
  }
  addTransaction(tx);
  showToast('Transakcija dodana', 'success');
  event.target.reset();
  document.getElementById('splitRows').innerHTML = '';
  document.getElementById('splitEditor').hidden = true;
  document.getElementById('txAccount').value = state.settings.defaultAccountId;
  renderHistoryDay();
  focusTitleField();
}

function collectTransactionForm() {
  const type = document.getElementById('txType').value;
  const title = document.getElementById('txTitle').value.trim();
  const category = normalizeCategory(document.getElementById('txCategory').value);
  const accountId = document.getElementById('txAccount').value;
  const amountCents = parseAmountToCents(document.getElementById('txAmount').value);
  const date = document.getElementById('txDate').value;
  const time = document.getElementById('txTime').value;
  const note = document.getElementById('txNote').value.trim();

  clearErrors();
  let valid = true;
  if (!type) { setError('txType', 'Odaberite tip.'); valid = false; }
  if (!title) { setError('txTitle', 'Unesite naziv.'); valid = false; }
  if (!category) { setError('txCategory', 'Unesite kategoriju.'); valid = false; }
  if (!accountId) { setError('txAccount', 'Odaberite račun.'); valid = false; }
  if (!amountCents || amountCents <= 0) { setError('txAmount', 'Unesite iznos veći od 0.'); valid = false; }
  if (!date) { setError('txDate', 'Odaberite datum.'); valid = false; }

  const splits = collectSplitRows('splitRows');
  if (splits && splits.length > 0) {
    const splitTotal = sum(splits.map(s => s.amountCents));
    if (splitTotal !== amountCents) {
      setError('splits', 'Zbroj podjela mora odgovarati ukupnom iznosu.');
      valid = false;
    }
  }

  if (!valid) return null;

  return {
    id: uuid(),
    type,
    title,
    category,
    accountId,
    amountCents,
    date,
    time: time || '',
    note,
    splits,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    recurringId: null
  };
}

function collectSplitRows(containerId) {
  const container = document.getElementById(containerId);
  if (!container || container.children.length === 0) return [];
  const rows = Array.from(container.querySelectorAll('.split-row'));
  const splits = [];
  rows.forEach(row => {
    const categoryInput = row.querySelector('input[name="splitCategory"]').value;
    const amountInput = row.querySelector('input[name="splitAmount"]').value;
    const cents = parseAmountToCents(amountInput);
    if (!categoryInput || !cents || cents <= 0) return;
    splits.push({ category: normalizeCategory(categoryInput), amountCents: cents });
  });
  return splits;
}

function setError(fieldId, message) {
  const errorEl = document.querySelector(`.error[data-error-for="${fieldId}"]`);
  if (errorEl) errorEl.textContent = message;
}

function clearErrors() {
  document.querySelectorAll('.error').forEach(el => (el.textContent = ''));
}

function addTransaction(tx) {
  state.transactions.push(tx);
  saveTransactions(state.transactions);
  addLog('ADD', { txId: tx.id, type: tx.type });
  afterDataChange(tx.date);
}

function afterDataChange(preferredDate) {
  renderKPIs();
  renderCategoryChart();
  if (preferredDate) {
    setHistoryDate(preferredDate);
  }
  renderHistoryDay();
  renderBudgets();
  warnIfBudgetHit();
}

function openEditModal(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  state.editingId = id;
  document.getElementById('editTxType').value = tx.type;
  document.getElementById('editTxTitleInput').value = tx.title;
  document.getElementById('editTxCategory').value = tx.category;
  document.getElementById('editTxAccount').value = tx.accountId;
  document.getElementById('editTxAmount').value = (tx.amountCents / 100).toFixed(2);
  document.getElementById('editTxDate').value = tx.date;
  document.getElementById('editTxTime').value = tx.time || '';
  document.getElementById('editTxNote').value = tx.note || '';

  const splitContainer = document.getElementById('editSplitRows');
  splitContainer.innerHTML = '';
  if (Array.isArray(tx.splits) && tx.splits.length > 0) {
    tx.splits.forEach(split => addSplitRow('editSplitRows', split.category, (split.amountCents / 100).toFixed(2)));
    document.getElementById('editSplitEditor').hidden = false;
  } else {
    document.getElementById('editSplitEditor').hidden = true;
  }

  openModal('#editTxModal');
}

function deleteTransaction(id) {
  if (!confirm('Sigurno obrisati?')) return;
  state.transactions = state.transactions.filter(tx => tx.id !== id);
  saveTransactions(state.transactions);
  addLog('DELETE', { txId: id });
  afterDataChange(state.historyDate);
  showToast('Transakcija obrisana', 'info');
}

function handleEditSubmit(event) {
  event.preventDefault();
  if (!state.editingId) return;
  const tx = state.transactions.find(t => t.id === state.editingId);
  if (!tx) return;
  clearErrors();
  const type = document.getElementById('editTxType').value;
  const title = document.getElementById('editTxTitleInput').value.trim();
  const category = normalizeCategory(document.getElementById('editTxCategory').value);
  const accountId = document.getElementById('editTxAccount').value;
  const amountCents = parseAmountToCents(document.getElementById('editTxAmount').value);
  const date = document.getElementById('editTxDate').value;
  const time = document.getElementById('editTxTime').value;
  const note = document.getElementById('editTxNote').value.trim();

  let valid = true;
  if (!type) { setError('editTxType', 'Odaberite tip.'); valid = false; }
  if (!title) { setError('editTxTitleInput', 'Unesite naziv.'); valid = false; }
  if (!category) { setError('editTxCategory', 'Unesite kategoriju.'); valid = false; }
  if (!accountId) { setError('editTxAccount', 'Odaberite račun.'); valid = false; }
  if (!amountCents || amountCents <= 0) { setError('editTxAmount', 'Unesite iznos veći od 0.'); valid = false; }
  if (!date) { setError('editTxDate', 'Odaberite datum.'); valid = false; }
  const splits = collectSplitRows('editSplitRows');
  if (splits && splits.length > 0) {
    const splitTotal = sum(splits.map(s => s.amountCents));
    if (splitTotal !== amountCents) {
      setError('editSplits', 'Zbroj podjela mora odgovarati iznosu.');
      valid = false;
    }
  }
  if (!valid) return;

  Object.assign(tx, {
    type,
    title,
    category,
    accountId,
    amountCents,
    date,
    time: time || '',
    note,
    splits,
    updatedAt: nowISO()
  });
  saveTransactions(state.transactions);
  addLog('UPDATE', { txId: tx.id });
  closeModal('#editTxModal');
  afterDataChange(date);
  showToast('Transakcija ažurirana', 'success');
}

function addSplitRow(containerId, category = '', amount = '') {
  const container = document.getElementById(containerId);
  const row = document.createElement('div');
  row.className = 'split-row';
  row.innerHTML = `
    <input name="splitCategory" type="text" placeholder="Kategorija" value="${category}">
    <input name="splitAmount" type="number" step="0.01" placeholder="Iznos" value="${amount}">
    <button type="button" class="btn btn-secondary">✕</button>
  `;
  row.querySelector('button').addEventListener('click', () => row.remove());
  container.appendChild(row);
}
function openModal(selector) {
  const modal = document.querySelector(selector);
  if (!modal) return;
  modal.hidden = false;
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
}

function closeModal(selector) {
  const modal = document.querySelector(selector);
  if (!modal) return;
  modal.style.display = 'none';
  modal.hidden = true;
  document.body.classList.remove('modal-open');
}

function openDrawer(selector) {
  const drawer = document.querySelector(selector);
  if (!drawer) return;
  drawer.hidden = false;
  drawer.style.display = 'flex';
  document.body.classList.add('modal-open');
}

function closeDrawer(selector) {
  const drawer = document.querySelector(selector);
  if (!drawer) return;
  drawer.style.display = 'none';
  drawer.hidden = true;
  document.body.classList.remove('modal-open');
}

function renderBudgets() {
  const container = document.getElementById('budgetsList');
  if (!container) return;
  if (!container.dataset.bound) {
    container.addEventListener('click', onBudgetListClick);
    container.addEventListener('change', onBudgetListChange);
    container.dataset.bound = 'true';
  }
  container.innerHTML = '';
  const monthTxs = getMonthlyTransactions(false);
  const usage = calcBudgetUsage(monthTxs);
  if (usage.length === 0) {
    const info = document.createElement('p');
    info.className = 'muted';
    info.textContent = 'Nema definiranih budžeta.';
    container.appendChild(info);
    return;
  }
  usage.forEach(item => {
    const div = document.createElement('div');
    div.className = 'budget-item budget-row';
    if (!item.active) div.classList.add('inactive');
    const pct = item.limitCents > 0 ? Math.min(100, Math.round((item.spentCents / item.limitCents) * 100)) : 0;
    const limitLabel = item.limitCents > 0
      ? `Potrošeno: ${formatCurrencyHR(item.spentCents)} / ${formatCurrencyHR(item.limitCents)}`
      : `Potrošeno: ${formatCurrencyHR(item.spentCents)} (bez limita)`;
    div.innerHTML = `
      <div class="budget-row-header">
        <div class="budget-row-info">
          <span class="cat">${item.category}</span>
          <span class="limit">${limitLabel}</span>
        </div>
        <div class="budget-row-actions">
          <label class="budget-toggle">
            <input type="checkbox" data-action="toggle" data-cat="${item.category}" ${item.active ? 'checked' : ''}>
            Aktivno
          </label>
          <button type="button" class="btn btn-secondary" data-action="delete" data-cat="${item.category}">Izbriši</button>
        </div>
      </div>
      <div class="budget-row-progress">
        <div class="progress-bar"><span style="width:${pct}%"></span></div>
        <div class="summary">${item.limitCents > 0 ? `${pct}% budžeta` : 'Bez limita'}</div>
      </div>
    `;
    if (item.active && item.limitCents > 0) {
      if (item.spentCents >= item.limitCents) {
        const badge = document.createElement('span');
        badge.className = 'badge danger';
        badge.textContent = 'Prekoračen budžet';
        div.appendChild(badge);
      } else if (item.spentCents >= item.limitCents * 0.8) {
        const badge = document.createElement('span');
        badge.className = 'badge warn';
        badge.textContent = '80% budžeta';
        div.appendChild(badge);
      }
    }
    container.appendChild(div);
  });
}

function onBudgetListClick(event) {
  const button = event.target.closest('button[data-action="delete"]');
  if (!button) return;
  const category = button.dataset.cat;
  if (!category) return;
  if (!confirm(`Izbrisati budžet za “${category}”?`)) return;
  delete state.settings.budgets[category];
  saveSettings(state.settings);
  state.budgetWarnings.clear();
  renderBudgets();
  warnIfBudgetHit();
}

function onBudgetListChange(event) {
  const toggle = event.target.matches('input[data-action="toggle"]') ? event.target : null;
  if (!toggle) return;
  const category = toggle.dataset.cat;
  if (!category) return;
  const current = normalizeBudgetConfig(state.settings.budgets[category]);
  state.settings.budgets[category] = { limitCents: current.limitCents, active: toggle.checked };
  saveSettings(state.settings);
  state.budgetWarnings.clear();
  renderBudgets();
  warnIfBudgetHit();
}

function calcBudgetUsage(monthTxs) {
  const budgets = state.settings.budgets || {};
  const entries = Object.entries(budgets);
  if (entries.length === 0) return [];
  const map = new Map();
  monthTxs.forEach(tx => {
    if (isTransfer(tx) || tx.type !== 'expense') return;
    splitEntries(tx).forEach(entry => {
      const key = normalizeCategory(entry.category);
      map.set(key, (map.get(key) || 0) + entry.amountCents);
    });
  });
  return entries.map(([category, cfg]) => {
    const normalized = normalizeBudgetConfig(cfg);
    const key = normalizeCategory(category);
    return {
      category,
      limitCents: normalized.limitCents,
      active: normalized.active,
      spentCents: map.get(key) || 0
    };
  });
}

function warnIfBudgetHit(month = state.selectedMonth) {
  const usage = calcBudgetUsage(getMonthlyTransactions(false)).filter(item => item.active);
  usage.forEach(item => {
    if (!item.limitCents) return;
    const pct = (item.spentCents / item.limitCents) * 100;
    if (pct >= 80) {
      const tone = pct >= 100 ? 'danger' : 'warning';
      const message = `${item.category} ${pct.toFixed(0)}% (${formatCurrencyHR(item.spentCents)} / ${formatCurrencyHR(item.limitCents)})`;
      showBanner(message, tone, { kind: `budget-${item.category}` });
      const key = `${month}:${item.category}`;
      if (pct >= 80 && state.budgetWarnings.get(key) !== (pct >= 100 ? 'danger' : 'warning')) {
        addLog('BUDGET_HIT', { category: item.category, pct: Number(pct.toFixed(0)), month });
        state.budgetWarnings.set(key, pct >= 100 ? 'danger' : 'warning');
      }
    }
  });
}

function renderRecurringList() {
  const container = document.getElementById('recurringList');
  container.innerHTML = '';
  if (!state.settings.recurring || state.settings.recurring.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Nema ponavljajućih transakcija.';
    container.appendChild(p);
    return;
  }
  state.settings.recurring.forEach(rec => {
    const div = document.createElement('div');
    div.className = 'recurring-item';
    div.innerHTML = `
      <strong>${rec.title}</strong>
      <span>${rec.type === 'income' ? 'Prihod' : 'Trošak'} • ${normalizeCategory(rec.category)} • ${formatCurrencyHR(rec.amountCents)}</span>
      <span>Dan u mjesecu: ${rec.day}</span>
      <span>Status: ${rec.active ? 'Aktivno' : 'Neaktivno'}</span>
    `;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'btn btn-secondary';
    toggleBtn.textContent = rec.active ? 'Deaktiviraj' : 'Aktiviraj';
    toggleBtn.addEventListener('click', () => {
      rec.active = !rec.active;
      rec.updatedAt = nowISO();
      saveSettings(state.settings);
      renderRecurringList();
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-secondary';
    deleteBtn.textContent = 'Obriši';
    deleteBtn.addEventListener('click', () => {
      if (!confirm('Obrisati definiciju?')) return;
      state.settings.recurring = state.settings.recurring.filter(r => r.id !== rec.id);
      saveSettings(state.settings);
      renderRecurringList();
    });
    actions.append(toggleBtn, deleteBtn);
    div.appendChild(actions);
    container.appendChild(div);
  });
}

function handleRecurringSubmit(event) {
  event.preventDefault();
  const type = document.getElementById('recurringType').value;
  const day = Number(document.getElementById('recurringDay').value);
  const title = document.getElementById('recurringTitleInput').value.trim();
  const category = normalizeCategory(document.getElementById('recurringCategory').value);
  const accountId = document.getElementById('recurringAccount').value;
  const amountCents = parseAmountToCents(document.getElementById('recurringAmount').value);
  const note = document.getElementById('recurringNote').value.trim();
  const active = document.getElementById('recurringActive').checked;
  if (!type || !title || !category || !accountId || !amountCents || !day) {
    showToast('Popunite sva polja za ponavljajuću transakciju.', 'danger');
    return;
  }
  state.settings.recurring.push({
    id: uuid(),
    type,
    title,
    category,
    amountCents,
    freq: 'monthly',
    day,
    accountId,
    active,
    note,
    createdAt: nowISO(),
    updatedAt: nowISO()
  });
  saveSettings(state.settings);
  event.target.reset();
  document.getElementById('recurringActive').checked = true;
  renderRecurringList();
}

function maybePromptRecurring(month = state.selectedMonth) {
  const active = state.settings.recurring.filter(r => r.active);
  if (!month || active.length === 0) return;
  state.settings.recurringApplied = state.settings.recurringApplied || {};
  if (state.settings.recurringApplied[month]) return;
  if (state.recurringPromptOpen) return;
  state.recurringPromptOpen = true;
  try {
    const confirmed = confirm('Primijeniti aktivne ponavljajuće stavke za ovaj mjesec?');
    if (confirmed) {
      applyRecurringForMonth(month);
    } else {
      state.settings.recurringApplied[month] = 'skipped';
      saveSettings(state.settings);
    }
  } finally {
    state.recurringPromptOpen = false;
  }
}

function applyRecurringForMonth(month = state.selectedMonth) {
  const defs = state.settings.recurring.filter(r => r.active);
  if (defs.length === 0) {
    showToast('Nema aktivnih definicija.', 'info');
    return;
  }
  defs.forEach(def => {
    const date = buildRecurringDate(month, def.day);
    const tx = {
      id: uuid(),
      type: def.type,
      title: def.title,
      category: def.category,
      amountCents: def.amountCents,
      accountId: def.accountId,
      date,
      time: '',
      note: def.note || '',
      splits: [],
      recurringId: def.id,
      createdAt: nowISO(),
      updatedAt: nowISO()
    };
    state.transactions.push(tx);
    addLog('ADD', { txId: tx.id, recurring: true });
  });
  saveTransactions(state.transactions);
  state.settings.recurringApplied = state.settings.recurringApplied || {};
  state.settings.recurringApplied[month] = true;
  saveSettings(state.settings);
  afterDataChange(`${month}-${String(new Date(month + '-01').getDate()).padStart(2, '0')}`);
  addLog('RECUR_APPLIED', { count: defs.length, month });
  showToast('Ponavljajuće transakcije dodane', 'success');
}

function buildRecurringDate(yyyyMm, day) {
  const [yearStr, monthStr] = yyyyMm.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const last = new Date(year, month, 0).getDate();
  const safeDay = Math.min(day, last);
  return `${yyyyMm}-${String(safeDay).padStart(2, '0')}`;
}

function renderGoals() {
  const container = document.getElementById('goalsList');
  container.innerHTML = '';
  if (!state.settings.goals || state.settings.goals.length === 0) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Još nema ciljeva.';
    container.appendChild(p);
    return;
  }
  state.settings.goals.forEach(goal => {
    const div = document.createElement('div');
    div.className = 'goal-item';
    const pct = goal.targetCents > 0 ? Math.min(100, Math.round((goal.savedCents / goal.targetCents) * 100)) : 0;
    div.innerHTML = `
      <strong>${goal.title}</strong>
      <span>Spremljeno: ${formatCurrencyHR(goal.savedCents)} / ${formatCurrencyHR(goal.targetCents)}</span>
      ${goal.deadline ? `<span>Rok: ${new Date(goal.deadline + 'T00:00').toLocaleDateString('hr-HR')}</span>` : ''}
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
    `;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const depositBtn = document.createElement('button');
    depositBtn.type = 'button';
    depositBtn.className = 'btn btn-secondary';
    depositBtn.textContent = 'Uplati u cilj';
    depositBtn.addEventListener('click', () => {
      const amount = prompt('Iznos u EUR za uplatu:');
      const cents = parseAmountToCents(amount || '');
      if (!cents || cents <= 0) return;
      goal.savedCents = (goal.savedCents || 0) + cents;
      goal.updatedAt = nowISO();
      saveSettings(state.settings);
      renderGoals();
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-secondary';
    deleteBtn.textContent = 'Obriši';
    deleteBtn.addEventListener('click', () => {
      if (!confirm('Obrisati cilj?')) return;
      state.settings.goals = state.settings.goals.filter(g => g.id !== goal.id);
      saveSettings(state.settings);
      renderGoals();
    });
    actions.append(depositBtn, deleteBtn);
    div.appendChild(actions);
    container.appendChild(div);
  });
}

function handleGoalSubmit(event) {
  event.preventDefault();
  const title = document.getElementById('goalTitle').value.trim();
  const targetCents = parseAmountToCents(document.getElementById('goalTarget').value);
  const deadline = document.getElementById('goalDeadline').value;
  if (!title || !targetCents) {
    showToast('Unesite naziv i cilj iznosa.', 'danger');
    return;
  }
  state.settings.goals.push({
    id: uuid(),
    title,
    targetCents,
    deadline: deadline || '',
    savedCents: 0,
    createdAt: nowISO(),
    updatedAt: nowISO()
  });
  saveSettings(state.settings);
  event.target.reset();
  renderGoals();
}
function renderAccountsList() {
  const container = document.getElementById('accountsList');
  container.innerHTML = '';
  state.settings.accounts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  state.settings.accounts.forEach(acc => {
    const div = document.createElement('div');
    div.className = 'account-item';
    div.innerHTML = `
      <strong>${acc.name}</strong>
      <span>Valuta: ${acc.currency}</span>
      <span>Status: ${acc.hidden ? 'Skriven' : 'Vidljiv'}</span>
      <span>Redoslijed: ${acc.order ?? 0}</span>
    `;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const defaultBtn = document.createElement('button');
    defaultBtn.type = 'button';
    defaultBtn.className = 'btn btn-secondary';
    defaultBtn.textContent = acc.id === state.settings.defaultAccountId ? 'Zadani' : 'Postavi kao zadani';
    defaultBtn.disabled = acc.id === state.settings.defaultAccountId;
    defaultBtn.addEventListener('click', () => {
      state.settings.defaultAccountId = acc.id;
      saveSettings(state.settings);
      renderAccountsList();
      renderAccountsSelects();
    });
    const hideBtn = document.createElement('button');
    hideBtn.type = 'button';
    hideBtn.className = 'btn btn-secondary';
    hideBtn.textContent = acc.hidden ? 'Prikaži' : 'Sakrij';
    hideBtn.addEventListener('click', () => {
      acc.hidden = !acc.hidden;
      saveSettings(state.settings);
      renderAccountsList();
      renderAccountsSelects();
    });
    actions.append(defaultBtn, hideBtn);
    div.appendChild(actions);
    container.appendChild(div);
  });
}

function handleAccountSubmit(event) {
  event.preventDefault();
  const name = document.getElementById('accountName').value.trim();
  const currency = document.getElementById('accountCurrency').value.trim() || 'EUR';
  const hidden = document.getElementById('accountHidden').checked;
  if (!name) {
    showToast('Unesite naziv računa.', 'danger');
    return;
  }
  state.settings.accounts.push({
    id: uuid(),
    name,
    currency,
    order: state.settings.accounts.length,
    hidden,
    createdAt: nowISO(),
    updatedAt: nowISO()
  });
  if (!state.settings.defaultAccountId) state.settings.defaultAccountId = state.settings.accounts[0].id;
  saveSettings(state.settings);
  event.target.reset();
  renderAccountsList();
  renderAccountsSelects();
}

function handleTransferSubmit(event) {
  event.preventDefault();
  const fromId = document.getElementById('transferFrom').value;
  const toId = document.getElementById('transferTo').value;
  const amountCents = parseAmountToCents(document.getElementById('transferAmount').value);
  const date = document.getElementById('transferDate').value;
  const note = document.getElementById('transferNote').value.trim();
  if (!fromId || !toId || fromId === toId) {
    showToast('Odaberite različite račune.', 'danger');
    return;
  }
  if (!amountCents || amountCents <= 0) {
    showToast('Unesite iznos veći od 0.', 'danger');
    return;
  }
  if (!date) {
    showToast('Odaberite datum.', 'danger');
    return;
  }
  transferBetweenAccounts(fromId, toId, amountCents, date, note);
  event.target.reset();
  closeModal('#transferModal');
  showToast('Transfer zabilježen', 'success');
}

function transferBetweenAccounts(fromId, toId, cents, date, note) {
  const now = nowISO();
  const fromName = state.settings.accounts.find(a => a.id === fromId)?.name || '';
  const toName = state.settings.accounts.find(a => a.id === toId)?.name || '';
  const outTx = {
    id: uuid(),
    type: 'transfer',
    title: `Transfer prema ${toName}`,
    category: 'Transfer',
    amountCents: cents,
    accountId: fromId,
    date,
    time: '',
    note,
    splits: [],
    createdAt: now,
    updatedAt: now,
    recurringId: null
  };
  const inTx = {
    id: uuid(),
    type: 'transfer',
    title: `Transfer od ${fromName}`,
    category: 'Transfer',
    amountCents: cents,
    accountId: toId,
    date,
    time: '',
    note,
    splits: [],
    createdAt: now,
    updatedAt: now,
    recurringId: null
  };
  state.transactions.push(outTx, inTx);
  saveTransactions(state.transactions);
  addLog('ADD', { txId: outTx.id, transfer: true });
  addLog('ADD', { txId: inTx.id, transfer: true });
  afterDataChange(date);
}

function handleBudgetSubmit(event) {
  event.preventDefault();
  const category = normalizeCategory(document.getElementById('budgetCategory').value);
  const amountCents = parseAmountToCents(document.getElementById('budgetAmount').value);
  if (!category || !amountCents) {
    showToast('Unesite kategoriju i limit.', 'danger');
    return;
  }
  state.settings.budgets[category] = { limitCents: amountCents, active: true };
  saveSettings(state.settings);
  event.target.reset();
  renderBudgets();
  state.budgetWarnings.clear();
  warnIfBudgetHit();
}

function handleFiltersSubmit(event) {
  event.preventDefault();
  const filters = getActiveFilters();
  filters.text = document.getElementById('filterText').value.trim();
  filters.type = document.getElementById('filterType').value;
  filters.category = document.getElementById('filterCategory').value.trim();
  filters.accountId = document.getElementById('filterAccount').value;
  filters.from = document.getElementById('filterDateFrom').value;
  filters.to = document.getElementById('filterDateTo').value;
  const minVal = document.getElementById('filterMin').value;
  const maxVal = document.getElementById('filterMax').value;
  filters.minCents = minVal ? parseAmountToCents(minVal) : null;
  filters.maxCents = maxVal ? parseAmountToCents(maxVal) : null;
  filters.sort = document.getElementById('filterSort').value;
  filters.affectChart = document.getElementById('filtersAffectChart').checked;
  state.settings.filters = filters;
  saveSettings(state.settings);
  closeDrawer('#filterDrawer');
  renderCategoryChart();
  renderHistoryDay();
}

function clearFilters() {
  state.settings.filters = structuredClone(DEFAULT_FILTERS);
  saveSettings(state.settings);
  updateFiltersForm();
  renderCategoryChart();
  renderHistoryDay();
}

function updateFiltersForm() {
  const filters = getActiveFilters();
  document.getElementById('filterText').value = filters.text;
  document.getElementById('filterType').value = filters.type;
  document.getElementById('filterCategory').value = filters.category;
  document.getElementById('filterAccount').value = filters.accountId || '';
  document.getElementById('filterDateFrom').value = filters.from || '';
  document.getElementById('filterDateTo').value = filters.to || '';
  document.getElementById('filterMin').value = filters.minCents != null ? (filters.minCents / 100).toFixed(2) : '';
  document.getElementById('filterMax').value = filters.maxCents != null ? (filters.maxCents / 100).toFixed(2) : '';
  document.getElementById('filterSort').value = filters.sort;
  document.getElementById('filtersAffectChart').checked = Boolean(filters.affectChart);
}

function updateMenus() {
  const darkToggle = document.getElementById('toggleDark');
  if (darkToggle) darkToggle.checked = Boolean(state.settings.darkMode);
  const backupToggle = document.getElementById('backupToggle');
  if (backupToggle) backupToggle.checked = Boolean(state.settings.weeklyBackup);
}
function maybeOfferWeeklyBackup() {
  if (!state.settings.weeklyBackup) return;
  const last = state.settings.lastBackupAt;
  const now = new Date();
  const lastDate = last ? new Date(last) : null;
  const diffDays = lastDate ? Math.floor((now - lastDate) / (1000 * 60 * 60 * 24)) : Infinity;
  if (diffDays >= 7) {
    exportAccount();
    state.settings.lastBackupAt = nowISO();
    saveSettings(state.settings);
    showToast('Automatski backup preuzet.', 'info');
  }
}

function exportAccount() {
  const payload = {
    schema: 'fintracker.v1',
    exportedAt: nowISO(),
    accountId: localStorage.getItem(STORAGE_KEYS.accountId),
    transactions: state.transactions,
    settings: state.settings
  };
  addLog('EXPORT', { count: state.transactions.length });
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `fintracker-${payload.accountId}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importAccount(file) {
  if (!file) return;
  const text = await file.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    alert('Neispravna datoteka.');
    return;
  }
  if (!payload || payload.schema !== 'fintracker.v1') {
    alert('Nepoznat format uvoza.');
    return;
  }
  state.transactions = mergeTransactions(state.transactions, payload.transactions || []);
  saveTransactions(state.transactions);
  state.settings = {
    ...state.settings,
    ...payload.settings,
    filters: { ...state.settings.filters, ...(payload.settings?.filters || {}) }
  };
  saveSettings(state.settings);
  applyDarkMode(state.settings.darkMode);
  renderAccountsSelects();
  updateMenus();
  updateFiltersForm();
  renderBudgets();
  renderRecurringList();
  renderGoals();
  renderAccountsList();
  renderKPIs();
  renderCategoryChart();
  syncHistoryDateForMonth();
  renderHistoryDay();
  warnIfBudgetHit();
  addLog('IMPORT', { count: (payload.transactions || []).length });
  showToast('Uvoz dovršen', 'success');
}

function wipeAllData() {
  const confirmation = prompt('Upiši RIJEČ "OBRIŠI" (bez navodnika) za potvrdu:');
  if (confirmation !== 'OBRIŠI') return;
  const confirmed = confirm('Ovo će trajno ukloniti SVE lokalne podatke (transakcije, postavke, log, PIN). Nastavi?');
  if (!confirmed) return;
  localStorage.removeItem(STORAGE_KEYS.transactions);
  localStorage.removeItem(STORAGE_KEYS.settings);
  state.transactions = [];
  state.settings = loadSettings();
  addLog('DELETE', { info: 'wipeAll' });
  alert('Svi podaci su obrisani. Aplikacija će se resetirati.');
  location.reload();
}

function mergeTransactions(existing, incoming) {
  const map = new Map(existing.map(tx => [tx.id, tx]));
  incoming.forEach(tx => {
    if (!tx?.id) return;
    const current = map.get(tx.id);
    if (!current) {
      map.set(tx.id, tx);
    } else {
      const currentTime = Date.parse(current.updatedAt || current.createdAt || 0);
      const incomingTime = Date.parse(tx.updatedAt || tx.createdAt || 0);
      if (incomingTime > currentTime) map.set(tx.id, tx);
    }
  });
  return Array.from(map.values());
}

function exportMonthCSV(yyyyMm) {
  const txs = filterByMonth(state.transactions, yyyyMm);
  const headers = ['ID', 'Tip', 'Naziv', 'Kategorija', 'Račun', 'Datum', 'Vrijeme', 'Iznos(EUR)', 'Bilješka'];
  const rows = txs.map(tx => [
    tx.id,
    tx.type,
    tx.title,
    normalizeCategory(tx.category),
    state.settings.accounts.find(acc => acc.id === tx.accountId)?.name || '',
    tx.date,
    tx.time || '',
    (tx.amountCents / 100).toFixed(2).replace('.', ','),
    (tx.note || '').replace(/"/g, '""')
  ]);
  const csv = [headers.join(';'), ...rows.map(r => r.map(field => `"${String(field ?? '').replace(/"/g, '""')}"`).join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `fintracker-${yyyyMm}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportMonthPDFModern(yyyyMm) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert('PDF biblioteka nije dostupna.');
    return;
  }

  const txs = filterByMonth(state.transactions, yyyyMm);
  const incomes = sumByType(txs, 'income') / 100;
  const expenses = sumByType(txs, 'expense') / 100;
  const balance = incomes - expenses;
  const monthLabel = new Date(`${yyyyMm}-01`).toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' });

  const doc = new jsPDF('p', 'mm', 'a4');
  const margin = 15;
  const lineHeight = 7;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`Financijski izvještaj — ${monthLabel}`, 105, y, { align: 'center' });
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(`Datum generiranja: ${new Date().toLocaleDateString('hr-HR')}`, margin, y);
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.text('Sažetak', margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.text(`Ukupni prihodi:  ${incomes.toFixed(2)} €`, margin, y); y += lineHeight;
  doc.text(`Ukupni troškovi: ${expenses.toFixed(2)} €`, margin, y); y += lineHeight;
  doc.text(`Saldo:           ${balance.toFixed(2)} €`, margin, y); y += lineHeight + 5;

  const expenseEntries = Object.entries(groupByCategory(txs, 'expense'))
    .map(([category, cents]) => ({ category, value: (cents || 0) / 100 }))
    .sort((a, b) => b.value - a.value);

  doc.setFont('helvetica', 'bold');
  doc.text('Troškovi po kategorijama', margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  if (expenseEntries.length === 0) {
    doc.text('Nema troškova za odabrani mjesec.', margin, y);
    y += lineHeight;
  } else {
    doc.text('Kategorija', margin, y);
    doc.text('Iznos (€)', 195 - margin, y, { align: 'right' });
    y += lineHeight;
    doc.setDrawColor(148, 163, 184);
    doc.line(margin, y - 4, 195 - margin, y - 4);
    expenseEntries.forEach(entry => {
      if (y > 270) {
        doc.addPage();
        y = margin;
      }
      doc.text(entry.category, margin, y);
      doc.text(entry.value.toFixed(2), 195 - margin, y, { align: 'right' });
      y += lineHeight;
    });
    y += 4;
  }

  const topFive = expenseEntries.slice(0, 5);
  doc.setFont('helvetica', 'bold');
  if (y > 270) {
    doc.addPage();
    y = margin;
  }
  doc.text('Top 5 troškova', margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  if (topFive.length === 0) {
    doc.text('Nema troškova za prikaz.', margin, y);
    y += lineHeight;
  } else {
    topFive.forEach((entry, index) => {
      if (y > 270) {
        doc.addPage();
        y = margin;
      }
      doc.text(`${index + 1}. ${entry.category}: ${entry.value.toFixed(2)} €`, margin, y);
      y += lineHeight;
    });
  }

  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text('Generirano u Financijskom trackeru — © Leon Sošić 2025', 105, 285, { align: 'center' });

  doc.save(`Financijski_izvjestaj_${yyyyMm}.pdf`);
}
function exportMonthPDF(yyyyMm) {
  const style = (state.settings.pdfStyle || 'modern');
  if (style === 'classic') {
    exportMonthPDFClassic(yyyyMm);
  } else {
    exportMonthPDFModern(yyyyMm);
  }
}

function exportMonthPDFClassic(yyyyMm) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert('PDF biblioteka nije dostupna.');
    return;
  }
  const doc = new jsPDF('p', 'mm', 'a4');
  const margin = 12;
  let y = margin;
  const txs = filterByMonth(state.transactions, yyyyMm).filter(tx => !isTransfer(tx));
  const incomesC = sumByType(txs, 'income');
  const expensesC = sumByType(txs, 'expense');
  const balance = (incomesC - expensesC) / 100;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Izvještaj ${yyyyMm}`, margin, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Generirano: ${new Date().toLocaleDateString('hr-HR')}`, margin, y);
  y += 6;
  doc.setDrawColor(200);
  doc.line(margin, y, 210 - margin, y);
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Sažetak', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(`Prihodi:  ${(incomesC / 100).toFixed(2)} €`, margin, y); y += 5;
  doc.text(`Troškovi: ${(expensesC / 100).toFixed(2)} €`, margin, y); y += 5;
  doc.text(`Saldo:    ${balance.toFixed(2)} €`, margin, y); y += 8;
  doc.line(margin, y, 210 - margin, y);
  y += 6;
  const byCat = groupByCategory(txs, 'expense');
  const rows = Object.entries(byCat)
    .sort((a, b) => (b[1] || 0) - (a[1] || 0))
    .map(([cat, val]) => [cat, `${(val / 100).toFixed(2)} €`]);
  doc.setFont('helvetica', 'bold');
  doc.text('Troškovi po kategorijama', margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.text('Kategorija', margin, y);
  doc.text('Ukupno', 120, y);
  y += 4;
  doc.setDrawColor(210);
  doc.line(margin, y, 210 - margin, y);
  y += 4;
  rows.forEach(row => {
    if (y > 270) {
      doc.addPage();
      y = margin;
    }
    doc.text(row[0], margin, y);
    doc.text(row[1], 120, y);
    y += 6;
  });
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text('Klasični izvještaj — Financijski tracker — © Leon Sošić 2025', 105, 290, { align: 'center' });
  doc.save(`Izvjestaj_klasicni_${yyyyMm}.pdf`);
}

let typeFocusBound = false;
function setupTypeFocus() {
  if (typeFocusBound) return;
  const typeSelect = document.getElementById('txType');
  const titleInput = document.getElementById('txTitle');
  if (!typeSelect || !titleInput) return;
  typeSelect.addEventListener('change', () => {
    setTimeout(() => titleInput.focus(), 0);
  });
  typeFocusBound = true;
}

function focusTitleField() {
  const titleInput = document.getElementById('txTitle');
  if (titleInput) titleInput.focus();
}

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeModal('#editTxModal');
      closeModal('#budgetsModal');
      closeModal('#recurringModal');
      closeModal('#goalsModal');
      closeModal('#accountsModal');
      closeModal('#transferModal');
      closeModal('#pinModal');
      closeModal('#shortcutsModal');
      closeModal('#aboutModal');
      closeDrawer('#filterDrawer');
      hideAccountMenu();
      hideMoreMenu();
      return;
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      document.getElementById('txTitle').focus();
    }
    if (event.ctrlKey && event.key.toLowerCase() === 's') {
      event.preventDefault();
      document.getElementById('txForm').requestSubmit();
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      openDrawer('#filterDrawer');
    }
    if (event.key === '?') {
      event.preventDefault();
      openModal('#shortcutsModal');
    }
  });
}

function hideMenuById(menuId, btnId) {
  const menu = document.getElementById(menuId);
  const btn = document.getElementById(btnId);
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function hideAccountMenu() {
  hideMenuById('accountMenu', 'accountMenuBtn');
}

function hideMoreMenu() {
  hideMenuById('moreMenu', 'moreMenuBtn');
}

// --- STABILNI KONTROLER MENIJA v3 ---
document.addEventListener('DOMContentLoaded', () => {
  const pairs = [
    { btn: document.getElementById('accountMenuBtn'), menu: document.getElementById('accountMenu') },
    { btn: document.getElementById('moreMenuBtn'), menu: document.getElementById('moreMenu') }
  ];
  if (pairs.some(({ btn, menu }) => !btn || !menu)) return;

  const closeAll = () => {
    pairs.forEach(({ btn, menu }) => {
      if (menu) menu.hidden = true;
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  };

  pairs.forEach(({ btn, menu }) => {
    btn.addEventListener('pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      const wasHidden = menu.hidden;
      closeAll();
      menu.hidden = wasHidden ? false : true;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
    });
  });

  document.addEventListener(
    'pointerdown',
    event => {
      const path = typeof event.composedPath === 'function' ? event.composedPath() : null;
      const clickedInside = pairs.some(({ btn, menu }) => {
        if (path) {
          return path.includes(btn) || path.includes(menu);
        }
        return btn.contains(event.target) || menu.contains(event.target);
      });
      if (!clickedInside) closeAll();
    },
    true
  );

  window.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAll();
  });
  window.addEventListener('scroll', closeAll, { passive: true });
  window.addEventListener('resize', closeAll);
});

function setupMenus() {
  if (window.__menuActionsBound__) return;
  window.__menuActionsBound__ = true;

  document.getElementById('btnExport')?.addEventListener('click', () => {
    hideAccountMenu();
    exportAccount();
  });
  document.getElementById('btnImport')?.addEventListener('click', () => {
    hideAccountMenu();
    document.getElementById('importFile')?.click();
  });
  document.getElementById('importFile')?.addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) importAccount(file);
    event.target.value = '';
  });

  const withMoreMenuClose = callback => () => {
    hideMoreMenu();
    const result = callback?.();
    if (result && typeof result.then === 'function') {
      result.catch(err => console.error(err));
    }
  };

  document.getElementById('goHome')?.addEventListener('click', withMoreMenuClose(() => showDashboard()));
  document.getElementById('openFilterDrawer')?.addEventListener('click', withMoreMenuClose(() => openDrawer('#filterDrawer')));
  document.getElementById('btnExportCSV')?.addEventListener('click', withMoreMenuClose(() => exportMonthCSV(state.selectedMonth)));
  document.getElementById('btnExportPDF')?.addEventListener('click', withMoreMenuClose(() => exportMonthPDF(state.selectedMonth)));
  document.getElementById('openCalendar')?.addEventListener('click', withMoreMenuClose(() => showFullView(renderCalendarView)));
  document.getElementById('openCompare')?.addEventListener('click', withMoreMenuClose(() => showFullView(renderCompareView)));
  document.getElementById('openAnalysis')?.addEventListener('click', withMoreMenuClose(() => showFullView(renderAnalysisView)));
  document.getElementById('backupToggle')?.addEventListener('change', event => {
    state.settings.weeklyBackup = event.target.checked;
    saveSettings(state.settings);
    hideMoreMenu();
  });
  document.getElementById('openBudgets')?.addEventListener('click', withMoreMenuClose(() => openModal('#budgetsModal')));
  document.getElementById('openRecurring')?.addEventListener('click', withMoreMenuClose(() => openModal('#recurringModal')));
  document.getElementById('openGoals')?.addEventListener('click', withMoreMenuClose(() => openModal('#goalsModal')));
  document.getElementById('openAccounts')?.addEventListener('click', withMoreMenuClose(() => openModal('#accountsModal')));
  document.getElementById('openTransfer')?.addEventListener('click', withMoreMenuClose(() => openModal('#transferModal')));
  document.getElementById('toggleDark')?.addEventListener('change', event => {
    state.settings.darkMode = event.target.checked;
    applyDarkMode(state.settings.darkMode);
    saveSettings(state.settings);
  });
  document.getElementById('setupPIN')?.addEventListener('click', withMoreMenuClose(async () => {
    const newPin = prompt('Unesi novi PIN (može sadržavati slova i brojke):');
    if (!newPin) return;
    const trimmed = newPin.trim();
    if (trimmed.length < 4) {
      alert('PIN mora imati barem 4 znaka.');
      return;
    }
    await setPIN(trimmed);
  }));
  document.getElementById('removePIN')?.addEventListener('click', withMoreMenuClose(() => {
    if (!state.settings.pinHash) {
      alert('PIN nije postavljen.');
      return;
    }
    if (confirm('Želiš li sigurno ukloniti PIN zaštitu?')) {
      clearPIN();
    }
  }));
  document.getElementById('openShortcuts')?.addEventListener('click', withMoreMenuClose(() => openModal('#shortcutsModal')));
  document.getElementById('openAbout')?.addEventListener('click', withMoreMenuClose(() => openModal('#aboutModal')));
  document.getElementById('wipeAll')?.addEventListener('click', withMoreMenuClose(() => wipeAllData()));
}
function showDashboard() {
  const dashboard = document.getElementById('dashboard');
  const fullView = document.getElementById('fullView');
  if (dashboard) dashboard.hidden = false;
  if (fullView) {
    fullView.hidden = true;
    fullView.innerHTML = '';
  }
  hideMoreMenu();
  hideAccountMenu();
  state.fullViewActive = false;
}

function showFullView(renderer) {
  const dashboard = document.getElementById('dashboard');
  const fullView = document.getElementById('fullView');
  if (!dashboard || !fullView) return;
  dashboard.hidden = true;
  fullView.hidden = false;
  fullView.innerHTML = '';
  state.fullViewActive = true;
  if (typeof renderer === 'function') {
    renderer(fullView);
  }
}


function renderCalendarView(container) {
  const month = state.calendarMonth || state.selectedMonth || new Date().toISOString().slice(0, 7);
  state.calendarMonth = month;
  container.innerHTML = `
    <div class="view-head">
      <h2>Kalendar troškova — <span id="calMonthLabel"></span></h2>
      <div class="actions">
        <input type="month" id="calMonth">
        <button id="calBackHome" type="button" class="btn btn-secondary">Početna</button>
      </div>
    </div>
    <div id="calendarGrid" class="calendar-grid"></div>
    <div class="legend">
      <span class="dot expense"></span> trošak &nbsp; <span class="dot income"></span> prihod
    </div>
  `;
  const monthInput = container.querySelector('#calMonth');
  const monthLabel = container.querySelector('#calMonthLabel');
  const grid = container.querySelector('#calendarGrid');
  const backBtn = container.querySelector('#calBackHome');

  const renderGrid = currentMonth => {
    const txs = filterByMonth(state.transactions, currentMonth);
    const expenseMap = new Map();
    const incomeMap = new Map();
    txs.forEach(tx => {
      if (isTransfer(tx)) return;
      const dayKey = tx.date;
      if (!dayKey) return;
      const target = tx.type === 'expense' ? expenseMap : incomeMap;
      const prev = target.get(dayKey) || 0;
      target.set(dayKey, prev + (tx.amountCents || 0));
    });
    const maxExpense = Math.max(0, ...Array.from(expenseMap.values()));
    grid.innerHTML = '';
    const baseDate = new Date(`${currentMonth}-01T00:00`);
    const startWeekday = (baseDate.getDay() + 6) % 7;
    const daysInMonth = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
    for (let i = 0; i < startWeekday; i += 1) {
      const filler = document.createElement('div');
      filler.className = 'day empty';
      grid.appendChild(filler);
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`;
      const expenseCents = expenseMap.get(dateStr) || 0;
      const incomeCents = incomeMap.get(dateStr) || 0;
      const dayEl = document.createElement('div');
      dayEl.className = 'day';
      dayEl.innerHTML = `<span class="date">${day}</span>`;
      if (expenseCents > 0 || incomeCents > 0) {
        const intensity = expenseCents > 0 && maxExpense > 0 ? Math.min(0.7, 0.15 + (expenseCents / maxExpense) * 0.55) : 0.2;
        const overlay = document.createElement('div');
        overlay.className = 'heat';
        if (expenseCents > 0 && incomeCents > 0) {
          overlay.style.background = `linear-gradient(135deg,
            rgba(239,68,68,${Math.max(intensity, 0.2)}) 0%,
            rgba(239,68,68,${Math.max(intensity, 0.2)}) 50%,
            rgba(22,163,74,0.35) 50%,
            rgba(22,163,74,0.45) 100%)`;
        } else if (expenseCents > 0) {
          overlay.style.background = `rgba(239,68,68,${Math.max(intensity, 0.2)})`;
        } else {
          overlay.style.background = 'rgba(22,163,74,0.25)';
        }
        dayEl.appendChild(overlay);
      }
      if (incomeCents > 0) {
        const incomeDot = document.createElement('span');
        incomeDot.className = 'dot income';
        incomeDot.style.position = 'absolute';
        incomeDot.style.left = '8px';
        incomeDot.style.bottom = '8px';
        dayEl.appendChild(incomeDot);
      }
      const sumEl = document.createElement('div');
      sumEl.className = 'sum';
      if (expenseCents > 0 && incomeCents > 0) {
        sumEl.textContent = `${formatCurrencyHR(incomeCents)} / -${formatCurrencyHR(expenseCents)}`;
      } else if (expenseCents > 0) {
        sumEl.textContent = `-${formatCurrencyHR(expenseCents)}`;
      } else if (incomeCents > 0) {
        sumEl.textContent = `${formatCurrencyHR(incomeCents)}`;
      } else {
        sumEl.textContent = '';
      }
      dayEl.appendChild(sumEl);
      dayEl.addEventListener('click', () => {
        setSelectedMonth(currentMonth);
        setHistoryDate(dateStr);
        renderKPIs();
        renderCategoryChart();
        renderBudgets();
        renderHistoryDay();
        warnIfBudgetHit(currentMonth);
        maybePromptRecurring(currentMonth);
        showDashboard();
      });
      grid.appendChild(dayEl);
    }
  };

  const setMonth = newMonth => {
    if (!newMonth) return;
    state.calendarMonth = newMonth;
    monthInput.value = newMonth;
    const labelText = new Date(`${newMonth}-01T00:00`).toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' });
    monthLabel.textContent = labelText;
    renderGrid(newMonth);
  };

  setMonth(month);
  monthInput.addEventListener('change', event => setMonth(event.target.value));
  backBtn.addEventListener('click', () => showDashboard());
}

function renderCompareView(container) {
  const defaultTo = state.selectedMonth || new Date().toISOString().slice(0, 7);
  const fromDate = new Date(`${defaultTo}-01T00:00`);
  fromDate.setMonth(fromDate.getMonth() - 1);
  const defaultFrom = fromDate.toISOString().slice(0, 7);
  container.innerHTML = `
    <div class="view-head">
      <h2>Usporedba mjeseci</h2>
      <div class="actions">
        <label>Od:<input type="month" id="cmpFrom" value="${defaultFrom}"></label>
        <label>Do:<input type="month" id="cmpTo" value="${defaultTo}"></label>
        <button id="cmpBackHome" type="button" class="btn btn-secondary">Početna</button>
      </div>
    </div>
    <div class="chart-canvas"><canvas id="cmpChart" height="380"></canvas></div>
    <div id="cmpStats" class="stats"></div>
  `;
  const fromInput = container.querySelector('#cmpFrom');
  const toInput = container.querySelector('#cmpTo');
  const backBtn = container.querySelector('#cmpBackHome');
  const statsEl = container.querySelector('#cmpStats');
  const ctx = container.querySelector('#cmpChart').getContext('2d');

  const monthStats = month => {
    const txs = filterByMonth(state.transactions, month);
    const incomes = sumByType(txs, 'income') / 100;
    const expenses = sumByType(txs, 'expense') / 100;
    const balance = incomes - expenses;
    return { incomes, expenses, balance };
  };

  const updateChart = () => {
    const fromMonth = fromInput.value;
    const toMonth = toInput.value;
    if (!fromMonth || !toMonth) return;
    const from = monthStats(fromMonth);
    const to = monthStats(toMonth);
    const labels = [
      new Date(`${fromMonth}-01T00:00`).toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' }),
      new Date(`${toMonth}-01T00:00`).toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' })
    ];
    if (state.compareChart) {
      state.compareChart.destroy();
      state.compareChart = null;
    }
    state.compareChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Prihodi',
            data: [from.incomes, to.incomes],
            backgroundColor: '#16a34a'
          },
          {
            label: 'Troškovi',
            data: [from.expenses, to.expenses],
            backgroundColor: '#dc2626'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          tooltip: {
            callbacks: {
              label(context) {
                const currentValue = Number(context.parsed.y || 0);
                const baseLine = `${context.dataset.label} — ${context.label}: ${formatCurrencyHR(Math.round(currentValue * 100))}`;
                const datasetValues = context.dataset.data || [];
                const otherIndex = context.dataIndex === 0 ? 1 : 0;
                if (datasetValues.length < 2 || typeof datasetValues[otherIndex] !== 'number') {
                  return baseLine;
                }
                const comparisonValue = datasetValues[otherIndex];
                const otherLabel = labels[otherIndex] || '';
                const diff = currentValue - comparisonValue;
                if (Math.abs(diff) < 0.005) {
                  return `${baseLine}\nΔ Bez promjene u odnosu na ${otherLabel}`;
                }
                const sign = diff > 0 ? '+' : '−';
                const diffCurrency = formatCurrencyHR(Math.round(Math.abs(diff) * 100));
                const pctRaw = comparisonValue === 0 ? null : (diff / comparisonValue) * 100;
                const pctText = pctRaw === null ? 'n/a' : `${pctRaw > 0 ? '+' : '−'}${Math.abs(pctRaw).toFixed(1)}%`;
                return `${baseLine}\nΔ ${sign}${diffCurrency} (${pctText}) u odnosu na ${otherLabel}`;
              }
            }
          },
          legend: { position: 'bottom' }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
    const balanceChange = from.balance === 0 ? (to.balance !== 0 ? 100 : 0) : ((to.balance - from.balance) / Math.abs(from.balance)) * 100;
    statsEl.textContent = `Saldo Od: ${from.balance.toFixed(2)} € · Saldo Do: ${to.balance.toFixed(2)} € · Promjena: ${balanceChange.toFixed(1)}%`;
  };

  fromInput.addEventListener('change', updateChart);
  toInput.addEventListener('change', updateChart);
  backBtn.addEventListener('click', () => showDashboard());
  updateChart();
}

function renderAnalysisView(container) {
  const activeMonth = state.selectedMonth || new Date().toISOString().slice(0, 7);
  container.innerHTML = `
    <div class="view-head">
      <h2>Analiza kategorija — <span id="anMonthLabel"></span></h2>
      <div class="actions">
        <input type="month" id="anMonth" value="${activeMonth}">
        <select id="anType">
          <option value="expense">Troškovi</option>
          <option value="income">Prihodi</option>
        </select>
        <button id="anBackHome" type="button" class="btn btn-secondary">Početna</button>
      </div>
    </div>
    <table id="anTable" class="table">
      <thead><tr><th data-sort="category">Kategorija</th><th data-sort="count">Broj</th><th data-sort="avg">Prosjek (€)</th><th data-sort="total">Ukupno (€)</th></tr></thead>
      <tbody></tbody>
    </table>
  `;
  const monthInput = container.querySelector('#anMonth');
  const typeSelect = container.querySelector('#anType');
  const backBtn = container.querySelector('#anBackHome');
  const label = container.querySelector('#anMonthLabel');
  const tbody = container.querySelector('#anTable tbody');
  let sortKey = 'total';
  let sortDir = 'desc';

  const buildData = (month, type) => {
    const txs = filterByMonth(state.transactions, month);
    const rows = new Map();
    txs.forEach(tx => {
      if (isTransfer(tx) || tx.type !== type) return;
      const entries = splitEntries(tx);
      entries.forEach(entry => {
        if (!entry.category) return;
        const key = entry.category;
        const current = rows.get(key) || { category: key, count: 0, total: 0 };
        current.count += 1;
        current.total += entry.amountCents || 0;
        rows.set(key, current);
      });
    });
    return Array.from(rows.values()).map(item => ({
      category: item.category,
      count: item.count,
      total: (item.total / 100),
      avg: item.count > 0 ? (item.total / item.count) / 100 : 0
    }));
  };

  const renderTable = () => {
    const month = monthInput.value || activeMonth;
    const type = typeSelect.value;
    label.textContent = new Date(`${month}-01T00:00`).toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' });
    let data = buildData(month, type);
    data.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'category':
          return a.category.localeCompare(b.category) * dir;
        case 'count':
          return (a.count - b.count) * dir;
        case 'avg':
          return (a.avg - b.avg) * dir;
        case 'total':
        default:
          return (a.total - b.total) * dir;
      }
    });
    tbody.innerHTML = '';
    if (data.length === 0) {
      const emptyRow = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 4;
      cell.textContent = 'Nema podataka za odabrani mjesec.';
      cell.className = 'muted';
      emptyRow.appendChild(cell);
      tbody.appendChild(emptyRow);
      return;
    }
    data.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.category}</td>
        <td>${item.count}</td>
        <td class="align-right">${item.avg.toFixed(2)}</td>
        <td class="align-right">${item.total.toFixed(2)}</td>
      `;
      tbody.appendChild(row);
    });
  };

  container.querySelectorAll('#anTable thead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDir = key === 'category' ? 'asc' : 'desc';
      }
      renderTable();
    });
  });
  monthInput.addEventListener('change', renderTable);
  typeSelect.addEventListener('change', renderTable);
  backBtn.addEventListener('click', () => showDashboard());
  renderTable();
}

function renderLogView(container) {
  const entries = [...getLogList()].sort((a, b) => new Date(b.ts || 0) - new Date(a.ts || 0));
  container.innerHTML = `
    <div class="view-head">
      <h2>Log aktivnosti</h2>
      <div class="actions">
        <button id="logClear" type="button" class="btn btn-secondary">Očisti log</button>
        <button id="logBackHome" type="button" class="btn btn-secondary">Početna</button>
      </div>
    </div>
    <table id="logTable" class="table">
      <thead><tr><th>Vrijeme</th><th>Tip</th><th>Detalji</th></tr></thead>
      <tbody></tbody>
    </table>
  `;
  const tbody = container.querySelector('#logTable tbody');
  const clearBtn = container.querySelector('#logClear');
  const backBtn = container.querySelector('#logBackHome');
  if (entries.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 3;
    cell.textContent = 'Još nema zapisa u logu.';
    cell.className = 'muted';
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    entries.forEach(entry => {
      const row = document.createElement('tr');
      const timeCell = document.createElement('td');
      timeCell.textContent = entry.ts ? new Date(entry.ts).toLocaleString('hr-HR') : '';
      const typeCell = document.createElement('td');
      typeCell.textContent = entry.type || '';
      const metaCell = document.createElement('td');
      metaCell.textContent = entry.meta ? JSON.stringify(entry.meta) : '';
      row.append(timeCell, typeCell, metaCell);
      tbody.appendChild(row);
    });
  }
  clearBtn.addEventListener('click', () => {
    if (!confirm('Očistiti log aktivnosti?')) return;
    clearLog();
    renderLogView(container);
  });
  backBtn.addEventListener('click', () => showDashboard());
}

function bindUI() {
  document.getElementById('txForm').addEventListener('submit', handleTxFormSubmit);
  document.getElementById('txReset').addEventListener('click', () => {
    document.getElementById('splitRows').innerHTML = '';
    document.getElementById('splitEditor').hidden = true;
  });
  document.getElementById('btnSplit').addEventListener('click', () => {
    const editor = document.getElementById('splitEditor');
    editor.hidden = !editor.hidden;
    if (!editor.hidden && !editor.querySelector('.split-row')) {
      addSplitRow('splitRows');
    }
  });
  document.getElementById('addSplitRow').addEventListener('click', () => addSplitRow('splitRows'));

  document.getElementById('editTxForm').addEventListener('submit', handleEditSubmit);
  document.getElementById('editCancel').addEventListener('click', () => closeModal('#editTxModal'));
  document.getElementById('editSplitToggle').addEventListener('click', () => {
    const editor = document.getElementById('editSplitEditor');
    editor.hidden = !editor.hidden;
    if (!editor.hidden && !editor.querySelector('.split-row')) {
      addSplitRow('editSplitRows');
    }
  });
  document.getElementById('editAddSplitRow').addEventListener('click', () => addSplitRow('editSplitRows'));

  document.getElementById('historyDate').addEventListener('change', event => {
    setHistoryDate(event.target.value);
    renderHistoryDay();
  });
  document.getElementById('chartModeExpenses').addEventListener('click', () => switchChartMode('expense'));
  document.getElementById('chartModeIncomes').addEventListener('click', () => switchChartMode('income'));
  document.getElementById('chartModeTrend').addEventListener('click', () => switchChartMode('trend'));

  document.getElementById('filtersForm').addEventListener('submit', handleFiltersSubmit);
  document.getElementById('clearFilters').addEventListener('click', clearFilters);

  document.querySelectorAll('.btn-close').forEach(btn => {
    const target = btn.dataset.close;
    btn.addEventListener('click', () => {
      if (target?.startsWith('#filter')) closeDrawer(target);
      else closeModal(target);
    });
  });

  document.getElementById('budgetForm').addEventListener('submit', handleBudgetSubmit);
  document.getElementById('recurringForm').addEventListener('submit', handleRecurringSubmit);
  document.getElementById('applyRecurringMonth').addEventListener('click', applyRecurringForMonth);
  document.getElementById('goalForm').addEventListener('submit', handleGoalSubmit);
  document.getElementById('accountForm').addEventListener('submit', handleAccountSubmit);
  document.getElementById('transferForm').addEventListener('submit', handleTransferSubmit);
}

function switchChartMode(mode) {
  state.chartMode = mode;
  document.querySelectorAll('.btn-toggle').forEach(btn => btn.classList.remove('active'));
  if (mode === 'expense') document.getElementById('chartModeExpenses').classList.add('active');
  if (mode === 'income') document.getElementById('chartModeIncomes').classList.add('active');
  if (mode === 'trend') document.getElementById('chartModeTrend').classList.add('active');
  renderCategoryChart();
}

function navigateHistory(delta) {
  if (!state.historyDate) return;
  const date = new Date(`${state.historyDate}T00:00`);
  date.setDate(date.getDate() + delta);

  const monthStart = new Date(`${state.selectedMonth}-01T00:00`);
  const monthEnd = new Date(`${state.selectedMonth}-01T00:00`);
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setDate(0);

  if (date < monthStart) {
    monthStart.setMonth(monthStart.getMonth() - 1);
    setSelectedMonth(monthStart.toISOString().slice(0, 7));
  } else if (date > monthEnd) {
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    setSelectedMonth(monthEnd.toISOString().slice(0, 7));
  }

  const next = date.toISOString().slice(0, 10);
  setHistoryDate(next);
  renderKPIs();
  renderCategoryChart();
  renderBudgets();
  renderHistoryDay();
  warnIfBudgetHit(state.selectedMonth);
  maybePromptRecurring(state.selectedMonth);
}

function syncHistoryDateForMonth() {
  const days = getDaysInMonth(state.selectedMonth);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const candidate = days.includes(todayStr) ? todayStr : days[days.length - 1];
  setHistoryDate(candidate);
}

async function initApp() {
  ensureAccountId();
  state.transactions = loadTransactions();
  state.settings = loadSettings();
  ensureDefaultAccount(state.settings);
  applyDarkMode(state.settings.darkMode);

  await requirePINOnStartup();
  addLog('LOGIN', { method: state.settings.pinHash ? 'pin' : 'none' });

  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = state.settings.lastMonth || currentMonth;
  state.selectedMonth = month;
  document.getElementById('monthPicker').value = month;

  renderAccountsSelects();
  setupMenus();
  updateMenus();
  bindUI();
  setupKeyboardShortcuts();
  setupTypeFocus();
  focusTitleField();

  document.getElementById('monthPicker').addEventListener('change', event => {
    setSelectedMonth(event.target.value);
    state.calendarMonth = state.selectedMonth;
    syncHistoryDateForMonth();
    renderKPIs();
    renderCategoryChart();
    renderBudgets();
    renderHistoryDay();
    warnIfBudgetHit();
    maybePromptRecurring();
  });

  updateFiltersForm();
  renderBudgets();
  renderRecurringList();
  renderGoals();
  renderAccountsList();

  syncHistoryDateForMonth();
  renderKPIs();
  renderCategoryChart();
  renderHistoryDay();
  maybeOfferWeeklyBackup();
  warnIfBudgetHit();
  maybePromptRecurring();
}

document.addEventListener('DOMContentLoaded', initApp);
