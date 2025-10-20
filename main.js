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

const DEFAULT_SETTINGS = {
  lastMonth: '',
  budgets: {},
  darkMode: false,
  weeklyBackup: false,
  lastBackupAt: '',
  pinHash: '',
  accounts: [],
  defaultAccountId: '',
  filters: { ...DEFAULT_FILTERS },
  goals: [],
  recurring: []
};

const state = {
  transactions: [],
  settings: structuredClone(DEFAULT_SETTINGS),
  selectedMonth: '',
  historyDate: '',
  chartMode: 'expense',
  categoryChart: null,
  trendChart: null,
  locked: false,
  editingId: null
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
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...parsed,
      filters: { ...structuredClone(DEFAULT_FILTERS), ...(parsed?.filters || {}) }
    };
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

function isTransfer(tx) {
  return tx.type === 'transfer' || (tx.category || '').trim().toLowerCase() === 'transfer';
}

function normalizeCategory(name) {
  if (!name) return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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
    typeCell.textContent = tx.type === 'income' ? 'Prihod' : tx.type === 'expense' ? 'Trošak' : 'Transfer';
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
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
}

function closeModal(selector) {
  const modal = document.querySelector(selector);
  if (!modal) return;
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
}

function openDrawer(selector) {
  const drawer = document.querySelector(selector);
  if (!drawer) return;
  drawer.style.display = 'flex';
  document.body.classList.add('modal-open');
}

function closeDrawer(selector) {
  const drawer = document.querySelector(selector);
  if (!drawer) return;
  drawer.style.display = 'none';
  document.body.classList.remove('modal-open');
}

