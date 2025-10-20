const STORAGE_KEY = 'ft_transactions';
const STATES = Object.freeze({
  IDLE: 'IDLE',
  FORM_EDITING: 'FORM_EDITING',
  SUBMITTING: 'SUBMITTING',
  DELETING: 'DELETING',
  ERROR: 'ERROR',
});

const monthInput = document.getElementById('month-select');
const dateInput = document.getElementById('date');
const typeInput = document.getElementById('type');
const titleInput = document.getElementById('title');
const categoryInput = document.getElementById('category');
const amountInput = document.getElementById('amount');
const noteInput = document.getElementById('note');
const form = document.getElementById('transaction-form');
const incomeTotalEl = document.getElementById('income-total');
const expenseTotalEl = document.getElementById('expense-total');
const balanceTotalEl = document.getElementById('balance-total');
const tableBody = document.getElementById('transaction-body');
const alertBox = document.getElementById('alert');

let pieChart;
let lineChart;
let currentState = STATES.IDLE;
let allTransactions = loadTransactions();

function setState(newState) {
  currentState = newState;
}

function formatEuro(amount) {
  const fixed = Number(amount || 0).toLocaleString('hr-HR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `€ ${fixed}`;
}

function loadTransactions() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Ne mogu učitati transakcije', err);
    return [];
  }
}

