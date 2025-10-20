(function () {
  const STORAGE_KEY = 'fintracker.v1.transactions';
  const SETTINGS_KEY = 'fintracker.v1.settings';

  const monthPicker = document.getElementById('monthPicker');
  const sumIncomesEl = document.getElementById('sumIncomes');
  const sumExpensesEl = document.getElementById('sumExpenses');
  const sumBalanceEl = document.getElementById('sumBalance');
  const cardBalance = document.getElementById('card-balance');
  const form = document.getElementById('txForm');
  const formFields = {
    type: document.getElementById('txType'),
    title: document.getElementById('txTitle'),
    category: document.getElementById('txCategory'),
    amount: document.getElementById('txAmount'),
    date: document.getElementById('txDate'),
    note: document.getElementById('txNote'),
  };
  const chartModeExpenseBtn = document.getElementById('chartModeExpenses');
  const chartModeIncomeBtn = document.getElementById('chartModeIncomes');
  const chartEmpty = document.getElementById('chartEmpty');
  const historyDateLabel = document.getElementById('historyDateLabel');
  const historyDateInput = document.getElementById('historyDate');
  const prevDayBtn = document.getElementById('prevDay');
  const nextDayBtn = document.getElementById('nextDay');
  const tableBody = document.querySelector('#txTable tbody');
  const timeHeader = document.querySelector('#txTable thead .time-col');
  const toast = document.getElementById('toast');
  const modal = document.getElementById('editTxModal');
  const modalCloseBtn = modal.querySelector('.modal-close');
  const modalDismissBtn = modal.querySelector('[data-modal-dismiss]');
  const editForm = document.getElementById('editTxForm');
  const editFields = {
    type: document.getElementById('editTxType'),
    title: document.getElementById('editTxTitleInput'),
    category: document.getElementById('editTxCategory'),
    amount: document.getElementById('editTxAmount'),
    date: document.getElementById('editTxDate'),
    time: document.getElementById('editTxTime'),
    note: document.getElementById('editTxNote'),
  };

  const fmtCurrency = new Intl.NumberFormat('hr-HR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });

  const state = {
    transactions: [],
    settings: { lastMonth: null },
    currentMonth: '',
    currentHistoryDate: '',
    chartMode: 'expense',
    monthCache: new Map(),
    chart: null,
    editingId: null,
    toastTimeout: null,
  };

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        return data;
      }
    } catch (err) {
      console.error('Ne mogu učitati podatke', err);
    }
    return [];
  }

  function saveState(txs) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
  }

  function loadSettings() {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) return {};
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : {};
    } catch (err) {
      console.error('Ne mogu učitati postavke', err);
      return {};
    }
  }

  function saveSettings(settings) {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function uuidv4() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
    const randomByte = window.crypto?.getRandomValues
      ? () => window.crypto.getRandomValues(new Uint8Array(1))[0]
      : () => Math.floor(Math.random() * 256);
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = randomByte() & 0xf;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getMonthRange(yyyyMm) {
    const [year, month] = yyyyMm.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0);
    const pad = n => String(n).padStart(2, '0');
    return {
      start: `${year}-${pad(month)}-01`,
      end: `${year}-${pad(month)}-${pad(end.getDate())}`,
    };
  }

  function filterByMonth(txs, yyyyMm) {
    return txs.filter(tx => tx.date?.slice(0, 7) === yyyyMm);
  }

  function sumByType(txs, type) {
    return txs.reduce((acc, tx) => (tx.type === type ? acc + (tx.amountCents ?? 0) : acc), 0);
  }

  function groupByCategory(txs, type) {
    const groups = {};
    txs.forEach(tx => {
      if (tx.type !== type) return;
      const key = normaliseCategory(tx.category);
      groups[key] = (groups[key] ?? 0) + (tx.amountCents ?? 0);
    });
    return groups;
  }

  function formatCurrency(cents) {
    return fmtCurrency.format((cents ?? 0) / 100);
  }

  function normaliseCategory(value) {
    if (!value) return 'Nedefinirano';
    return value
      .toString()
      .trim()
      .toLowerCase()
      .replace(/(^|\s)([a-zšđčćž])/g, (_, space, char) => `${space}${char.toUpperCase()}`);
  }

  function computeMonthCache(month) {
    if (state.monthCache.has(month)) {
      return state.monthCache.get(month);
    }
    const monthTxs = filterByMonth(state.transactions, month);
    const sumIncomes = sumByType(monthTxs, 'income');
    const sumExpenses = sumByType(monthTxs, 'expense');
    const balance = sumIncomes - sumExpenses;
    const groups = {
      income: groupByCategory(monthTxs, 'income'),
      expense: groupByCategory(monthTxs, 'expense'),
    };
    const payload = { txs: monthTxs, sumIncomes, sumExpenses, balance, groups };
    state.monthCache.set(month, payload);
    return payload;
  }

  function invalidateMonth(month) {
    state.monthCache.delete(month);
  }

  function invalidateAll() {
    state.monthCache.clear();
  }

  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}.`;
  }

  function clampHistoryDate(dateStr, month) {
    const { start, end } = getMonthRange(month);
    if (!dateStr) return start;
    if (dateStr < start) return start;
    if (dateStr > end) return end;
    return dateStr;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add('show');
    if (state.toastTimeout) {
      clearTimeout(state.toastTimeout);
    }
    state.toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
      state.toastTimeout = setTimeout(() => {
        toast.hidden = true;
      }, 300);
    }, 2400);
  }

  function setHistoryDate(dateStr) {
    state.currentHistoryDate = clampHistoryDate(dateStr, state.currentMonth);
    historyDateInput.value = state.currentHistoryDate;
    historyDateLabel.textContent = formatDisplayDate(state.currentHistoryDate);
    const range = getMonthRange(state.currentMonth);
    historyDateInput.min = range.start;
    historyDateInput.max = range.end;
    formFields.date.value = state.currentHistoryDate;
  }

  function renderKPIs() {
    const { sumIncomes, sumExpenses, balance } = computeMonthCache(state.currentMonth);
    sumIncomesEl.textContent = formatCurrency(sumIncomes);
    sumExpensesEl.textContent = formatCurrency(sumExpenses);
    sumBalanceEl.textContent = formatCurrency(balance);
    cardBalance.classList.toggle('positive', balance >= 0);
    cardBalance.classList.toggle('negative', balance < 0);
  }

  function ensureChart() {
    if (state.chart) return state.chart;
    const ctx = document.getElementById('categoryChart').getContext('2d');
    const baseLegendGenerator = Chart.defaults.plugins.legend.labels.generateLabels;
    state.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Iznos',
            data: [],
            backgroundColor: [],
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 16,
              generateLabels(chartInstance) {
                const labels = baseLegendGenerator(chartInstance);
                const dataset = chartInstance.data.datasets[0];
                const total = Array.isArray(dataset?.data)
                  ? dataset.data.reduce((acc, val) => acc + val, 0)
                  : 0;
                return labels.map(item => {
                  const value = dataset?.data?.[item.index] ?? 0;
                  const cents = Math.round(value * 100);
                  const percentage = total ? ((value / total) * 100).toFixed(1) : '0.0';
                  const category = chartInstance.data.labels[item.index] ?? item.text;
                  return {
                    ...item,
                    text: `${category} – ${formatCurrency(cents)} (${percentage}%)`,
                  };
                });
              },
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.parsed;
                const label = context.label || '';
                const data = Array.isArray(context.dataset?.data) ? context.dataset.data : [];
                const datasetTotal = data.reduce((acc, v) => acc + v, 0);
                const percentage = datasetTotal ? ((value / datasetTotal) * 100).toFixed(1) : '0.0';
                return `${label}: ${formatCurrency(value * 100)} (${percentage}%)`;
              },
            },
          },
        },
      },
    });
    return state.chart;
  }

  const palette = [
    '#2563eb',
    '#1f9d55',
    '#f59e0b',
    '#c026d3',
    '#ef4444',
    '#14b8a6',
    '#8b5cf6',
    '#f97316',
    '#0ea5e9',
    '#7f1d1d',
  ];

  function renderChart() {
    const chart = ensureChart();
    const monthData = computeMonthCache(state.currentMonth);
    const type = state.chartMode === 'expense' ? 'expense' : 'income';
    const groups = monthData.groups[type];
    const labels = Object.keys(groups);
    const values = labels.map(label => groups[label] / 100);
    if (!values.length) {
      chart.data.labels = [];
      chart.data.datasets[0].data = [];
      chart.data.datasets[0].backgroundColor = [];
      chart.update();
      chart.canvas.parentElement?.classList.add('empty');
      chartEmpty.hidden = false;
      chart.canvas.style.display = 'none';
      return;
    }
    chart.canvas.parentElement?.classList.remove('empty');
    chartEmpty.hidden = true;
    chart.canvas.style.display = '';
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].backgroundColor = labels.map((_, index) => palette[index % palette.length]);
    chart.update();
  }

  function renderHistoryDay() {
    const monthData = computeMonthCache(state.currentMonth);
    const dayTxs = monthData.txs.filter(tx => tx.date === state.currentHistoryDate);
    dayTxs.sort((a, b) => {
      const timeA = a.time || '00:00';
      const timeB = b.time || '00:00';
      if (timeA === timeB) {
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      }
      return timeA.localeCompare(timeB);
    });
    const hasTime = dayTxs.some(tx => tx.time);
    if (timeHeader) {
      timeHeader.style.display = hasTime ? '' : 'none';
    }

    tableBody.innerHTML = '';
    if (!dayTxs.length) {
      const row = document.createElement('tr');
      row.className = 'empty-row';
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'Nema transakcija za odabrani dan.';
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    dayTxs.forEach(tx => {
      const row = document.createElement('tr');
      row.dataset.txId = tx.id;

      const typeCell = document.createElement('td');
      const pill = document.createElement('span');
      pill.className = `type-pill ${tx.type}`;
      pill.innerHTML = tx.type === 'income' ? '⬆ Prihod' : '⬇ Trošak';
      typeCell.appendChild(pill);

      const titleCell = document.createElement('td');
      titleCell.textContent = tx.title;

      const categoryCell = document.createElement('td');
      categoryCell.textContent = normaliseCategory(tx.category);

      const amountCell = document.createElement('td');
      amountCell.className = 'align-right';
      const amountFormatted = formatCurrency(tx.amountCents);
      amountCell.textContent = tx.type === 'expense' ? `− ${amountFormatted}` : amountFormatted;

      const timeCell = document.createElement('td');
      timeCell.className = 'time-cell';
      timeCell.textContent = tx.time || '';
      timeCell.style.display = hasTime ? '' : 'none';

      const noteCell = document.createElement('td');
      noteCell.textContent = tx.note || '';

      const actionsCell = document.createElement('td');
      const actions = document.createElement('div');
      actions.className = 'table-actions';
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-edit';
      editBtn.textContent = 'Uredi';
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-delete';
      deleteBtn.textContent = 'Obriši';
      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      actionsCell.appendChild(actions);

      row.appendChild(typeCell);
      row.appendChild(titleCell);
      row.appendChild(categoryCell);
      row.appendChild(amountCell);
      row.appendChild(timeCell);
      row.appendChild(noteCell);
      row.appendChild(actionsCell);

      tableBody.appendChild(row);
    });
  }

  function parseAmountToCents(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    let normalised;
    if (trimmed.includes(',')) {
      normalised = trimmed
        .replace(/[^0-9,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    } else {
      normalised = trimmed.replace(/[^0-9.\-]/g, '');
    }
    const amount = Number(normalised);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return Math.round(amount * 100);
  }

  function clearErrors(scope = document) {
    const errors = scope.querySelectorAll('.error');
    errors.forEach(el => {
      el.textContent = '';
    });
  }

  function setError(field, message) {
    const errorEl = document.querySelector(`.error[data-error-for="${field.id}"]`);
    if (errorEl) {
      errorEl.textContent = message;
    }
  }

  function validateForm(fields, scope) {
    let valid = true;
    clearErrors(scope);

    if (!fields.type.value) {
      setError(fields.type, 'Odaberite tip.');
      valid = false;
    }
    if (!fields.title.value.trim()) {
      setError(fields.title, 'Unesite naziv.');
      valid = false;
    }
    if (!fields.category.value.trim()) {
      setError(fields.category, 'Unesite kategoriju.');
      valid = false;
    }
    const amountCents = parseAmountToCents(fields.amount.value);
    if (amountCents === null) {
      setError(fields.amount, 'Unesite iznos veći od 0 (koristite točku ili zarez).');
      valid = false;
    }
    if (!fields.date.value) {
      setError(fields.date, 'Odaberite datum.');
      valid = false;
    }

    return { valid, amountCents };
  }

  function addTransaction(tx) {
    state.transactions.push(tx);
    saveState(state.transactions);
    invalidateMonth(tx.date.slice(0, 7));
  }

  function updateTransaction(id, patch) {
    const idx = state.transactions.findIndex(tx => tx.id === id);
    if (idx === -1) return;
    const original = state.transactions[idx];
    const originalMonth = original.date.slice(0, 7);
    const updated = { ...original, ...patch, updatedAt: new Date().toISOString() };
    state.transactions[idx] = updated;
    saveState(state.transactions);
    invalidateMonth(originalMonth);
    invalidateMonth(updated.date.slice(0, 7));
  }

  function deleteTransaction(id) {
    const idx = state.transactions.findIndex(tx => tx.id === id);
    if (idx === -1) return;
    const month = state.transactions[idx].date.slice(0, 7);
    state.transactions.splice(idx, 1);
    saveState(state.transactions);
    invalidateMonth(month);
  }

  function resetHistoryDateToMonth(month) {
    const today = new Date();
    const [yearStr, monthStr] = month.split('-');
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const day = Math.min(today.getDate(), daysInMonth);
    const desiredDate = `${month}-${String(day).padStart(2, '0')}`;
    setHistoryDate(desiredDate);
  }

  function onFormSubmit(event) {
    event.preventDefault();
    const { valid, amountCents } = validateForm(formFields, form);
    if (!valid) return;

    const now = new Date();
    const dateValue = formFields.date.value;
    const tx = {
      id: uuidv4(),
      type: formFields.type.value,
      title: formFields.title.value.trim(),
      category: formFields.category.value.trim(),
      amountCents,
      date: dateValue,
      time: '',
      note: formFields.note.value.trim(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    addTransaction(tx);

    form.reset();
    formFields.type.focus();
    formFields.date.value = state.currentHistoryDate;

    const txMonth = tx.date.slice(0, 7);
    if (txMonth === state.currentMonth) {
      setHistoryDate(tx.date);
    }
    renderKPIs();
    renderChart();
    renderHistoryDay();
    showToast('Transakcija dodana');
  }

  function onFormReset() {
    clearErrors(form);
    formFields.type.focus();
    formFields.date.value = state.currentHistoryDate;
  }

  function toggleChartMode(mode) {
    state.chartMode = mode;
    chartModeExpenseBtn.classList.toggle('active', mode === 'expense');
    chartModeIncomeBtn.classList.toggle('active', mode === 'income');
    renderChart();
  }

  function stepHistoryDay(step) {
    if (!state.currentHistoryDate) return;
    const date = new Date(state.currentHistoryDate);
    date.setDate(date.getDate() + step);
    const nextDate = date.toISOString().slice(0, 10);
    const clamped = clampHistoryDate(nextDate, state.currentMonth);
    setHistoryDate(clamped);
    renderHistoryDay();
  }

  function openModal(tx) {
    state.editingId = tx.id;
    modal.hidden = false;
    modal.dataset.open = 'true';
    editFields.type.value = tx.type;
    editFields.title.value = tx.title;
    editFields.category.value = tx.category;
    editFields.amount.value = (tx.amountCents / 100).toLocaleString('hr-HR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    editFields.date.value = tx.date;
    editFields.time.value = tx.time || '';
    editFields.note.value = tx.note || '';
    clearErrors(editForm);
    editFields.title.focus();
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.hidden = true;
    delete modal.dataset.open;
    document.body.style.overflow = '';
    state.editingId = null;
  }

  function handleEditSubmit(event) {
    event.preventDefault();
    if (!state.editingId) return;
    const { valid, amountCents } = validateForm(editFields, editForm);
    if (!valid) return;
    const patch = {
      type: editFields.type.value,
      title: editFields.title.value.trim(),
      category: editFields.category.value.trim(),
      amountCents,
      date: editFields.date.value,
      time: editFields.time.value,
      note: editFields.note.value.trim(),
    };
    updateTransaction(state.editingId, patch);
    closeModal();
    if (patch.date.slice(0, 7) === state.currentMonth) {
      setHistoryDate(patch.date);
    } else if (state.currentHistoryDate.slice(0, 7) === state.currentMonth) {
      setHistoryDate(state.currentHistoryDate);
    }
    renderKPIs();
    renderChart();
    renderHistoryDay();
    showToast('Transakcija ažurirana');
  }

  function handleTableClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    const row = event.target.closest('tr');
    if (!row) return;
    const txId = row.dataset.txId;
    const tx = state.transactions.find(item => item.id === txId);
    if (!tx) return;

    if (button.classList.contains('btn-edit')) {
      openModal(tx);
    } else if (button.classList.contains('btn-delete')) {
      if (window.confirm('Sigurno obrisati?')) {
        deleteTransaction(txId);
        if (state.currentHistoryDate.slice(0, 7) !== state.currentMonth) {
          resetHistoryDateToMonth(state.currentMonth);
        }
        renderKPIs();
        renderChart();
        renderHistoryDay();
        showToast('Transakcija obrisana');
      }
    }
  }

  function handleHistoryDateChange() {
    if (!historyDateInput.value) return;
    setHistoryDate(historyDateInput.value);
    renderHistoryDay();
  }

  function onMonthChange() {
    state.currentMonth = monthPicker.value;
    state.settings.lastMonth = state.currentMonth;
    saveSettings(state.settings);
    resetHistoryDateToMonth(state.currentMonth);
    renderKPIs();
    renderChart();
    renderHistoryDay();
  }

  function handleKeyShortcuts(event) {
    if (event.target.closest('#editTxModal[hidden]')) {
      return;
    }
    if (event.key === 'Escape' && modal.dataset.open === 'true') {
      closeModal();
    }
  }

  function handleFormKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      form.requestSubmit();
    }
  }

  function handleEditKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      editForm.requestSubmit();
    }
  }

  function focusNextFieldAfterType() {
    if (formFields.type.value) {
      formFields.title.focus();
    }
  }

  function init() {
    state.transactions = loadState();
    state.settings = { ...state.settings, ...loadSettings() };

    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    state.currentMonth = state.settings.lastMonth || currentMonth;

    monthPicker.value = state.currentMonth;

    resetHistoryDateToMonth(state.currentMonth);

    renderKPIs();
    renderChart();
    renderHistoryDay();
    formFields.type.focus();
  }

  form.addEventListener('submit', onFormSubmit);
  form.addEventListener('reset', onFormReset);
  form.addEventListener('keydown', handleFormKeydown);
  formFields.type.addEventListener('change', focusNextFieldAfterType);

  chartModeExpenseBtn.addEventListener('click', () => toggleChartMode('expense'));
  chartModeIncomeBtn.addEventListener('click', () => toggleChartMode('income'));

  prevDayBtn.addEventListener('click', () => stepHistoryDay(-1));
  nextDayBtn.addEventListener('click', () => stepHistoryDay(1));
  historyDateInput.addEventListener('change', handleHistoryDateChange);

  monthPicker.addEventListener('change', () => {
    invalidateAll();
    onMonthChange();
  });

  tableBody.addEventListener('click', handleTableClick);

  modalCloseBtn.addEventListener('click', closeModal);
  modalDismissBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', event => {
    if (event.target === modal) {
      closeModal();
    }
  });
  document.addEventListener('keydown', handleKeyShortcuts);

  editForm.addEventListener('submit', handleEditSubmit);
  editForm.addEventListener('keydown', handleEditKeydown);
  editFields.type.addEventListener('change', () => editFields.title.focus());

  window.addEventListener('load', init);
})();
