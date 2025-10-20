const STORAGE_KEY = 'financijski-tracker-data-v1';
const STATE = {
    IDLE: 'IDLE',
    FORM_EDITING: 'FORM_EDITING',
    SUBMITTING: 'SUBMITTING',
    DELETING: 'DELETING',
    ERROR: 'ERROR'
};

const monthInput = document.getElementById('month-select');
const form = document.getElementById('transaction-form');
const resetButton = document.getElementById('reset-form');
const feedbackEl = document.getElementById('form-feedback');
const tableBody = document.getElementById('transaction-table-body');
const deleteDialog = document.getElementById('delete-dialog');
const summaryIncome = document.getElementById('summary-income');
const summaryExpense = document.getElementById('summary-expense');
const summaryBalance = document.getElementById('summary-balance');

let currentState = STATE.IDLE;
let deleteTarget = null;
let categoryChart;
let trendChart;

window.addEventListener('DOMContentLoaded', () => {
    initialiseMonthSelector();
    renderAll();

    form.addEventListener('input', () => {
        if (currentState === STATE.IDLE) {
            transitionTo(STATE.FORM_EDITING);
        }
    });

    form.addEventListener('submit', handleFormSubmit);
    resetButton.addEventListener('click', handleFormReset);
    monthInput.addEventListener('change', handleMonthChange);

    tableBody.addEventListener('click', handleDeleteClick);

    deleteDialog.addEventListener('close', handleDialogClose);
});

function initialiseMonthSelector() {
    const today = new Date();
    const currentMonth = formatMonth(today);
    monthInput.value = currentMonth;
    const dateField = document.getElementById('date');
    dateField.value = formatDate(today);
}

function handleMonthChange() {
    transitionTo(STATE.IDLE);
    syncDateWithSelectedMonth();
    renderAll();
}

function handleFormReset() {
    form.reset();
    syncDateWithSelectedMonth();
    feedbackEl.textContent = '';
    feedbackEl.classList.remove('success');
    transitionTo(STATE.IDLE);
}

function handleFormSubmit(event) {
    event.preventDefault();
    const formData = new FormData(form);

    const transaction = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
        type: formData.get('type'),
        name: formData.get('name')?.trim(),
        category: formData.get('category')?.trim(),
        amount: parseFloat((formData.get('amount') ?? '0').toString().replace(',', '.')),
        date: formData.get('date'),
        note: formData.get('note')?.trim() ?? '',
        createdAt: Date.now()
    };

    const validationError = validateTransaction(transaction);
    if (validationError) {
        feedbackEl.textContent = validationError;
        feedbackEl.classList.remove('success');
        transitionTo(STATE.ERROR);
        return;
    }

    transitionTo(STATE.SUBMITTING);

    try {
        const data = loadData();
        const monthKey = monthInput.value;
        const monthTransactions = data[monthKey] ?? [];
        monthTransactions.unshift({ ...transaction });
        data[monthKey] = monthTransactions;
        saveData(data);
        feedbackEl.textContent = 'Transakcija je spremljena.';
        feedbackEl.classList.add('success');
        form.reset();
        syncDateWithSelectedMonth();
        transitionTo(STATE.IDLE);
        renderAll();
    } catch (error) {
        console.error(error);
        feedbackEl.textContent = 'Spremanje nije uspjelo. Pokušajte ponovno.';
        feedbackEl.classList.remove('success');
        transitionTo(STATE.ERROR);
    }
}

function handleDeleteClick(event) {
    const button = event.target.closest('button[data-transaction-id]');
    if (!button) return;

    deleteTarget = button.getAttribute('data-transaction-id');
    transitionTo(STATE.DELETING);
    if (typeof deleteDialog.showModal === 'function') {
        deleteDialog.showModal();
    } else {
        const confirmation = window.confirm('Jeste li sigurni da želite obrisati ovu stavku?');
        if (confirmation) {
            executeDelete();
        } else {
            transitionTo(STATE.IDLE);
        }
    }
}

function handleDialogClose() {
    if (deleteDialog.returnValue === 'confirm') {
        executeDelete();
    } else {
        transitionTo(STATE.IDLE);
    }
}

function executeDelete() {
    if (!deleteTarget) {
        transitionTo(STATE.IDLE);
        return;
    }

    transitionTo(STATE.SUBMITTING);
    try {
        const monthKey = monthInput.value;
        const data = loadData();
        const updatedTransactions = (data[monthKey] ?? []).filter(t => t.id !== deleteTarget);
        data[monthKey] = updatedTransactions;
        saveData(data);
        deleteTarget = null;
        feedbackEl.textContent = '';
        feedbackEl.classList.remove('success');
        transitionTo(STATE.IDLE);
        renderAll();
    } catch (error) {
        console.error(error);
        feedbackEl.textContent = 'Brisanje nije uspjelo. Pokušajte ponovno.';
        feedbackEl.classList.remove('success');
        transitionTo(STATE.ERROR);
    }
}

function transitionTo(newState) {
    currentState = newState;
}

function validateTransaction(transaction) {
    if (!transaction.type) return 'Odaberite tip (Prihod ili Trošak).';
    if (!transaction.name) return 'Unesite naziv transakcije.';
    if (!transaction.category) return 'Unesite kategoriju.';
    if (!Number.isFinite(transaction.amount) || transaction.amount <= 0) {
        return 'Iznos mora biti pozitivan broj (npr. 25.00).';
    }
    if (!transaction.date) return 'Odaberite datum (gggg-mm-dd).';
    return '';
}