function saveTransactions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allTransactions));
}

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function filterByMonth(month) {
  return allTransactions.filter((item) => item.date.startsWith(month));
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : `tx_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function updateSummaries(transactions) {
  let income = 0;
  let expense = 0;
  transactions.forEach((item) => {
    if (item.type === 'income') {
      income += item.amount;
    } else if (item.type === 'expense') {
      expense += item.amount;
    }
  });
  const balance = income - expense;
  incomeTotalEl.textContent = formatEuro(income);
  expenseTotalEl.textContent = formatEuro(expense);
  balanceTotalEl.textContent = formatEuro(balance);
}

function updateTable(transactions) {
  tableBody.innerHTML = '';
  if (transactions.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'muted align-center';
    cell.textContent = 'Nema zapisanih transakcija za ovaj mjesec.';
    row.appendChild(cell);
    tableBody.appendChild(row);
    return;
  }

  const sorted = [...transactions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  sorted.forEach((item) => {
    const row = document.createElement('tr');
    const dateCell = document.createElement('td');
    dateCell.textContent = item.date;
    const typeCell = document.createElement('td');
    typeCell.textContent = item.type === 'income' ? 'Prihod' : 'Trošak';
    const titleCell = document.createElement('td');
    titleCell.textContent = item.title;
    const categoryCell = document.createElement('td');
    categoryCell.textContent = item.category;
    const amountCell = document.createElement('td');
    amountCell.className = 'align-right';
    amountCell.textContent = Number(item.amount).toFixed(2);
    const deleteCell = document.createElement('td');
    deleteCell.className = 'align-center';
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'delete-button';
    deleteBtn.textContent = 'Obriši';
    deleteBtn.addEventListener('click', () => handleDelete(item.id));
    deleteCell.appendChild(deleteBtn);

    row.append(dateCell, typeCell, titleCell, categoryCell, amountCell, deleteCell);
    tableBody.appendChild(row);
  });
}

function buildPieData(transactions) {
  const expenseTotals = new Map();
  transactions
    .filter((item) => item.type === 'expense')
    .forEach((item) => {
      const key = item.category || 'Ostalo';
      expenseTotals.set(key, (expenseTotals.get(key) || 0) + item.amount);
    });
  const labels = Array.from(expenseTotals.keys());
  const data = labels.map((label) => Number(expenseTotals.get(label).toFixed(2)));
  return { labels, data };
}

function buildTrendData() {
  const monthly = new Map();
  allTransactions.forEach((item) => {
    const ym = item.date.slice(0, 7);
    if (!monthly.has(ym)) {
      monthly.set(ym, { income: 0, expense: 0 });
    }
    const bucket = monthly.get(ym);
    if (item.type === 'income') {
      bucket.income += item.amount;
    } else {
      bucket.expense += item.amount;
    }
  });
  const sorted = Array.from(monthly.keys()).sort();
  return sorted.map((ym) => ({
    ym,
    income: Number(monthly.get(ym).income.toFixed(2)),
    expense: Number(monthly.get(ym).expense.toFixed(2)),
  }));
}

function initCharts() {
  const pieCtx = document.getElementById('pie-chart');
  const lineCtx = document.getElementById('line-chart');

  pieChart = new Chart(pieCtx, {
    type: 'pie',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Troškovi',
          data: [],
          backgroundColor: ['#4361ee', '#3a86ff', '#ffadad', '#ffb703', '#8ac926', '#fb5607', '#8338ec', '#06d6a0'],
          borderWidth: 0,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { size: 14 },
          },
        },
      },
    },
  });

  lineChart = new Chart(lineCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Prihodi',
          data: [],
          tension: 0.3,
          borderColor: '#06d6a0',
          backgroundColor: 'rgba(6, 214, 160, 0.2)',
          fill: true,
        },
        {
          label: 'Troškovi',
          data: [],
          tension: 0.3,
          borderColor: '#ef476f',
          backgroundColor: 'rgba(239, 71, 111, 0.18)',
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
        },
      },
      plugins: {
        legend: {
          labels: {
            font: { size: 13 },
          },
        },
        tooltip: {
          callbacks: {
            label(context) {
              const value = context.parsed.y || 0;
              return `${context.dataset.label}: ${formatEuro(value)}`;
            },
          },
        },
      },
    },
  });
}

function updateCharts(monthTransactions) {
  const pieData = buildPieData(monthTransactions);
  pieChart.data.labels = pieData.labels;
  pieChart.data.datasets[0].data = pieData.data;
  pieChart.update();

  const trend = buildTrendData();
  lineChart.data.labels = trend.map((row) => row.ym);
  lineChart.data.datasets[0].data = trend.map((row) => row.income);
  lineChart.data.datasets[1].data = trend.map((row) => row.expense);
  lineChart.update();
}

function resetForm() {
  form.reset();
  typeInput.value = 'expense';
  categoryInput.value = '';
  amountInput.value = '';
  noteInput.value = '';
  titleInput.value = '';
  dateInput.value = buildDefaultDate();
}

function buildDefaultDate() {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function showAlert(message, tone = 'error') {
  alertBox.textContent = message;
  alertBox.hidden = false;
  alertBox.classList.remove('alert-error', 'alert-success');
  alertBox.classList.add(tone === 'success' ? 'alert-success' : 'alert-error');
}

function clearAlert() {
  alertBox.hidden = true;
  alertBox.textContent = '';
  alertBox.classList.remove('alert-error', 'alert-success');
}

function refreshUI() {
  const selectedMonth = monthInput.value;
  const monthTransactions = filterByMonth(selectedMonth);
  updateSummaries(monthTransactions);
  updateTable(monthTransactions);
  updateCharts(monthTransactions);
}

function handleSubmit(event) {
  event.preventDefault();
  clearAlert();
  setState(STATES.SUBMITTING);

  const type = typeInput.value;
  const title = titleInput.value.trim();
  const category = categoryInput.value.trim();
  const amount = Number(amountInput.value);
  const date = dateInput.value;
  const note = noteInput.value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    setState(STATES.ERROR);
    showAlert('Datum mora biti u obliku godina-mjesec-dan (npr. 2025-10-08).');
    return;
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    setState(STATES.ERROR);
    showAlert('Iznos mora biti pozitivan broj (npr. 25.00).');
    return;
  }

  if (!title || !category) {
    setState(STATES.ERROR);
    showAlert('Naziv i kategorija su obavezni.');
    return;
  }

  const transaction = {
    id: generateId(),
    type,
    title,
    category,
    amount: Number(amount.toFixed(2)),
    date,
    note,
    createdAt: new Date().toISOString(),
  };

  try {
    allTransactions.push(transaction);
    saveTransactions();
    setState(STATES.IDLE);
    resetForm();
    refreshUI();
    showAlert('Transakcija je spremljena.', 'success');
  } catch (error) {
    console.error('Spremanje nije uspjelo', error);
    setState(STATES.ERROR);
    showAlert('Spremanje nije uspjelo. Pokušajte ponovno.');
  }
}

function handleDelete(id) {
  setState(STATES.DELETING);
  const confirmed = window.confirm('Jeste li sigurni da želite obrisati ovu stavku?');
  if (!confirmed) {
    setState(STATES.IDLE);
    return;
  }

  try {
    allTransactions = allTransactions.filter((item) => item.id !== id);
    saveTransactions();
    setState(STATES.IDLE);
    refreshUI();
    showAlert('Transakcija je obrisana.', 'success');
  } catch (error) {
    console.error('Brisanje nije uspjelo', error);
    setState(STATES.ERROR);
    showAlert('Spremanje nije uspjelo. Pokušajte ponovno.');
  }
}

function init() {
  initCharts();
  const defaultMonth = getCurrentMonth();
  monthInput.value = defaultMonth;
  dateInput.value = buildDefaultDate();
  refreshUI();

  form.addEventListener('submit', handleSubmit);
  [typeInput, titleInput, categoryInput, amountInput, dateInput, noteInput].forEach((input) => {
    input.addEventListener('input', () => {
      if (currentState !== STATES.FORM_EDITING && currentState !== STATES.SUBMITTING) {
        setState(STATES.FORM_EDITING);
      }
    });
  });

  monthInput.addEventListener('change', () => {
    clearAlert();
    setState(STATES.IDLE);
    refreshUI();
  });
}

document.addEventListener('DOMContentLoaded', init);