function renderBudgets() {
  const container = document.getElementById('budgetsList');
  if (!container) return;
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
    div.className = 'budget-item';
    const pct = item.limitCents > 0 ? Math.min(100, Math.round((item.spentCents / item.limitCents) * 100)) : 0;
    div.innerHTML = `
      <strong>${item.category}</strong>
      <span>${formatCurrencyHR(item.spentCents)} / ${formatCurrencyHR(item.limitCents)}</span>
      <div class="progress-bar"><span style="width:${pct}%"></span></div>
    `;
    if (item.limitCents > 0) {
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

function calcBudgetUsage(monthTxs) {
  const budgets = state.settings.budgets || {};
  const entries = Object.entries(budgets);
  if (entries.length === 0) return [];
  const map = new Map();
  monthTxs.forEach(tx => {
    if (isTransfer(tx) || tx.type !== 'expense') return;
    splitEntries(tx).forEach(entry => {
      const prev = map.get(entry.category) || 0;
      map.set(entry.category, prev + entry.amountCents);
    });
  });
  return entries.map(([category, limitCents]) => ({
    category,
    limitCents,
    spentCents: map.get(normalizeCategory(category)) || 0
  }));
}

function warnIfBudgetHit() {
  const usage = calcBudgetUsage(getMonthlyTransactions(false));
  usage.forEach(item => {
    if (item.limitCents > 0 && item.spentCents >= item.limitCents) {
      showToast(`Budžet za ${item.category} je prekoračen!`, 'danger');
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

function applyRecurringForMonth() {
  const defs = state.settings.recurring.filter(r => r.active);
  if (defs.length === 0) {
    showToast('Nema aktivnih definicija.', 'info');
    return;
  }
  const yyyyMm = state.selectedMonth;
  defs.forEach(def => {
    const date = buildRecurringDate(yyyyMm, def.day);
    state.transactions.push({
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
    });
  });
  saveTransactions(state.transactions);
  afterDataChange(`${yyyyMm}-${String(new Date(yyyyMm + '-01').getDate()).padStart(2, '0')}`);
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
  state.settings.budgets[category] = amountCents;
  saveSettings(state.settings);
  event.target.reset();
  renderBudgets();
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

async function sha256(text) {
  const enc = new TextEncoder().encode(text);
  const buffer = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handlePinSubmit(event) {
  event.preventDefault();
  const pin = document.getElementById('pinInput').value;
  const confirmPin = document.getElementById('pinConfirm').value;
  if (!pin || pin !== confirmPin) {
    showToast('PIN i potvrda moraju biti isti.', 'danger');
    return;
  }
  state.settings.pinHash = await sha256(pin);
  saveSettings(state.settings);
  showToast('PIN postavljen', 'success');
  closeModal('#pinModal');
  document.getElementById('pinInput').value = '';
  document.getElementById('pinConfirm').value = '';
}

function handleClearPin() {
  state.settings.pinHash = '';
  saveSettings(state.settings);
  showToast('PIN uklonjen', 'info');
  closeModal('#pinModal');
}

async function handlePinUnlock(event) {
  event.preventDefault();
  const pin = document.getElementById('pinUnlock').value;
  const hash = await sha256(pin);
  if (hash === state.settings.pinHash) {
    closeModal('#pinLock');
    state.locked = false;
    document.getElementById('pinUnlock').value = '';
    renderAfterUnlock();
  } else {
    setError('pinUnlock', 'Netočan PIN.');
  }
}

function renderAfterUnlock() {
  renderAccountsSelects();
  updateFiltersForm();
  updateMenus();
  renderKPIs();
  renderCategoryChart();
  renderHistoryDay();
  renderBudgets();
  renderRecurringList();
  renderGoals();
  renderAccountsList();
}

function maybeLockWithPIN() {
  if (!state.settings.pinHash) {
    renderAfterUnlock();
    return;
  }
  state.locked = true;
  openModal('#pinLock');
}

function updateMenus() {
  document.getElementById('toggleDark').checked = Boolean(state.settings.darkMode);
  document.getElementById('backupToggle').checked = Boolean(state.settings.weeklyBackup);
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
  renderAfterUnlock();
  showToast('Uvoz dovršen', 'success');
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

function exportMonthPDF(yyyyMm) {
  const txs = filterByMonth(state.transactions, yyyyMm);
  const monthLabel = new Date(yyyyMm + '-01').toLocaleDateString('hr-HR', { month: 'long', year: 'numeric' });
  const sumIncomes = sumByType(txs, 'income');
  const sumExpenses = sumByType(txs, 'expense');
  const balance = sumIncomes - sumExpenses;
  const categories = Array.from(groupByCategory(txs, 'expense').entries())
    .map(([cat, cents]) => `<tr><td>${cat}</td><td>${formatCurrencyHR(cents)}</td></tr>`)
    .join('');
  const top5 = Array.from(groupByCategory(txs, 'expense').entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([cat, cents]) => `<li>${cat}: ${formatCurrencyHR(cents)}</li>`)
    .join('');
  const txRows = txs
    .map(tx => `
      <tr>
        <td>${tx.date}</td>
        <td>${tx.type}</td>
        <td>${tx.title}</td>
        <td>${normalizeCategory(tx.category)}</td>
        <td>${formatCurrencyHR(tx.amountCents)}</td>
      </tr>
    `)
    .join('');
  const html = `
    <html>
      <head>
        <title>Izvještaj ${monthLabel}</title>
        <style>
          body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; padding: 24px; }
          h1, h2 { margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #94a3b8; padding: 6px 8px; font-size: 13px; }
          ul { margin-top: 8px; }
        </style>
      </head>
      <body>
        <h1>Financijski izvještaj – ${monthLabel}</h1>
        <section>
          <h2>Sažetak</h2>
          <p>Prihodi: ${formatCurrencyHR(sumIncomes)}</p>
          <p>Troškovi: ${formatCurrencyHR(sumExpenses)}</p>
          <p>Saldo: ${formatCurrencyHR(balance)}</p>
        </section>
        <section>
          <h2>Troškovi po kategorijama</h2>
          <table>
            <thead><tr><th>Kategorija</th><th>Iznos</th></tr></thead>
            <tbody>${categories}</tbody>
          </table>
          <h3>Top 5 kategorija</h3>
          <ul>${top5 || '<li>Nema podataka</li>'}</ul>
        </section>
        <section>
          <h2>Popis transakcija</h2>
          <table>
            <thead><tr><th>Datum</th><th>Tip</th><th>Naziv</th><th>Kategorija</th><th>Iznos</th></tr></thead>
            <tbody>${txRows}</tbody>
          </table>
        </section>
      </body>
    </html>
  `;
  const win = window.open('', '_blank');
  if (!win) {
    alert('Omogući pop-up prozore za PDF.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
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
    if (state.locked) return;
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
      document.getElementById('accountMenu').hidden = true;
      document.getElementById('moreMenu').hidden = true;
      document.getElementById('moreMenuBtn').setAttribute('aria-expanded', 'false');
      document.getElementById('accountMenuBtn').setAttribute('aria-expanded', 'false');
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

function setupMenus() {
  const accountBtn = document.getElementById('accountMenuBtn');
  const accountMenu = document.getElementById('accountMenu');
  accountBtn.addEventListener('click', event => {
    const open = accountMenu.hidden;
    accountMenu.hidden = !open;
    accountBtn.setAttribute('aria-expanded', String(open));
    event.stopPropagation();
  });

  const moreBtn = document.getElementById('moreMenuBtn');
  const moreMenu = document.getElementById('moreMenu');
  moreBtn.addEventListener('click', event => {
    const open = moreMenu.hidden;
    moreMenu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
    event.stopPropagation();
  });

  document.addEventListener('click', event => {
    if (!accountMenu.hidden && !accountMenu.contains(event.target) && event.target !== accountBtn) {
      accountMenu.hidden = true;
      accountBtn.setAttribute('aria-expanded', 'false');
    }
    if (!moreMenu.hidden && !moreMenu.contains(event.target) && event.target !== moreBtn) {
      moreMenu.hidden = true;
      moreBtn.setAttribute('aria-expanded', 'false');
    }
  });

  document.getElementById('btnExport').addEventListener('click', () => { accountMenu.hidden = true; exportAccount(); });
  document.getElementById('btnImport').addEventListener('click', () => {
    accountMenu.hidden = true;
    document.getElementById('importFile').click();
  });
  document.getElementById('importFile').addEventListener('change', event => {
    const file = event.target.files?.[0];
    if (file) importAccount(file);
    event.target.value = '';
  });

  document.getElementById('openFilterDrawer').addEventListener('click', () => { moreMenu.hidden = true; openDrawer('#filterDrawer'); });
  document.getElementById('btnExportCSV').addEventListener('click', () => { moreMenu.hidden = true; exportMonthCSV(state.selectedMonth); });
  document.getElementById('btnExportPDF').addEventListener('click', () => { moreMenu.hidden = true; exportMonthPDF(state.selectedMonth); });
  document.getElementById('backupToggle').addEventListener('change', event => {
    state.settings.weeklyBackup = event.target.checked;
    saveSettings(state.settings);
    moreMenu.hidden = true;
  });
  document.getElementById('openBudgets').addEventListener('click', () => { moreMenu.hidden = true; openModal('#budgetsModal'); });
  document.getElementById('openRecurring').addEventListener('click', () => { moreMenu.hidden = true; openModal('#recurringModal'); });
  document.getElementById('openGoals').addEventListener('click', () => { moreMenu.hidden = true; openModal('#goalsModal'); });
  document.getElementById('openAccounts').addEventListener('click', () => { moreMenu.hidden = true; openModal('#accountsModal'); });
  document.getElementById('openTransfer').addEventListener('click', () => { moreMenu.hidden = true; openModal('#transferModal'); });
  document.getElementById('toggleDark').addEventListener('change', event => {
    state.settings.darkMode = event.target.checked;
    applyDarkMode(state.settings.darkMode);
    saveSettings(state.settings);
  });
  document.getElementById('setupPIN').addEventListener('click', () => { moreMenu.hidden = true; openModal('#pinModal'); });
  document.getElementById('openShortcuts').addEventListener('click', () => { moreMenu.hidden = true; openModal('#shortcutsModal'); });
  document.getElementById('openAbout').addEventListener('click', () => { moreMenu.hidden = true; openModal('#aboutModal'); });
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
  document.getElementById('prevDay').addEventListener('click', () => navigateHistory(-1));
  document.getElementById('nextDay').addEventListener('click', () => navigateHistory(1));

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
  document.getElementById('pinForm').addEventListener('submit', handlePinSubmit);
  document.getElementById('clearPin').addEventListener('click', handleClearPin);
  document.getElementById('pinUnlockForm').addEventListener('submit', handlePinUnlock);
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
  const date = new Date(state.historyDate + 'T00:00');
  date.setDate(date.getDate() + delta);
  const monthStart = new Date(state.selectedMonth + '-01T00:00');
  const monthEnd = new Date(state.selectedMonth + '-01T00:00');
  monthEnd.setMonth(monthEnd.getMonth() + 1);
  monthEnd.setDate(0);
  if (date < monthStart || date > monthEnd) return;
  const next = date.toISOString().slice(0, 10);
  setHistoryDate(next);
  renderHistoryDay();
}

function syncHistoryDateForMonth() {
  const days = getDaysInMonth(state.selectedMonth);
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const candidate = days.includes(todayStr) ? todayStr : days[days.length - 1];
  setHistoryDate(candidate);
}

function initApp() {
  ensureAccountId();
  state.transactions = loadTransactions();
  state.settings = loadSettings();
  ensureDefaultAccount(state.settings);
  applyDarkMode(state.settings.darkMode);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = state.settings.lastMonth || currentMonth;
  state.selectedMonth = month;
  document.getElementById('monthPicker').value = month;

  renderAccountsSelects();
  setupMenus();
  bindUI();
  setupKeyboardShortcuts();
  setupTypeFocus();
  focusTitleField();

  document.getElementById('monthPicker').addEventListener('change', event => {
    setSelectedMonth(event.target.value);
    syncHistoryDateForMonth();
    renderKPIs();
    renderCategoryChart();
    renderHistoryDay();
    warnIfBudgetHit();
  });

  updateFiltersForm();
  renderBudgets();
  renderRecurringList();
  renderGoals();
  renderAccountsList();

  syncHistoryDateForMonth();
  maybeOfferWeeklyBackup();
  maybeLockWithPIN();
}

document.addEventListener('DOMContentLoaded', initApp);
