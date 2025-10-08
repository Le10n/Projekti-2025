(function () {
  const API_BASE = '';
  const TOKEN_KEY = 'financialTrackerToken';
  const CATEGORY_KEY_PREFIX = 'financialTrackerCategories_';
  const STATEMENT_KEY_PREFIX = 'financialTrackerStatement_';

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
    layout: document.querySelector('.layout'),
    navButtons: document.querySelectorAll('.nav-button'),
    views: document.querySelectorAll('.view'),
    monthSelect: document.getElementById('month-select'),
    applyRecurring: document.getElementById('apply-recurring'),
    userMenuToggle: document.getElementById('user-menu-toggle'),
    userDropdown: document.getElementById('user-dropdown'),
    authOverlay: document.getElementById('auth-overlay'),
    loginForm: document.getElementById('login-form'),
    registerForm: document.getElementById('register-form'),
    loginFeedback: document.getElementById('login-feedback'),
    registerFeedback: document.getElementById('register-feedback'),
    authTabs: document.querySelectorAll('.auth-tab'),
    authPanels: document.querySelectorAll('.auth-panel'),
    confirmDialog: document.getElementById('confirm-dialog'),
    deleteAccountDialog: document.getElementById('delete-account-dialog'),
    deleteAccountForm: document.getElementById('delete-account-form'),
    deleteConfirmInput: document.getElementById('delete-confirm-input'),
    budgetForm: document.getElementById('budget-form'),
    budgetAmount: document.getElementById('budget-amount'),
    budgetMonthLabel: document.getElementById('budget-month'),
    budgetProgress: document.getElementById('budget-progress'),
    incomeTotal: document.getElementById('income-total'),
    expenseTotal: document.getElementById('expense-total'),
    balanceTotal: document.getElementById('balance-total'),
    chartType: document.getElementById('chart-type'),
    categoryOptions: document.getElementById('category-options'),
    transactionForm: document.getElementById('transaction-form'),
    transactionFeedback: document.getElementById('form-feedback'),
    transactionTableBody: document.getElementById('transaction-body'),
    filterForm: document.getElementById('filter-form'),
    filterReset: document.getElementById('filter-reset'),
    calendar: document.getElementById('history-calendar'),
    printButton: document.getElementById('print-button'),
    statementForm: document.getElementById('statement-form'),
    statementFeedback: document.getElementById('statement-feedback'),
    statementPeriod: document.getElementById('statement-period'),
    statementIssuer: document.getElementById('preview-issuer'),
    statementRecipient: document.getElementById('preview-recipient'),
    statementIncome: document.getElementById('summary-income'),
    statementExpense: document.getElementById('summary-expense'),
    statementBalance: document.getElementById('summary-balance'),
    statementBody: document.getElementById('statement-body'),
    statementNote: document.getElementById('statement-note'),
    statementPlaceDate: document.getElementById('statement-place-date'),
    categoryForm: document.getElementById('category-form'),
    categoryList: document.getElementById('category-list'),
    newCategoryInput: document.getElementById('new-category'),
    recurringForm: document.getElementById('recurring-form'),
    recurringFeedback: document.getElementById('recurring-feedback'),
    recurringList: document.getElementById('recurring-list'),
    backupButton: document.getElementById('backup-button'),
    backupList: document.getElementById('backup-list'),
    profileForm: document.getElementById('profile-form'),
    profileFeedback: document.getElementById('profile-feedback'),
    profileFirstName: document.getElementById('profile-first-name'),
    profileLastName: document.getElementById('profile-last-name'),
    profileDob: document.getElementById('profile-dob'),
    profileAddress: document.getElementById('profile-address'),
    accountTypeValue: document.getElementById('account-type-value'),
    accountNameValue: document.getElementById('account-name-value'),
    businessInfo: document.getElementById('business-info'),
  };

  let chartInstance = null;
  let currentDeleteId = null;

  const state = {
    token: null,
    activeView: 'home',
    month: '',
    summary: { income: 0, expense: 0, balance: 0, categories: [] },
    budget: 0,
    monthTransactions: [],
    filteredTransactions: [],
    filters: { from: '', to: '', category: '', type: '' },
    trend: [],
    categories: [...DEFAULT_CATEGORIES],
    recurring: [],
    backups: [],
    profile: null,
    account: null,
    business: null,
    chartType: 'pie',
    statementProfile: {
      issuerName: 'Financijski tracker',
      issuerAddress: '',
      issuerOib: '',
      recipientName: '',
      recipientAddress: '',
      place: 'Rovinj',
    },
  };

  function authFetch(path, options = {}) {
    if (!state.token) throw new Error('Missing token');
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${state.token}`);
    if (!(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(`${API_BASE}${path}`, { ...options, headers });
  }

  function setToken(token) {
    state.token = token;
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  function currentMonthString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatAmount(value) {
    return formatter.format(Number(value || 0));
  }

  function toggleAuthPanel(target) {
    elements.authTabs.forEach((tab) => tab.classList.toggle('is-active', tab.dataset.target === target));
    elements.authPanels.forEach((panel) => {
      panel.hidden = panel.id !== `panel-${target}`;
    });
  }

  function handleAuthTabs() {
    elements.authTabs.forEach((tab) => {
      tab.addEventListener('click', () => toggleAuthPanel(tab.dataset.target));
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    elements.loginFeedback.textContent = '';
    const formData = new FormData(elements.loginForm);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.get('email'),
          password: formData.get('password'),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Prijava nije uspjela.');
      }
      setToken(data.token);
      await afterAuth();
    } catch (error) {
      elements.loginFeedback.textContent = error.message;
    }
  }

  function getRegistrationPayload(formData) {
    const accountType = formData.get('accountType');
    const payload = {
      accountType,
      email: formData.get('email'),
      password: formData.get('password'),
      personal: {
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        dob: formData.get('dob'),
        address: formData.get('address'),
      },
    };
    if (accountType === 'family') {
      payload.family = { householdName: formData.get('householdName') };
    }
    if (accountType === 'business') {
      payload.business = {
        companyName: formData.get('companyName'),
        oib: formData.get('oib'),
        headquarters: formData.get('headquarters'),
        iban: formData.get('iban'),
        vatPayer: formData.get('vatPayer') === 'on',
        contactPerson: formData.get('contactPerson'),
      };
    }
    return payload;
  }

  async function handleRegister(event) {
    event.preventDefault();
    elements.registerFeedback.textContent = '';
    const confirmAge = document.getElementById('confirm-age');
    if (!confirmAge.checked) {
      elements.registerFeedback.textContent = 'Potrebno je potvrditi da imate 16 ili više godina.';
      return;
    }
    const formData = new FormData(elements.registerForm);
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getRegistrationPayload(formData)),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Registracija nije uspjela.');
      }
      setToken(data.token);
      await afterAuth();
    } catch (error) {
      elements.registerFeedback.textContent = error.message;
    }
  }

  function handleAccountTypeChange() {
    const accountType = document.getElementById('account-type').value;
    const familyFields = document.getElementById('family-fields');
    const businessFields = document.getElementById('business-fields');
    const householdName = document.getElementById('household-name');
    const companyName = document.getElementById('company-name');

    familyFields.hidden = accountType !== 'family';
    businessFields.hidden = accountType !== 'business';

    if (householdName) {
      householdName.required = accountType === 'family';
    }
    if (companyName) {
      companyName.required = accountType === 'business';
    }
  }

  function showApp() {
    elements.authOverlay.style.display = 'none';
    elements.layout.setAttribute('aria-hidden', 'false');
  }

  function hideApp() {
    elements.authOverlay.style.display = 'flex';
    elements.layout.setAttribute('aria-hidden', 'true');
  }

  async function afterAuth() {
    showApp();
    await hydrateProfile();
    await loadCategories();
    await loadMonthData();
    await loadHistory();
    await loadRecurring();
    await loadBackups();
    renderProfile();
    setActiveView('home');
  }

  async function hydrateProfile() {
    const response = await authFetch('/me');
    if (!response.ok) {
      throw new Error('Ne mogu dohvatiti profil.');
    }
    const data = await response.json();
    state.profile = data.user;
    state.account = data.account;
    state.business = data.business || null;
    loadStatementProfile();
  }

  function loadStatementProfile() {
    if (!state.account) return;
    try {
      const stored = localStorage.getItem(`${STATEMENT_KEY_PREFIX}${state.account.id}`);
      if (stored) {
        state.statementProfile = { ...state.statementProfile, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.warn('Ne mogu učitati postavke izvatka', error);
    }
    hydrateStatementForm();
  }

  async function loadCategories() {
    if (!state.account) return;
    try {
      const stored = localStorage.getItem(`${CATEGORY_KEY_PREFIX}${state.account.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length) {
          state.categories = parsed;
        }
      }
    } catch (error) {
      console.warn('Ne mogu učitati kategorije', error);
    }
    syncCategoryOptions();
  }

  function saveCategories() {
    if (!state.account) return;
    localStorage.setItem(`${CATEGORY_KEY_PREFIX}${state.account.id}`, JSON.stringify(state.categories));
    syncCategoryOptions();
  }

  async function loadMonthData() {
    if (!state.month) {
      state.month = currentMonthString();
    }
    elements.monthSelect.value = state.month;
    elements.budgetMonthLabel.textContent = state.month;
    const [summaryRes, budgetRes, transactionsRes, trendRes] = await Promise.all([
      authFetch(`/api/analytics/summary?month=${state.month}`),
      authFetch(`/api/budgets/${state.month}`),
      authFetch(`/api/transactions?month=${state.month}`),
      authFetch('/api/analytics/trend?months=12'),
    ]);
    if (!summaryRes.ok) throw new Error('Ne mogu dohvatiti sažetak.');
    if (!budgetRes.ok) throw new Error('Ne mogu dohvatiti budžet.');
    if (!transactionsRes.ok) throw new Error('Ne mogu dohvatiti transakcije.');
    if (!trendRes.ok) throw new Error('Ne mogu dohvatiti trend.');
    state.summary = await summaryRes.json();
    const budgetData = await budgetRes.json();
    state.budget = budgetData.amount ?? 0;
    state.monthTransactions = await transactionsRes.json();
    state.trend = await trendRes.json();
    renderSummary();
    renderBudget();
    renderChart();
    renderStatement();
    renderCalendar();
  }

  async function loadHistory() {
    const params = new URLSearchParams();
    if (state.filters.from) params.set('from', state.filters.from);
    if (state.filters.to) params.set('to', state.filters.to);
    if (state.filters.category) params.set('category', state.filters.category);
    if (state.filters.type) params.set('type', state.filters.type);
    const response = await authFetch(`/api/transactions${params.toString() ? `?${params.toString()}` : ''}`);
    if (!response.ok) throw new Error('Ne mogu dohvatiti povijest.');
    state.filteredTransactions = await response.json();
    renderHistoryTable();
  }

  async function loadRecurring() {
    const response = await authFetch('/api/recurring');
    if (!response.ok) throw new Error('Ne mogu dohvatiti ponavljanja.');
    state.recurring = await response.json();
    renderRecurring();
  }

  async function loadBackups() {
    const response = await authFetch('/api/backups');
    if (!response.ok) throw new Error('Ne mogu dohvatiti sigurnosne kopije.');
    state.backups = await response.json();
    renderBackups();
  }

  function renderSummary() {
    const { income = 0, expense = 0, balance = 0 } = state.summary;
    elements.incomeTotal.textContent = formatAmount(income);
    elements.expenseTotal.textContent = formatAmount(expense);
    elements.balanceTotal.textContent = formatAmount(balance);
  }

  function renderBudget() {
    elements.budgetAmount.value = state.budget;
    const spent = state.summary?.expense ?? 0;
    if (!state.budget) {
      elements.budgetProgress.innerHTML = '<p>Postavite budžet kako biste pratili potrošnju.</p>';
      return;
    }
    const percentage = Math.min((spent / state.budget) * 100, 100);
    const exceeded = spent > state.budget;
    const difference = Math.abs(spent - state.budget);
    elements.budgetProgress.innerHTML = `
      <p>
        Potrošeno: <strong>${formatAmount(spent)}</strong> / Budžet: <strong>${formatAmount(state.budget)}</strong>
        ${exceeded ? `<span class="tag" style="background: rgba(192,57,43,0.15); color: var(--danger);">Premašili ste budžet za ${formatAmount(difference)}</span>` : ''}
      </p>
      <div class="bar ${exceeded ? 'over' : ''}"><span style="width:${percentage}%"></span></div>
    `;
  }

  function renderChart() {
    const ctx = document.getElementById('chart-canvas');
    if (!ctx) return;
    const type = state.chartType;
    if (elements.chartType.value !== type) {
      elements.chartType.value = type;
    }
    const categories = state.summary?.categories ?? [];
    const trend = state.trend ?? [];
    if (chartInstance) {
      chartInstance.destroy();
    }

    if (type === 'pie') {
      chartInstance = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: categories.map((item) => item.name),
          datasets: [
            {
              data: categories.map((item) => item.value),
              backgroundColor: ['#175676', '#4BA3C3', '#8FC0A9', '#F3DFA2', '#F7A072', '#9C89B8', '#F2D0A9'],
            },
          ],
        },
        options: {
          plugins: { legend: { position: 'bottom' } },
        },
      });
      return;
    }

    const labels = trend.map((item) => item.ym);
    const incomeData = trend.map((item) => item.income || 0);
    const expenseData = trend.map((item) => item.expense || 0);

    if (type === 'line') {
      chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Prihodi',
              data: incomeData,
              fill: false,
              borderColor: '#2e7d32',
              tension: 0.3,
            },
            {
              label: 'Troškovi',
              data: expenseData,
              fill: false,
              borderColor: '#c0392b',
              tension: 0.3,
            },
          ],
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
      });
      return;
    }

    chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Prihodi',
            data: incomeData,
            backgroundColor: 'rgba(46,125,50,0.7)',
          },
          {
            label: 'Troškovi',
            data: expenseData,
            backgroundColor: 'rgba(192,57,43,0.7)',
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  function renderHistoryTable() {
    const filtersActive = Boolean(state.filters.from || state.filters.to || state.filters.category || state.filters.type);
    const list = filtersActive ? state.filteredTransactions : state.monthTransactions;
    elements.transactionTableBody.innerHTML = '';
    if (!list.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 6;
      cell.textContent = filtersActive ? 'Nema stavki za odabrani filter.' : 'Nema stavki za odabrani mjesec.';
      row.appendChild(cell);
      elements.transactionTableBody.appendChild(row);
      return;
    }
    list
      .slice()
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .forEach((item) => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${item.date}</td>
          <td>${item.type === 'income' ? 'Prihod' : 'Trošak'}</td>
          <td>${item.title}</td>
          <td>${item.category || '-'}</td>
          <td class="amount-column">${formatAmount(item.amount)}</td>
          <td><button class="danger-button delete-button" data-id="${item.id}">Obriši</button></td>
        `;
        elements.transactionTableBody.appendChild(row);
      });
  }

  function renderCalendar() {
    if (!elements.calendar) return;
    const month = state.month;
    if (!month) return;
    const [year, monthNumber] = month.split('-').map(Number);
    const firstDay = new Date(year, monthNumber - 1, 1);
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const startDay = firstDay.getDay();
    const offset = (startDay + 6) % 7; // Monday-first
    const totalCells = offset + daysInMonth;
    const cells = [];
    for (let i = 0; i < offset; i += 1) {
      cells.push({ label: '', disabled: true });
    }
    const transactionsByDate = state.monthTransactions.reduce((acc, item) => {
      acc[item.date] = acc[item.date] || [];
      acc[item.date].push(item);
      return acc;
    }, {});
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = `${month}-${String(day).padStart(2, '0')}`;
      const entries = transactionsByDate[dateStr] || [];
      const hasIncome = entries.some((item) => item.type === 'income');
      const hasExpense = entries.some((item) => item.type === 'expense');
      cells.push({
        label: String(day),
        disabled: false,
        date: dateStr,
        hasIncome,
        hasExpense,
      });
    }
    elements.calendar.innerHTML = '';
    cells.forEach((cell) => {
      const div = document.createElement('div');
      div.className = 'calendar-cell';
      if (cell.disabled) {
        div.classList.add('disabled');
        elements.calendar.appendChild(div);
        return;
      }
      div.textContent = cell.label;
      if (cell.hasIncome) {
        const dot = document.createElement('span');
        dot.className = 'dot income';
        div.appendChild(dot);
      }
      if (cell.hasExpense) {
        const dot = document.createElement('span');
        dot.className = 'dot expense';
        dot.style.left = cell.hasIncome ? 'calc(50% + 10px)' : '50%';
        div.appendChild(dot);
      }
      if (state.filters.from === cell.date && state.filters.to === cell.date) {
        div.classList.add('active');
      }
      div.addEventListener('click', () => {
        state.filters = { from: cell.date, to: cell.date, category: '', type: '' };
        elements.filterForm.querySelector('#filter-from').value = cell.date;
        elements.filterForm.querySelector('#filter-to').value = cell.date;
        elements.filterForm.querySelector('#filter-category').value = '';
        elements.filterForm.querySelector('#filter-type').value = '';
        loadHistory();
      });
      elements.calendar.appendChild(div);
    });
  }

  function syncCategoryOptions() {
    elements.categoryOptions.innerHTML = '';
    state.categories
      .slice()
      .sort((a, b) => a.localeCompare(b, 'hr'))
      .forEach((category) => {
        const option = document.createElement('option');
        option.value = category;
        elements.categoryOptions.appendChild(option);
      });
    renderCategoryList();
  }

  function renderCategoryList() {
    elements.categoryList.innerHTML = '';
    state.categories.forEach((category) => {
      const li = document.createElement('li');
      li.innerHTML = `<span class="tag">${category}<button type="button" data-category="${category}">×</button></span>`;
      elements.categoryList.appendChild(li);
    });
  }

  function renderRecurring() {
    elements.recurringList.innerHTML = '';
    if (!state.recurring.length) {
      const li = document.createElement('li');
      li.textContent = 'Još nema ponavljajućih stavki.';
      elements.recurringList.appendChild(li);
      return;
    }
    state.recurring.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'recurring-item';
      li.innerHTML = `
        <div>
          <p><strong>${item.title}</strong> • ${item.category} • ${item.type === 'income' ? 'Prihod' : 'Trošak'}</p>
          <small>${formatAmount(item.amount)} • svaki ${item.dayOfMonth}. u mjesecu${item.note ? ` • ${item.note}` : ''}</small>
        </div>
        <div class="recurring-actions">
          <button type="button" class="secondary-button" data-action="toggle" data-id="${item.id}">
            ${item.active ? 'Deaktiviraj' : 'Aktiviraj'}
          </button>
        </div>
      `;
      elements.recurringList.appendChild(li);
    });
  }

  function renderBackups() {
    elements.backupList.innerHTML = '';
    if (!state.backups.length) {
      const li = document.createElement('li');
      li.textContent = 'Još nema sigurnosnih kopija.';
      elements.backupList.appendChild(li);
      return;
    }
    state.backups.forEach((item) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = `backups/${item.fileName}`;
      link.textContent = item.fileName;
      link.target = '_blank';
      li.appendChild(link);
      const date = document.createElement('span');
      date.textContent = new Date(item.createdAt).toLocaleString('hr-HR');
      li.appendChild(date);
      elements.backupList.appendChild(li);
    });
  }

  function renderProfile() {
    if (!state.profile) return;
    elements.profileFirstName.value = state.profile.first_name || '';
    elements.profileLastName.value = state.profile.last_name || '';
    elements.profileDob.value = state.profile.dob || '';
    elements.profileAddress.value = state.profile.address || '';
    elements.accountTypeValue.textContent =
      state.account?.type === 'personal'
        ? 'Osobni'
        : state.account?.type === 'family'
        ? 'Obiteljski'
        : 'Poslovni';
    elements.accountNameValue.textContent = state.account?.name || '';
    if (state.business && state.account?.type === 'business') {
      elements.businessInfo.innerHTML = `
        <div>OIB: ${state.business.oib || '-'}</div>
        <div>Sjedište: ${state.business.headquarters || '-'}</div>
        <div>IBAN: ${state.business.iban || '-'}</div>
        <div>PDV obveznik: ${state.business.vatPayer ? 'Da' : 'Ne'}</div>
        <div>Kontakt osoba: ${state.business.contactPerson || '-'}</div>
      `;
    } else {
      elements.businessInfo.innerHTML = '';
    }
  }

  function hydrateStatementForm() {
    elements.statementForm.elements.issuerName.value = state.statementProfile.issuerName;
    elements.statementForm.elements.issuerAddress.value = state.statementProfile.issuerAddress;
    elements.statementForm.elements.issuerOib.value = state.statementProfile.issuerOib;
    elements.statementForm.elements.recipientName.value = state.statementProfile.recipientName;
    elements.statementForm.elements.recipientAddress.value = state.statementProfile.recipientAddress;
    elements.statementForm.elements.place.value = state.statementProfile.place;
  }

  function renderStatement() {
    elements.statementPeriod.textContent = state.month;
    const linesIssuer = [state.statementProfile.issuerName, state.statementProfile.issuerAddress, state.statementProfile.issuerOib ? `OIB: ${state.statementProfile.issuerOib}` : '']
      .filter(Boolean)
      .map((line) => `<div>${line}</div>`) 
      .join('');
    elements.statementIssuer.innerHTML = linesIssuer || '<div>________________</div>';
    const recipientLines = [state.statementProfile.recipientName, state.statementProfile.recipientAddress]
      .filter(Boolean)
      .map((line) => `<div>${line}</div>`) 
      .join('');
    elements.statementRecipient.innerHTML = recipientLines || '<div>________________</div>';
    const income = state.summary?.income ?? 0;
    const expense = state.summary?.expense ?? 0;
    const balance = income - expense;
    elements.statementIncome.textContent = formatAmount(income);
    elements.statementExpense.textContent = formatAmount(expense);
    elements.statementBalance.textContent = formatAmount(balance);
    elements.statementBody.innerHTML = '';
    if (!state.monthTransactions.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = 'Nema stavki za odabrani mjesec.';
      row.appendChild(cell);
      elements.statementBody.appendChild(row);
    } else {
      state.monthTransactions
        .slice()
        .sort((a, b) => (a.date > b.date ? 1 : -1))
        .forEach((item) => {
          const row = document.createElement('tr');
          row.innerHTML = `
            <td>${item.date}</td>
            <td>${item.type === 'income' ? 'Prihod' : 'Trošak'}</td>
            <td>${item.title}</td>
            <td>${item.category || '-'}</td>
            <td class="amount-column">${Number(item.amount || 0).toFixed(2).replace('.', ',')}</td>
          `;
          elements.statementBody.appendChild(row);
        });
    }
    const today = new Date().toISOString().slice(0, 10);
    elements.statementPlaceDate.textContent = `${state.statementProfile.place || 'Rovinj'}, ${today}`;
    elements.statementNote.textContent =
      'Napomena: Iznosi su izraženi u eurima. Dokument je automatski generiran iz aplikacije Financijski tracker.';
  }

  function setActiveView(view) {
    state.activeView = view;
    elements.navButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
    elements.views.forEach((section) => {
      section.hidden = section.dataset.view !== view;
    });
    if (view === 'history') {
      renderHistoryTable();
    }
    if (view === 'profile') {
      renderProfile();
    }
  }

  function handleNavClick(event) {
    const button = event.target.closest('.nav-button');
    if (!button) return;
    setActiveView(button.dataset.view);
  }

  function toggleUserMenu() {
    const expanded = elements.userMenuToggle.getAttribute('aria-expanded') === 'true';
    elements.userMenuToggle.setAttribute('aria-expanded', String(!expanded));
    elements.userDropdown.hidden = expanded;
  }

  function closeUserMenu() {
    elements.userMenuToggle.setAttribute('aria-expanded', 'false');
    elements.userDropdown.hidden = true;
  }

  function handleUserMenu(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'profile') {
      closeUserMenu();
      setActiveView('profile');
    }
    if (action === 'logout') {
      setToken(null);
      state.token = null;
      hideApp();
      window.location.reload();
    }
    if (action === 'delete') {
      closeUserMenu();
      if (typeof elements.deleteAccountDialog.showModal === 'function') {
        elements.deleteAccountDialog.showModal();
      }
    }
  }

  async function handleDeleteAccount(event) {
    event.preventDefault();
    if (event.submitter?.value !== 'confirm') {
      elements.deleteAccountDialog.close();
      elements.deleteConfirmInput.value = '';
      return;
    }
    if (elements.deleteConfirmInput.value.trim().toUpperCase() !== 'OBRIŠI') {
      alert('Za potvrdu unesite riječ OBRIŠI.');
      return;
    }
    const response = await authFetch('/me', { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Brisanje nije uspjelo.');
      return;
    }
    elements.deleteAccountDialog.close();
    setToken(null);
    window.location.reload();
  }

  async function handleBudgetSubmit(event) {
    event.preventDefault();
    const amount = Number(elements.budgetAmount.value);
    const response = await authFetch(`/api/budgets/${state.month}`, {
      method: 'PUT',
      body: JSON.stringify({ amount }),
    });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Ne mogu spremiti budžet.');
      return;
    }
    state.budget = amount;
    renderBudget();
  }

  async function handleTransactionSubmit(event) {
    event.preventDefault();
    elements.transactionFeedback.textContent = '';
    const formData = new FormData(elements.transactionForm);
    const payload = {
      type: formData.get('type'),
      title: formData.get('name')?.trim(),
      category: formData.get('category')?.trim(),
      amount: Number(formData.get('amount')),
      date: formData.get('date'),
      note: formData.get('note')?.trim(),
    };
    if (!payload.type || !payload.title || !payload.category || !payload.date || Number.isNaN(payload.amount)) {
      elements.transactionFeedback.textContent = 'Molimo ispunite sva obavezna polja.';
      return;
    }
    const response = await authFetch('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const data = await response.json();
      elements.transactionFeedback.textContent = data.error || 'Ne mogu spremiti stavku.';
      return;
    }
    elements.transactionFeedback.textContent = 'Stavka je spremljena.';
    elements.transactionForm.reset();
    elements.transactionForm.querySelector('#date').value = new Date().toISOString().slice(0, 10);
    await loadMonthData();
    await loadHistory();
  }

  function handleTransactionReset() {
    elements.transactionFeedback.textContent = '';
    elements.transactionForm.querySelector('#date').value = new Date().toISOString().slice(0, 10);
  }

  function handleDeleteClick(event) {
    const button = event.target.closest('.delete-button');
    if (!button) return;
    currentDeleteId = button.dataset.id;
    if (typeof elements.confirmDialog.showModal === 'function') {
      elements.confirmDialog.showModal();
    } else if (confirm('Jeste li sigurni da želite obrisati ovu stavku?')) {
      confirmDelete();
    }
  }

  function handleDialogClose(event) {
    if (event.target.returnValue === 'confirm') {
      confirmDelete();
    } else {
      currentDeleteId = null;
    }
  }

  async function confirmDelete() {
    if (!currentDeleteId) return;
    const response = await authFetch(`/api/transactions/${currentDeleteId}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Ne mogu obrisati stavku.');
    }
    currentDeleteId = null;
    await loadMonthData();
    await loadHistory();
  }

  function handleMonthChange(event) {
    state.month = event.target.value;
    elements.budgetMonthLabel.textContent = state.month;
    loadMonthData();
  }

  async function handleFilterSubmit(event) {
    event.preventDefault();
    const formData = new FormData(elements.filterForm);
    state.filters = {
      from: formData.get('from') || '',
      to: formData.get('to') || '',
      category: formData.get('category') || '',
      type: formData.get('type') || '',
    };
    await loadHistory();
    renderCalendar();
  }

  function handleFilterReset() {
    state.filters = { from: '', to: '', category: '', type: '' };
    elements.filterForm.reset();
    loadHistory();
    renderCalendar();
  }

  function handleChartTypeChange(event) {
    state.chartType = event.target.value;
    renderChart();
  }

  function handlePrint() {
    window.print();
  }

  function handleStatementSubmit(event) {
    event.preventDefault();
    const formData = new FormData(elements.statementForm);
    state.statementProfile = {
      issuerName: formData.get('issuerName').trim() || 'Financijski tracker',
      issuerAddress: formData.get('issuerAddress').trim(),
      issuerOib: formData.get('issuerOib').trim(),
      recipientName: formData.get('recipientName').trim(),
      recipientAddress: formData.get('recipientAddress').trim(),
      place: formData.get('place').trim() || 'Rovinj',
    };
    if (state.account) {
      localStorage.setItem(`${STATEMENT_KEY_PREFIX}${state.account.id}`, JSON.stringify(state.statementProfile));
    }
    renderStatement();
    elements.statementFeedback.textContent = 'Podaci su spremljeni.';
  }

  async function handleCategorySubmit(event) {
    event.preventDefault();
    const value = elements.newCategoryInput.value.trim();
    if (!value) return;
    if (!state.categories.includes(value)) {
      state.categories.push(value);
      saveCategories();
    }
    elements.newCategoryInput.value = '';
  }

  function handleCategoryListClick(event) {
    if (event.target.matches('button[data-category]')) {
      const { category } = event.target.dataset;
      state.categories = state.categories.filter((item) => item !== category);
      saveCategories();
    }
  }

  async function handleRecurringSubmit(event) {
    event.preventDefault();
    elements.recurringFeedback.textContent = '';
    const formData = new FormData(elements.recurringForm);
    const payload = {
      title: formData.get('rec-title').trim(),
      category: formData.get('rec-category').trim(),
      type: formData.get('rec-type'),
      amount: Number(formData.get('rec-amount')),
      dayOfMonth: Number(formData.get('rec-day')),
      note: formData.get('rec-note').trim(),
    };
    if (!payload.title || !payload.category || Number.isNaN(payload.amount) || Number.isNaN(payload.dayOfMonth)) {
      elements.recurringFeedback.textContent = 'Molimo popunite sva polja.';
      return;
    }
    const response = await authFetch('/api/recurring', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      elements.recurringFeedback.textContent = data.error || 'Ne mogu spremiti ponavljanje.';
      return;
    }
    elements.recurringFeedback.textContent = 'Ponavljanje je spremljeno.';
    elements.recurringForm.reset();
    await loadRecurring();
  }

  async function handleRecurringListClick(event) {
    const button = event.target.closest('button[data-action="toggle"]');
    if (!button) return;
    const id = Number(button.dataset.id);
    const recurring = state.recurring.find((item) => item.id === id);
    if (!recurring) return;
    const response = await authFetch(`/api/recurring/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: recurring.title,
        category: recurring.category,
        type: recurring.type,
        amount: recurring.amount,
        dayOfMonth: recurring.dayOfMonth,
        note: recurring.note,
        active: recurring.active ? 0 : 1,
      }),
    });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Ne mogu ažurirati ponavljanje.');
      return;
    }
    await loadRecurring();
  }

  async function handleBackup() {
    const response = await authFetch('/api/backups', { method: 'POST' });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Ne mogu kreirati sigurnosnu kopiju.');
      return;
    }
    await loadBackups();
  }

  async function handleProfileSubmit(event) {
    event.preventDefault();
    const payload = {
      first_name: elements.profileFirstName.value.trim() || null,
      last_name: elements.profileLastName.value.trim() || null,
      dob: elements.profileDob.value || null,
      address: elements.profileAddress.value.trim() || null,
    };
    const response = await authFetch('/me', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) {
      elements.profileFeedback.textContent = data.error || 'Ne mogu spremiti podatke.';
      return;
    }
    elements.profileFeedback.textContent = 'Podaci su spremljeni.';
    await hydrateProfile();
    renderProfile();
  }

  async function handleApplyRecurring() {
    if (!state.month) return;
    const response = await authFetch('/api/recurring/apply', {
      method: 'POST',
      body: JSON.stringify({ month: state.month }),
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error || 'Ne mogu primijeniti ponavljajuće stavke.');
      return;
    }
    alert(`Dodano ponavljajućih stavki: ${data.created}`);
    await loadMonthData();
    await loadHistory();
  }

  function initialiseDates() {
    const today = new Date().toISOString().slice(0, 10);
    elements.transactionForm.querySelector('#date').value = today;
  }

  function bindEvents() {
    handleAuthTabs();
    elements.loginForm.addEventListener('submit', handleLogin);
    elements.registerForm.addEventListener('submit', handleRegister);
    document.getElementById('account-type').addEventListener('change', handleAccountTypeChange);
    elements.navButtons.forEach((link) => link.addEventListener('click', handleNavClick));
    elements.userMenuToggle.addEventListener('click', toggleUserMenu);
    elements.userDropdown.addEventListener('click', handleUserMenu);
    document.addEventListener('click', (event) => {
      if (!elements.userMenuToggle.contains(event.target) && !elements.userDropdown.contains(event.target)) {
        closeUserMenu();
      }
    });
    elements.deleteAccountForm.addEventListener('submit', handleDeleteAccount);
    elements.budgetForm.addEventListener('submit', handleBudgetSubmit);
    elements.transactionForm.addEventListener('submit', handleTransactionSubmit);
    elements.transactionForm.addEventListener('reset', handleTransactionReset);
    elements.transactionTableBody.addEventListener('click', handleDeleteClick);
    elements.confirmDialog.addEventListener('close', handleDialogClose);
    elements.monthSelect.addEventListener('change', handleMonthChange);
    elements.filterForm.addEventListener('submit', handleFilterSubmit);
    elements.filterReset.addEventListener('click', handleFilterReset);
    elements.chartType.addEventListener('change', handleChartTypeChange);
    elements.printButton.addEventListener('click', handlePrint);
    elements.statementForm.addEventListener('submit', handleStatementSubmit);
    elements.categoryForm.addEventListener('submit', handleCategorySubmit);
    elements.categoryList.addEventListener('click', handleCategoryListClick);
    elements.recurringForm.addEventListener('submit', handleRecurringSubmit);
    elements.recurringList.addEventListener('click', handleRecurringListClick);
    elements.backupButton.addEventListener('click', handleBackup);
    elements.profileForm.addEventListener('submit', handleProfileSubmit);
    elements.applyRecurring.addEventListener('click', handleApplyRecurring);
  }

  async function init() {
    bindEvents();
    handleAccountTypeChange();
    initialiseDates();
    state.month = currentMonthString();
    elements.monthSelect.value = state.month;
    elements.budgetMonthLabel.textContent = state.month;
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      setToken(storedToken);
      try {
        await afterAuth();
      } catch (error) {
        console.error('Neuspješan automatski login', error);
        setToken(null);
        hideApp();
      }
    } else {
      hideApp();
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
