(function () {
  const ACCOUNT_PREFIX = 'ft_account_';
  const ACTIVE_KEY = 'ft_active_account';
  const DEFAULT_CATEGORIES = [
    'Mirovina',
    'Plaća',
    'Hrana',
    'Režije',
    'Gorivo',
    'Lijekovi',
    'Prijevoz',
    'Telekom',
    'Darovi',
    'Usluge',
  ];

  const formatter = new Intl.NumberFormat('hr-HR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });

  const elements = {
    authOverlay: document.getElementById('auth-overlay'),
    authTabs: document.querySelectorAll('.auth-tab'),
    authPanels: document.querySelectorAll('.auth-panel'),
    loginFeedback: document.getElementById('login-feedback'),
    registerFeedback: document.getElementById('register-feedback'),
    localLoginForm: document.getElementById('local-login-form'),
    localAccountSelect: document.getElementById('local-account-select'),
    localPin: document.getElementById('local-pin'),
    removeLocalAccount: document.getElementById('remove-local-account'),
    fileLoginForm: document.getElementById('file-login-form'),
    accountFile: document.getElementById('account-file'),
    filePin: document.getElementById('file-pin'),
    registerForm: document.getElementById('register-form'),
    personalFields: document.getElementById('personal-fields'),
    familyFields: document.getElementById('family-fields'),
    businessFields: document.getElementById('business-fields'),
    layout: document.querySelector('.layout'),
    navButtons: document.querySelectorAll('.nav-button'),
    views: document.querySelectorAll('.view'),
    viewTitle: document.getElementById('view-title'),
    monthSelect: document.getElementById('month-select'),
    budgetForm: document.getElementById('budget-form'),
    budgetAmount: document.getElementById('budget-amount'),
    budgetProgress: document.getElementById('budget-progress'),
    budgetAlert: document.getElementById('budget-alert'),
    incomeTotal: document.getElementById('income-total'),
    expenseTotal: document.getElementById('expense-total'),
    balanceTotal: document.getElementById('balance-total'),
    chartPills: document.querySelectorAll('.chart-pill'),
    chartCanvas: document.getElementById('overview-chart'),
    transactionBody: document.getElementById('transaction-body'),
    transactionForm: document.getElementById('transaction-form'),
    transactionFeedback: document.getElementById('form-feedback'),
    categoryOptions: document.getElementById('category-options'),
    filterForm: document.getElementById('filter-form'),
    filterReset: document.getElementById('filter-reset'),
    historyBody: document.getElementById('history-body'),
    calendar: document.getElementById('history-calendar'),
    printButton: document.getElementById('print-button'),
    statementForm: document.getElementById('statement-form'),
    statementPeriod: document.getElementById('statement-period'),
    statementIssuer: document.getElementById('preview-issuer'),
    statementRecipient: document.getElementById('preview-recipient'),
    statementIncome: document.getElementById('summary-income'),
    statementExpense: document.getElementById('summary-expense'),
    statementBalance: document.getElementById('summary-balance'),
    statementBody: document.getElementById('statement-body'),
    statementNote: document.getElementById('statement-note'),
    statementPlaceDate: document.getElementById('statement-place-date'),
    statementFeedback: document.getElementById('statement-feedback'),
    categoryForm: document.getElementById('category-form'),
    categoryList: document.getElementById('category-list'),
    newCategoryInput: document.getElementById('new-category'),
    saveImagesToggle: document.getElementById('setting-save-images'),
    currencySelect: document.getElementById('setting-currency'),
    downloadBackup: document.getElementById('download-backup'),
    userMenuToggle: document.getElementById('user-menu-toggle'),
    userDropdown: document.getElementById('user-dropdown'),
    confirmDialog: document.getElementById('confirm-dialog'),
    confirmText: document.getElementById('confirm-text'),
    confirmCancel: document.getElementById('confirm-cancel'),
    confirmApprove: document.getElementById('confirm-approve'),
    deleteAccountDialog: document.getElementById('delete-account-dialog'),
    deleteAccountForm: document.getElementById('delete-account-form'),
    deleteConfirmInput: document.getElementById('delete-confirm-input'),
    deleteCancel: document.getElementById('delete-cancel'),
    profileView: document.getElementById('view-profile'),
    profileForm: document.getElementById('profile-form'),
    profileSave: document.getElementById('profile-save'),
    profileFeedback: document.getElementById('profile-feedback'),
    profileFirstName: document.getElementById('profile-first-name'),
    profileLastName: document.getElementById('profile-last-name'),
    profileDob: document.getElementById('profile-dob'),
    profileAddress: document.getElementById('profile-address'),
    profileEmail: document.getElementById('profile-email'),
    accountTypeValue: document.getElementById('account-type-value'),
    accountNameValue: document.getElementById('account-name-value'),
    businessInfo: document.getElementById('business-info'),
  };

  let chartInstance = null;
  let currentView = 'home';
  let activeAccount = null;
  let confirmResolver = null;

  const state = {
    month: currentMonthString(),
    filters: { from: '', to: '', category: '', type: '' },
    chartType: 'pie',
  };

  function currentMonthString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatCurrency(value) {
    return formatter.format(Number(value || 0));
  }

  function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (
      c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
    ).toString(16));
  }

  function b64ToBytes(str) {
    return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
  }

  function bytesToB64(bytes) {
    return btoa(String.fromCharCode(...bytes));
  }

  async function hashPinWithSalt(pin, saltB64) {
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pin);
    const saltBytes = saltB64 ? b64ToBytes(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const data = new Uint8Array(saltBytes.length + pinBytes.length);
    data.set(saltBytes, 0);
    data.set(pinBytes, saltBytes.length);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashBytes = new Uint8Array(hashBuffer);
    return {
      hashBase64: bytesToB64(hashBytes),
      saltBase64: saltB64 || bytesToB64(saltBytes),
    };
  }

  function validatePin(pin) {
    return /^\d{4}$/.test(pin);
  }

  function localStorageKey(id) {
    return `${ACCOUNT_PREFIX}${id}`;
  }

  function listLocalAccounts() {
    const results = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(ACCOUNT_PREFIX)) {
        try {
          const obj = JSON.parse(localStorage.getItem(key));
          if (obj?.meta?.id && obj?.account?.name) {
            results.push({ id: obj.meta.id, name: obj.account.name, type: obj.account.type });
          }
        } catch (err) {
          console.warn('Ne mogu pročitati račun', key, err);
        }
      }
    }
    results.sort((a, b) => a.name.localeCompare(b.name));
    return results;
  }

  function saveAccountToStorage(account) {
    if (!account?.meta?.id) return;
    account.meta.updated_at = new Date().toISOString();
    localStorage.setItem(localStorageKey(account.meta.id), JSON.stringify(account));
    localStorage.setItem(ACTIVE_KEY, account.meta.id);
  }

  function downloadAccountFile(account) {
    const filename = `ft-account-${account.meta.id}.json`;
    const blob = new Blob([JSON.stringify(account, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function loadAccount(id) {
    const raw = localStorage.getItem(localStorageKey(id));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error('Ne mogu učitati račun', err);
      return null;
    }
  }

  function logout() {
    activeAccount = null;
    localStorage.removeItem(ACTIVE_KEY);
    toggleAuthOverlay(true);
    refreshLoginSelect();
  }

  function toggleAuthOverlay(show) {
    elements.authOverlay.hidden = !show;
  }

  function toggleAuthPanel(target) {
    elements.authTabs.forEach((tab) => {
      const isActive = tab.dataset.target === target;
      tab.classList.toggle('is-active', isActive);
    });
    elements.authPanels.forEach((panel) => {
      panel.hidden = panel.id !== `panel-${target}`;
    });
  }

  function refreshLoginSelect() {
    const list = listLocalAccounts();
    elements.localAccountSelect.innerHTML = '';
    if (list.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nema spremljenih računa';
      elements.localAccountSelect.append(opt);
      elements.localAccountSelect.disabled = true;
      elements.localPin.disabled = true;
      elements.removeLocalAccount.hidden = true;
      return;
    }
    elements.localAccountSelect.disabled = false;
    elements.localPin.disabled = false;
    list.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name}`;
      elements.localAccountSelect.append(opt);
    });
    const activeId = localStorage.getItem(ACTIVE_KEY);
    if (activeId && list.some((item) => item.id === activeId)) {
      elements.localAccountSelect.value = activeId;
    }
    elements.removeLocalAccount.hidden = false;
  }

  function setView(view) {
    currentView = view;
    elements.navButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });
    elements.views.forEach((section) => {
      section.hidden = section.id !== `view-${view}`;
    });
    elements.viewTitle.textContent =
      view === 'home'
        ? 'Početna'
        : view === 'manual'
        ? 'Nova stavka'
        : view === 'history'
        ? 'Povijest'
        : view === 'report'
        ? 'Izvještaj'
        : view === 'settings'
        ? 'Postavke'
        : 'Osobni podaci';
    if (view === 'home') {
      renderHome();
    } else if (view === 'manual') {
      renderManual();
    } else if (view === 'history') {
      renderHistory();
    } else if (view === 'report') {
      renderReport();
    } else if (view === 'settings') {
      renderSettings();
    } else if (view === 'profile') {
      renderProfile();
    }
  }

  function ensureCategories() {
    if (!activeAccount.settings) activeAccount.settings = {};
    if (!Array.isArray(activeAccount.settings.categories)) {
      activeAccount.settings.categories = [...DEFAULT_CATEGORIES];
    }
    if (!activeAccount.settings.currency) {
      activeAccount.settings.currency = 'EUR';
    }
    if (typeof activeAccount.settings.save_images !== 'boolean') {
      activeAccount.settings.save_images = false;
    }
  }

  function ensureBudgets() {
    if (!Array.isArray(activeAccount.budgets)) activeAccount.budgets = [];
  }

  function ensureTransactions() {
    if (!Array.isArray(activeAccount.transactions)) activeAccount.transactions = [];
  }

  function initialiseAccount(account) {
    activeAccount = account;
    if (!activeAccount.user) activeAccount.user = {};
    if (!activeAccount.account) activeAccount.account = { type: 'personal', name: '' };
    ensureCategories();
    ensureBudgets();
    ensureTransactions();
    if (!activeAccount.statementProfile) {
      activeAccount.statementProfile = {
        issuerName: 'Financijski tracker',
        issuerAddress: '',
        issuerOib: '',
        recipientName: '',
        recipientAddress: '',
        place: 'Rovinj',
      };
    }
    if (!state.month) {
      state.month = currentMonthString();
    }
    elements.monthSelect.value = state.month;
    toggleAuthOverlay(false);
    saveAccountToStorage(activeAccount);
    setView('home');
    renderAll();
  }

  function renderAll() {
    renderHome();
    renderManual();
    renderHistory();
    renderReport();
    renderSettings();
    renderProfile();
  }

  function getTransactionsForMonth(month) {
    return activeAccount.transactions.filter((tx) => tx.date.startsWith(month));
  }

  function getBudgetForMonth(month) {
    ensureBudgets();
    const entry = activeAccount.budgets.find((b) => b.month === month);
    return entry ? Number(entry.amount) : 0;
  }

  function upsertBudget(month, amount) {
    ensureBudgets();
    const existing = activeAccount.budgets.find((b) => b.month === month);
    if (existing) {
      existing.amount = amount;
    } else {
      activeAccount.budgets.push({ month, amount });
    }
    saveAccountToStorage(activeAccount);
    renderHome();
  }

  function summariseMonth(transactions) {
    let income = 0;
    let expense = 0;
    const byCategory = {};
    transactions.forEach((tx) => {
      const value = Number(tx.amount || 0);
      if (tx.type === 'income') income += value;
      else expense += value;
      if (!byCategory[tx.category]) byCategory[tx.category] = 0;
      byCategory[tx.category] += value;
    });
    return {
      income,
      expense,
      balance: income - expense,
      categories: Object.entries(byCategory).map(([name, value]) => ({ name, value })),
    };
  }

  function buildTrendData() {
    const groups = new Map();
    activeAccount.transactions.forEach((tx) => {
      const month = tx.date.slice(0, 7);
      if (!groups.has(month)) {
        groups.set(month, { income: 0, expense: 0 });
      }
      const bucket = groups.get(month);
      if (tx.type === 'income') bucket.income += Number(tx.amount || 0);
      else bucket.expense += Number(tx.amount || 0);
    });
    const sorted = Array.from(groups.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([ym, values]) => ({ ym, ...values }));
    return sorted;
  }

  function renderBudgetInfo(summary) {
    const budgetAmount = getBudgetForMonth(state.month);
    elements.budgetAmount.value = budgetAmount ? Number(budgetAmount).toFixed(2) : '';
    if (budgetAmount > 0) {
      const diff = budgetAmount - summary.expense;
      const spentRatio = Math.min(1, summary.expense / budgetAmount);
      const percent = Math.round(spentRatio * 100);
      elements.budgetProgress.textContent = `Potrošeno ${formatCurrency(summary.expense)} od ${formatCurrency(
        budgetAmount
      )} (${percent}%)`;
      if (diff < 0) {
        elements.budgetAlert.hidden = false;
        elements.budgetAlert.textContent = `Premašili ste budžet za ${formatCurrency(Math.abs(diff))}.`;
      } else {
        elements.budgetAlert.hidden = true;
      }
    } else {
      elements.budgetProgress.textContent = 'Postavite mjesečni budžet za lakši pregled.';
      elements.budgetAlert.hidden = true;
    }
  }

  function renderHome() {
    if (!activeAccount) return;
    const transactions = getTransactionsForMonth(state.month);
    const summary = summariseMonth(transactions);
    elements.incomeTotal.textContent = formatCurrency(summary.income);
    elements.expenseTotal.textContent = formatCurrency(summary.expense);
    elements.balanceTotal.textContent = formatCurrency(summary.balance);
    renderBudgetInfo(summary);
    renderTransactionTable(transactions);
    renderChart(summary, buildTrendData());
  }

  function renderTransactionTable(transactions) {
    elements.transactionBody.innerHTML = '';
    if (transactions.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = 'Nema stavki za odabrani mjesec.';
      row.append(cell);
      elements.transactionBody.append(row);
      return;
    }
    transactions
      .sort((a, b) => (a.date > b.date ? -1 : 1))
      .forEach((tx) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${tx.date}</td>
          <td>${tx.type === 'income' ? 'Prihod' : 'Trošak'}</td>
          <td>${tx.title}</td>
          <td>${tx.category || ''}</td>
          <td class="align-right">${Number(tx.amount).toFixed(2)}</td>
          <td><button data-id="${tx.id}">Obriši</button></td>
        `;
        elements.transactionBody.append(row);
      });
  }

  function renderManual() {
    if (!activeAccount) return;
    elements.transactionFeedback.textContent = '';
    elements.transactionFeedback.classList.remove('success');
    updateCategoryOptions();
  }

  function renderHistory() {
    if (!activeAccount) return;
    updateFilterOptions();
    applyFilters();
    renderCalendar();
  }

  function renderReport() {
    if (!activeAccount) return;
    populateStatementForm();
    elements.statementFeedback.textContent = '';
    const transactions = getTransactionsForMonth(state.month).slice().sort((a, b) => (a.date > b.date ? 1 : -1));
    const summary = summariseMonth(transactions);
    elements.statementPeriod.textContent = `Razdoblje: ${state.month}`;
    elements.statementIncome.textContent = summary.income.toFixed(2).replace('.', ',');
    elements.statementExpense.textContent = summary.expense.toFixed(2).replace('.', ',');
    elements.statementBalance.textContent = summary.balance.toFixed(2).replace('.', ',');
    elements.statementBody.innerHTML = '';
    if (transactions.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'Nema stavki za odabrano razdoblje.';
      row.append(cell);
      elements.statementBody.append(row);
    } else {
      transactions.forEach((tx) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${tx.date}</td>
          <td>${tx.type === 'income' ? 'Prihod' : 'Trošak'}</td>
          <td>${tx.title}</td>
          <td>${tx.category || ''}</td>
          <td class="align-right">${Number(tx.amount).toFixed(2)}</td>
        `;
        elements.statementBody.append(row);
      });
    }
    elements.statementNote.textContent =
      'Napomena: Iznosi su izraženi u eurima. Dokument je automatski generiran iz aplikacije Financijski tracker.';
    const place = elements.statementForm.place?.value || 'Rovinj';
    const today = new Date().toISOString().slice(0, 10);
    elements.statementPlaceDate.textContent = `Mjesto i datum izdavanja: ${place || 'Rovinj'}, ${today}`;
  }

  function renderSettings() {
    if (!activeAccount) return;
    updateCategoryList();
    elements.saveImagesToggle.checked = !activeAccount.settings.save_images;
    elements.currencySelect.value = activeAccount.settings.currency || 'EUR';
  }

  function renderProfile() {
    if (!activeAccount) return;
    elements.profileFeedback.textContent = '';
    elements.profileFeedback.classList.remove('success');
    const user = activeAccount.user || {};
    elements.profileFirstName.value = user.first_name || '';
    elements.profileLastName.value = user.last_name || '';
    elements.profileDob.value = user.dob || '';
    elements.profileAddress.value = user.address || '';
    elements.profileEmail.value = user.email || '';
    elements.accountTypeValue.value =
      activeAccount.account.type === 'personal'
        ? 'Osobni'
        : activeAccount.account.type === 'family'
        ? 'Obiteljski'
        : 'Poslovni';
    elements.accountNameValue.value = activeAccount.account.name || '';
    if (activeAccount.account.type === 'business' && activeAccount.business) {
      elements.businessInfo.hidden = false;
      elements.businessInfo.innerHTML = `
        <div><strong>OIB</strong><p>${activeAccount.business.oib || '—'}</p></div>
        <div><strong>Sjedište</strong><p>${activeAccount.business.headquarters || '—'}</p></div>
        <div><strong>IBAN</strong><p>${activeAccount.business.iban || '—'}</p></div>
        <div><strong>PDV obveznik</strong><p>${activeAccount.business.vatPayer ? 'Da' : 'Ne'}</p></div>
        <div class="full"><strong>Kontakt osoba</strong><p>${activeAccount.business.contactPerson || '—'}</p></div>
      `;
    } else {
      elements.businessInfo.hidden = true;
      elements.businessInfo.innerHTML = '';
    }
  }

  function renderChart(summary, trend) {
    if (!chartInstance) {
      chartInstance = new Chart(elements.chartCanvas, {
        type: 'pie',
        data: {
          labels: [],
          datasets: [{ data: [], backgroundColor: [] }],
        },
        options: {
          plugins: {
            legend: { position: 'bottom' },
          },
        },
      });
    }
    const palette = ['#2563eb', '#7c3aed', '#059669', '#db2777', '#f97316', '#0ea5e9', '#22c55e'];
    if (state.chartType === 'pie') {
      const labels = summary.categories.map((item) => item.name);
      const data = summary.categories.map((item) => Number(item.value.toFixed(2)));
      chartInstance.config.type = 'pie';
      chartInstance.data.labels = labels.length ? labels : ['Nema podataka'];
      chartInstance.data.datasets = [
        {
          data: data.length ? data : [1],
          backgroundColor: data.length
            ? data.map((_, i) => palette[i % palette.length])
            : ['#e5e7eb'],
        },
      ];
    } else if (state.chartType === 'line') {
      chartInstance.config.type = 'line';
      chartInstance.data.labels = trend.map((item) => item.ym);
      chartInstance.data.datasets = [
        {
          label: 'Prihodi',
          data: trend.map((item) => Number(item.income.toFixed(2))),
          borderColor: '#2563eb',
          tension: 0.35,
          fill: false,
        },
        {
          label: 'Troškovi',
          data: trend.map((item) => Number(item.expense.toFixed(2))),
          borderColor: '#db2777',
          tension: 0.35,
          fill: false,
        },
      ];
    } else {
      chartInstance.config.type = 'bar';
      chartInstance.data.labels = trend.map((item) => item.ym);
      chartInstance.data.datasets = [
        {
          label: 'Prihodi',
          data: trend.map((item) => Number(item.income.toFixed(2))),
          backgroundColor: '#2563eb',
        },
        {
          label: 'Troškovi',
          data: trend.map((item) => Number(item.expense.toFixed(2))),
          backgroundColor: '#db2777',
        },
      ];
    }
    chartInstance.update();
  }

  function updateCategoryOptions() {
    elements.categoryOptions.innerHTML = '';
    (activeAccount.settings.categories || DEFAULT_CATEGORIES).forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      elements.categoryOptions.append(option);
    });
    const currentValue = elements.transactionForm.elements.category.value;
    if (!Array.from(elements.categoryOptions.options).some((opt) => opt.value === currentValue)) {
      const first = elements.categoryOptions.options[0];
      if (first) elements.transactionForm.elements.category.value = first.value;
    }
  }

  function updateCategoryList() {
    elements.categoryList.innerHTML = '';
    activeAccount.settings.categories.forEach((cat) => {
      const li = document.createElement('li');
      li.textContent = cat;
      elements.categoryList.append(li);
    });
  }

  function updateFilterOptions() {
    const select = elements.filterForm.elements.category;
    select.innerHTML = '';
    const allOption = document.createElement('option');
    allOption.value = '';
    allOption.textContent = 'Sve kategorije';
    select.append(allOption);
    activeAccount.settings.categories.forEach((cat) => {
      const option = document.createElement('option');
      option.value = cat;
      option.textContent = cat;
      select.append(option);
    });
  }

  function applyFilters() {
    const { from, to, category, type } = state.filters;
    let transactions = activeAccount.transactions.slice();
    if (from) transactions = transactions.filter((tx) => tx.date >= from);
    if (to) transactions = transactions.filter((tx) => tx.date <= to);
    if (category) transactions = transactions.filter((tx) => tx.category === category);
    if (type) transactions = transactions.filter((tx) => tx.type === type);
    transactions.sort((a, b) => (a.date > b.date ? -1 : 1));
    elements.historyBody.innerHTML = '';
    if (transactions.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'Nema stavki za odabrane filtere.';
      row.append(cell);
      elements.historyBody.append(row);
      return;
    }
    transactions.forEach((tx) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${tx.date}</td>
        <td>${tx.type === 'income' ? 'Prihod' : 'Trošak'}</td>
        <td>${tx.title}</td>
        <td>${tx.category || ''}</td>
        <td class="align-right">${Number(tx.amount).toFixed(2)}</td>
      `;
      elements.historyBody.append(row);
    });
  }

  function renderCalendar() {
    elements.calendar.innerHTML = '';
    const [year, month] = state.month.split('-').map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const startOffset = (firstDay.getDay() + 6) % 7; // Monday as first day
    for (let i = 0; i < startOffset; i += 1) {
      const placeholder = document.createElement('div');
      elements.calendar.append(placeholder);
    }
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateString = `${state.month}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'day';
      cell.textContent = day;
      cell.dataset.date = dateString;
      const sameDayTransactions = activeAccount.transactions.filter((tx) => tx.date === dateString);
      const dot = document.createElement('span');
      if (sameDayTransactions.some((tx) => tx.type === 'income')) {
        dot.className = 'dot income';
      } else if (sameDayTransactions.some((tx) => tx.type === 'expense')) {
        dot.className = 'dot expense';
      }
      if (dot.className) {
        cell.append(dot);
      }
      cell.addEventListener('click', () => {
        state.filters = { from: dateString, to: dateString, category: '', type: '' };
        elements.filterForm.elements.from.value = dateString;
        elements.filterForm.elements.to.value = dateString;
        elements.filterForm.elements.category.value = '';
        elements.filterForm.elements.type.value = '';
        applyFilters();
      });
      elements.calendar.append(cell);
    }
  }

  function addTransaction(data) {
    ensureTransactions();
    activeAccount.transactions.push({
      id: uuidv4(),
      type: data.type,
      title: data.title,
      category: data.category,
      amount: Number(data.amount),
      date: data.date,
      note: data.note || '',
    });
    saveAccountToStorage(activeAccount);
    elements.transactionFeedback.textContent = 'Stavka je spremljena.';
    elements.transactionFeedback.classList.add('success');
    elements.transactionForm.reset();
    const today = new Date().toISOString().slice(0, 10);
    elements.transactionForm.elements.date.value = today;
    renderAll();
  }

  function deleteTransaction(id) {
    const index = activeAccount.transactions.findIndex((tx) => tx.id === id);
    if (index >= 0) {
      activeAccount.transactions.splice(index, 1);
      saveAccountToStorage(activeAccount);
      renderAll();
    }
  }

  function renderStatementPreview(profile) {
    if (!profile) return;
    const issuer = `${profile.issuerName || ''}\n${profile.issuerAddress || ''}${
      profile.issuerOib ? `\nOIB: ${profile.issuerOib}` : ''
    }`.trim();
    const recipient = `${profile.recipientName || ''}\n${profile.recipientAddress || ''}`.trim();
    elements.statementIssuer.textContent = issuer || '—';
    elements.statementRecipient.textContent = recipient || '—';
    elements.statementPlaceDate.textContent = `Mjesto i datum izdavanja: ${
      profile.place || 'Rovinj'
    }, ${new Date().toISOString().slice(0, 10)}`;
  }

  function populateStatementForm() {
    if (!activeAccount?.statementProfile) return;
    const profile = activeAccount.statementProfile;
    elements.statementForm.elements.issuerName.value = profile.issuerName || '';
    elements.statementForm.elements.issuerAddress.value = profile.issuerAddress || '';
    elements.statementForm.elements.issuerOib.value = profile.issuerOib || '';
    elements.statementForm.elements.recipientName.value = profile.recipientName || '';
    elements.statementForm.elements.recipientAddress.value = profile.recipientAddress || '';
    elements.statementForm.elements.place.value = profile.place || 'Rovinj';
    renderStatementPreview(profile);
  }

  function updateSettings() {
    activeAccount.settings.save_images = !elements.saveImagesToggle.checked;
    activeAccount.settings.currency = elements.currencySelect.value;
    saveAccountToStorage(activeAccount);
  }

  function updateProfile(data) {
    const dob = data.dob;
    if (dob) {
      const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
      if (age < 16) {
        elements.profileFeedback.textContent = 'Korisnici mlađi od 16 godina ne mogu koristiti aplikaciju.';
        elements.profileFeedback.classList.remove('success');
        return;
      }
    }
    activeAccount.user.first_name = data.firstName || '';
    activeAccount.user.last_name = data.lastName || '';
    activeAccount.user.dob = data.dob || '';
    activeAccount.user.address = data.address || '';
    activeAccount.account.name = data.accountName || activeAccount.account.name;
    if (activeAccount.account.type === 'family') {
      activeAccount.account.householdName = activeAccount.account.name;
    }
    saveAccountToStorage(activeAccount);
    elements.profileFeedback.textContent = 'Podaci su spremljeni.';
    elements.profileFeedback.classList.add('success');
    renderProfile();
  }

  function showConfirm(message) {
    elements.confirmText.textContent = message;
    elements.confirmDialog.hidden = false;
    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  function hideConfirm(result) {
    elements.confirmDialog.hidden = true;
    if (confirmResolver) confirmResolver(result);
    confirmResolver = null;
  }

  async function registerAccount(form) {
    const formData = new FormData(form);
    const accountType = formData.get('accountType');
    const firstName = formData.get('firstName')?.trim();
    const lastName = formData.get('lastName')?.trim();
    const email = formData.get('email')?.trim();
    const dob = formData.get('dob');
    const address = formData.get('address')?.trim();
    const householdName = formData.get('householdName')?.trim();
    const companyName = formData.get('companyName')?.trim();
    const oib = formData.get('oib')?.trim();
    const headquarters = formData.get('headquarters')?.trim();
    const iban = formData.get('iban')?.trim();
    const vatPayer = formData.get('vatPayer') === 'true';
    const contactPerson = formData.get('contactPerson')?.trim();
    const pin = formData.get('pin');
    const pinConfirm = formData.get('pinConfirm');
    const ageConfirm = formData.get('ageConfirm');

    if (!validatePin(pin)) {
      throw new Error('PIN mora sadržavati točno 4 znamenke.');
    }
    if (pin !== pinConfirm) {
      throw new Error('PIN i potvrda PIN-a nisu isti.');
    }
    if (!ageConfirm) {
      throw new Error('Potvrdite da imate najmanje 16 godina.');
    }
    const age = Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
    if (Number.isFinite(age) && age < 16) {
      throw new Error('Korisnici mlađi od 16 godina ne mogu koristiti aplikaciju.');
    }
    if (accountType === 'family' && !householdName) {
      throw new Error('Unesite naziv kućanstva.');
    }
    if (accountType === 'business' && !companyName) {
      throw new Error('Unesite naziv tvrtke.');
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const { hashBase64, saltBase64 } = await hashPinWithSalt(pin);

    const account = {
      meta: { version: '1.0', created_at: now, id },
      account: {
        type: accountType,
        name:
          accountType === 'personal'
            ? `${firstName} ${lastName}`.trim()
            : accountType === 'family'
            ? householdName
            : companyName,
      },
      user: {
        first_name: firstName,
        last_name: lastName,
        email,
        dob,
        address,
      },
      auth: {
        pin_salt: saltBase64,
        pin_hash: hashBase64,
      },
      settings: {
        save_images: false,
        currency: 'EUR',
        categories: [...DEFAULT_CATEGORIES],
      },
      budgets: [],
      transactions: [],
      statementProfile: {
        issuerName: 'Financijski tracker',
        issuerAddress: '',
        issuerOib: '',
        recipientName: '',
        recipientAddress: '',
        place: 'Rovinj',
      },
    };

    if (accountType === 'family') {
      account.account.householdName = householdName;
    }
    if (accountType === 'business') {
      account.business = {
        oib: oib || '',
        headquarters: headquarters || '',
        iban: iban || '',
        vatPayer,
        contactPerson: contactPerson || '',
      };
    }

    saveAccountToStorage(account);
    downloadAccountFile(account);
    refreshLoginSelect();
    elements.registerFeedback.textContent = 'Račun je kreiran. Datoteka je spremljena.';
    elements.registerFeedback.classList.add('success');
    elements.loginFeedback.textContent = 'Odaberite račun i unesite PIN za prijavu.';
    toggleAuthPanel('login');
  }

  async function loginLocalAccount(id, pin) {
    const account = loadAccount(id);
    if (!account) {
      throw new Error('Račun nije pronađen.');
    }
    if (!validatePin(pin)) {
      throw new Error('PIN mora sadržavati 4 znamenke.');
    }
    const { hashBase64 } = await hashPinWithSalt(pin, account.auth.pin_salt);
    if (hashBase64 !== account.auth.pin_hash) {
      throw new Error('PIN nije ispravan.');
    }
    initialiseAccount(account);
  }

  async function importFromFile(file, pin) {
    const text = await file.text();
    let obj;
    try {
      obj = JSON.parse(text);
    } catch (err) {
      throw new Error('Datoteka nije valjani JSON.');
    }
    if (!obj?.meta?.id || !obj?.auth?.pin_hash || !obj?.auth?.pin_salt) {
      throw new Error('Datoteka nema potrebna polja.');
    }
    if (!validatePin(pin)) {
      throw new Error('PIN mora sadržavati 4 znamenke.');
    }
    const { hashBase64 } = await hashPinWithSalt(pin, obj.auth.pin_salt);
    if (hashBase64 !== obj.auth.pin_hash) {
      throw new Error('PIN nije ispravan.');
    }
    saveAccountToStorage(obj);
    refreshLoginSelect();
    initialiseAccount(obj);
  }

  function handleNavClick(event) {
    const button = event.target.closest('button[data-view]');
    if (!button) return;
    setView(button.dataset.view);
  }

  function handleTransactionSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const amount = Number(formData.get('amount'));
    const date = formData.get('date');
    if (!Number.isFinite(amount) || amount < 0) {
      elements.transactionFeedback.textContent = 'Iznos mora biti pozitivan broj.';
      elements.transactionFeedback.classList.remove('success');
      return;
    }
    if (!date) {
      elements.transactionFeedback.textContent = 'Datum je obavezan.';
      elements.transactionFeedback.classList.remove('success');
      return;
    }
    addTransaction({
      type: formData.get('type'),
      title: formData.get('title').trim(),
      category: formData.get('category'),
      amount,
      date,
      note: formData.get('note')?.trim() || '',
    });
  }

  function handleBudgetSubmit(event) {
    event.preventDefault();
    const amount = Number(elements.budgetAmount.value);
    if (!Number.isFinite(amount) || amount < 0) {
      elements.budgetProgress.textContent = 'Unesite valjan iznos budžeta.';
      return;
    }
    upsertBudget(state.month, amount);
    elements.budgetProgress.textContent = 'Budžet je spremljen.';
  }

  function handleFiltersSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    state.filters = {
      from: formData.get('from') || '',
      to: formData.get('to') || '',
      category: formData.get('category') || '',
      type: formData.get('type') || '',
    };
    applyFilters();
  }

  function resetFilters() {
    state.filters = { from: '', to: '', category: '', type: '' };
    elements.filterForm.reset();
    applyFilters();
  }

  function handleTransactionTableClick(event) {
    if (event.target.matches('button[data-id]')) {
      const id = event.target.dataset.id;
      showConfirm('Jeste li sigurni da želite obrisati ovu stavku?').then((ok) => {
        if (ok) deleteTransaction(id);
      });
    }
  }

  function handleChartToggle(event) {
    const button = event.target.closest('.chart-pill');
    if (!button) return;
    state.chartType = button.dataset.chart;
    elements.chartPills.forEach((pill) => pill.classList.toggle('is-active', pill === button));
    renderHome();
  }

  function handleStatementChange() {
    const formData = new FormData(elements.statementForm);
    const data = Object.fromEntries(formData.entries());
    activeAccount.statementProfile = {
      issuerName: data.issuerName || '',
      issuerAddress: data.issuerAddress || '',
      issuerOib: data.issuerOib || '',
      recipientName: data.recipientName || '',
      recipientAddress: data.recipientAddress || '',
      place: data.place || 'Rovinj',
    };
    saveAccountToStorage(activeAccount);
    renderStatementPreview(activeAccount.statementProfile);
  }

  function handleCategoryAdd(event) {
    event.preventDefault();
    const value = elements.newCategoryInput.value.trim();
    if (!value) return;
    if (!activeAccount.settings.categories.includes(value)) {
      activeAccount.settings.categories.push(value);
      saveAccountToStorage(activeAccount);
      updateCategoryList();
      updateCategoryOptions();
      updateFilterOptions();
    }
    elements.newCategoryInput.value = '';
  }

  function handleUserMenu(event) {
    const action = event.target.dataset.action;
    if (!action) return;
    if (action === 'profile') {
      setView('profile');
    } else if (action === 'logout') {
      logout();
    } else if (action === 'delete') {
      elements.deleteConfirmInput.value = '';
      elements.deleteAccountDialog.hidden = false;
    }
    elements.userDropdown.hidden = true;
    elements.userMenuToggle.setAttribute('aria-expanded', 'false');
  }

  function deleteLocalAccount(id) {
    localStorage.removeItem(localStorageKey(id));
    const active = localStorage.getItem(ACTIVE_KEY);
    if (active === id) localStorage.removeItem(ACTIVE_KEY);
    refreshLoginSelect();
    elements.loginFeedback.textContent = 'Račun je uklonjen s ovog računala.';
  }

  function bindEvents() {
    elements.authTabs.forEach((tab) =>
      tab.addEventListener('click', () => toggleAuthPanel(tab.dataset.target))
    );

    elements.localLoginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const accountId = elements.localAccountSelect.value;
      const pin = elements.localPin.value;
      loginLocalAccount(accountId, pin)
        .then(() => {
          elements.localPin.value = '';
          elements.loginFeedback.textContent = '';
        })
        .catch((err) => {
          elements.loginFeedback.textContent = err.message;
        });
    });

    elements.removeLocalAccount.addEventListener('click', () => {
      const accountId = elements.localAccountSelect.value;
      if (!accountId) return;
      showConfirm('Obrisati lokalnu kopiju računa?').then((ok) => {
        if (ok) deleteLocalAccount(accountId);
      });
    });

    elements.fileLoginForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const file = elements.accountFile.files?.[0];
      const pin = elements.filePin.value;
      if (!file) {
        elements.loginFeedback.textContent = 'Odaberite datoteku.';
        return;
      }
      importFromFile(file, pin).catch((err) => {
        elements.loginFeedback.textContent = err.message;
      });
    });

    elements.registerForm.addEventListener('submit', (event) => {
      event.preventDefault();
      registerAccount(event.target).catch((err) => {
        elements.registerFeedback.textContent = err.message;
        elements.registerFeedback.classList.remove('success');
      });
    });

    Array.from(elements.registerForm.elements.accountType).forEach((radio) =>
      radio.addEventListener('change', () => updateRegisterFields(radio.value))
    );

    elements.navButtons.forEach((button) => button.addEventListener('click', handleNavClick));
    elements.monthSelect.addEventListener('change', () => {
      state.month = elements.monthSelect.value;
      renderAll();
    });
    elements.transactionForm.addEventListener('submit', handleTransactionSubmit);
    elements.transactionBody.addEventListener('click', handleTransactionTableClick);
    elements.budgetForm.addEventListener('submit', handleBudgetSubmit);
    elements.chartPills.forEach((pill) => pill.addEventListener('click', handleChartToggle));
    elements.filterForm.addEventListener('submit', handleFiltersSubmit);
    elements.filterReset.addEventListener('click', resetFilters);
    elements.printButton.addEventListener('click', () => window.print());
    elements.statementForm.addEventListener('input', handleStatementChange);
    elements.categoryForm.addEventListener('submit', handleCategoryAdd);
    elements.saveImagesToggle.addEventListener('change', updateSettings);
    elements.currencySelect.addEventListener('change', updateSettings);
    elements.downloadBackup.addEventListener('click', () => {
      if (activeAccount) downloadAccountFile(activeAccount);
    });
    elements.userMenuToggle.addEventListener('click', () => {
      const expanded = elements.userMenuToggle.getAttribute('aria-expanded') === 'true';
      elements.userMenuToggle.setAttribute('aria-expanded', String(!expanded));
      elements.userDropdown.hidden = expanded;
    });
    elements.userDropdown.addEventListener('click', handleUserMenu);
    elements.confirmCancel.addEventListener('click', () => hideConfirm(false));
    elements.confirmApprove.addEventListener('click', () => hideConfirm(true));
    elements.deleteCancel.addEventListener('click', () => {
      elements.deleteAccountDialog.hidden = true;
    });
    elements.deleteAccountForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (elements.deleteConfirmInput.value !== 'OBRIŠI') return;
      const id = activeAccount?.meta?.id;
      elements.deleteAccountDialog.hidden = true;
      if (id) {
        deleteLocalAccount(id);
        logout();
      }
    });
    elements.profileSave.addEventListener('click', () => {
      const data = {
        firstName: elements.profileFirstName.value.trim(),
        lastName: elements.profileLastName.value.trim(),
        dob: elements.profileDob.value,
        address: elements.profileAddress.value.trim(),
        accountName: elements.accountNameValue.value.trim(),
      };
      updateProfile(data);
    });
  }

  function updateRegisterFields(type) {
    if (type === 'personal') {
      elements.familyFields.hidden = true;
      elements.businessFields.hidden = true;
    } else if (type === 'family') {
      elements.familyFields.hidden = false;
      elements.businessFields.hidden = true;
    } else {
      elements.familyFields.hidden = true;
      elements.businessFields.hidden = false;
    }
  }

  function init() {
    toggleAuthOverlay(true);
    bindEvents();
    updateRegisterFields('personal');
    refreshLoginSelect();
    const today = new Date().toISOString().slice(0, 10);
    elements.transactionForm.elements.date.value = today;
    elements.filterForm.elements.from.value = '';
    elements.filterForm.elements.to.value = '';
    elements.statementForm.elements.issuerName.value = 'Financijski tracker';
    elements.statementForm.elements.place.value = 'Rovinj';
    renderStatementPreview({
      issuerName: 'Financijski tracker',
      issuerAddress: '',
      issuerOib: '',
      recipientName: '',
      recipientAddress: '',
      place: 'Rovinj',
    });
    document.addEventListener('click', (event) => {
      if (!elements.userMenuToggle.contains(event.target) && !elements.userDropdown.contains(event.target)) {
        elements.userDropdown.hidden = true;
        elements.userMenuToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