function renderAll() {
    const monthKey = monthInput.value;
    const data = loadData();
    const transactions = (data[monthKey] ?? []).slice();
    transactions.sort((a, b) => {
        if (a.date === b.date) {
            const createdA = Number(a.createdAt || 0);
            const createdB = Number(b.createdAt || 0);
            return createdB - createdA;
        }
        return b.date.localeCompare(a.date);
    });

    renderSummary(transactions);
    renderTable(transactions);
    renderCharts(data, monthKey);
}

function renderSummary(transactions) {
    const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const expense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const balance = income - expense;

    summaryIncome.textContent = formatCurrency(income);
    summaryExpense.textContent = formatCurrency(expense);
    summaryBalance.textContent = formatCurrency(balance);
    summaryBalance.classList.toggle('negative', balance < 0);
}

function renderTable(transactions) {
    tableBody.innerHTML = '';

    if (transactions.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'empty-state';
        cell.textContent = 'Nema zapisa za odabrani mjesec.';
        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }

    transactions.forEach(transaction => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDisplayDate(transaction.date)}</td>
            <td>${transaction.type === 'income' ? 'Prihod' : 'Trošak'}</td>
            <td>${escapeHtml(transaction.name)}</td>
            <td>${escapeHtml(transaction.category)}</td>
            <td class="align-right">${formatNumber(Number(transaction.amount || 0))}</td>
            <td class="actions-column">
                <button class="delete-button" data-transaction-id="${transaction.id}">Obriši</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function renderCharts(data, activeMonth) {
    const monthTransactions = data[activeMonth] ?? [];
    renderCategoryChart(monthTransactions);
    renderTrendChart(data, activeMonth);
}

function renderCategoryChart(transactions) {
    const expenseTransactions = transactions.filter(t => t.type === 'expense');
    const grouped = expenseTransactions.reduce((acc, item) => {
        const amount = Number(item.amount || 0);
        acc[item.category] = (acc[item.category] ?? 0) + amount;
        return acc;
    }, {});

    const labels = Object.keys(grouped);
    const values = Object.values(grouped);

    if (categoryChart) {
        categoryChart.destroy();
    }

    const ctx = document.getElementById('category-chart');
    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: generatePalette(values.length),
                borderWidth: 1
            }]
        },
        options: {
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: {
                            family: getComputedStyle(document.body).fontFamily,
                            size: 14
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: context => `${context.label}: ${formatCurrency(context.parsed)}`
                    }
                }
            }
        }
    });
}

function renderTrendChart(data, activeMonth) {
    const months = Array.from(new Set([...Object.keys(data), activeMonth].filter(Boolean))).sort();
    if (months.length === 0) {
        months.push(formatMonth(new Date()));
    }
    const labels = months.map(month => formatMonthLabel(month));
    const incomeValues = months.map(month => (data[month] ?? [])
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0));
    const expenseValues = months.map(month => (data[month] ?? [])
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + Number(t.amount || 0), 0));

    if (trendChart) {
        trendChart.destroy();
    }

    const ctx = document.getElementById('trend-chart');
    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Prihodi',
                    data: incomeValues,
                    borderColor: '#047857',
                    backgroundColor: 'rgba(4, 120, 87, 0.15)',
                    tension: 0.35,
                    fill: true
                },
                {
                    label: 'Troškovi',
                    data: expenseValues,
                    borderColor: '#c0392b',
                    backgroundColor: 'rgba(192, 57, 43, 0.1)',
                    tension: 0.35,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    ticks: {
                        callback: value => formatCurrency(Number(value))
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: {
                            family: getComputedStyle(document.body).fontFamily,
                            size: 14
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: context => `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`
                    }
                }
            }
        }
    });
}

function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return {};
        }
        return JSON.parse(raw);
    } catch (error) {
        console.error('Neuspješno učitavanje podataka', error);
        return {};
    }
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function formatMonth(date) {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    return `${year}-${month}`;
}

function formatDate(date) {
    if (typeof date === 'string') return date;
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function syncDateWithSelectedMonth() {
    const selectedMonth = monthInput.value;
    if (!selectedMonth) return;
    const [year, month] = selectedMonth.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;
    const today = new Date();
    const dateField = document.getElementById('date');
    const day = Math.min(today.getDate(), daysInMonth(month, year));
    dateField.value = formatDate(new Date(year, month - 1, day));
}

function daysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
}

function formatCurrency(value) {
    const absolute = Math.abs(value);
    const formatted = new Intl.NumberFormat('hr-HR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(absolute);
    if (value < 0) {
        return `-€ ${formatted}`;
    }
    return `€ ${formatted}`;
}

function formatNumber(value) {
    return new Intl.NumberFormat('hr-HR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false
    }).format(value);
}

function formatDisplayDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleDateString('hr-HR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function formatMonthLabel(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    if (Number.isNaN(date.getTime())) {
        return monthKey;
    }
    return date.toLocaleDateString('hr-HR', { month: 'short', year: 'numeric' });
}

function generatePalette(count) {
    const baseColors = [
        '#1e6f9f', '#047857', '#c0392b', '#9b59b6', '#f39c12', '#16a085', '#2c3e50', '#e67e22', '#7f8c8d', '#2980b9'
    ];
    if (count <= baseColors.length) {
        return baseColors.slice(0, count);
    }
    const palette = [];
    for (let i = 0; i < count; i += 1) {
        const hue = Math.floor((360 / count) * i);
        palette.push(`hsl(${hue}, 65%, 55%)`);
    }
    return palette;
}

function escapeHtml(str = '') {
    return String(str).replace(/[&<>"]+/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
    })[c]);
}
