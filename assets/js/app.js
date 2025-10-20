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
const dateField = document.getElementById('date');
const transactionsTitle = document.getElementById('transactions-title');
const chartCanvas = document.getElementById('category-chart');
const chartDescription = document.getElementById('chart-description');
const chartEmptyMessage = document.getElementById('chart-empty');

let currentState = STATE.IDLE;
let deleteTarget = null;
let categoryChart;

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
    dateField.addEventListener('change', handleDateFilterChange);

    tableBody.addEventListener('click', handleDeleteClick);

    deleteDialog.addEventListener('close', handleDialogClose);
});

function initialiseMonthSelector() {
    const today = new Date();
    const currentMonth = formatMonth(today);
    monthInput.value = currentMonth;
    dateField.value = formatDate(today);
}

function handleMonthChange() {
    transitionTo(STATE.IDLE);
    syncDateWithSelectedMonth();
    renderAll();
}

function handleDateFilterChange() {
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
    updateTransactionsTitle(dateField.value);
    renderTable(transactions, dateField.value);
    renderCategoryChart(data, monthKey);
}

function updateTransactionsTitle(selectedDate) {
    if (!transactionsTitle) return;
    if (selectedDate) {
        transactionsTitle.textContent = `Povijest transakcija za ${formatDisplayDate(selectedDate)}`;
    } else {
        transactionsTitle.textContent = 'Povijest transakcija za taj dan';
    }
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

function renderTable(transactions, filterDate) {
    tableBody.innerHTML = '';

    const filteredTransactions = filterDate
        ? transactions.filter(transaction => transaction.date === filterDate)
        : transactions;

    if (filteredTransactions.length === 0) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 6;
        cell.className = 'empty-state';
        cell.textContent = 'Nema zapisa za odabrani dan.';
        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }

    filteredTransactions.forEach(transaction => {
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

function renderCategoryChart(data, activeMonth) {
    if (!chartCanvas) return;

    const monthTransactions = data[activeMonth] ?? [];
    const expenseTotals = monthTransactions
        .filter(transaction => transaction.type === 'expense')
        .reduce((accumulator, transaction) => {
            const category = transaction.category || 'Nerazvrstano';
            const amount = Number(transaction.amount || 0);
            accumulator.set(category, (accumulator.get(category) || 0) + amount);
            return accumulator;
        }, new Map());

    const labels = Array.from(expenseTotals.keys());
    const values = Array.from(expenseTotals.values());
    const total = values.reduce((sum, value) => sum + value, 0);

    if (categoryChart) {
        categoryChart.destroy();
        categoryChart = null;
    }

    if (!labels.length || total <= 0) {
        chartCanvas.style.display = 'none';
        if (chartEmptyMessage) {
            chartEmptyMessage.hidden = false;
        }
        if (chartDescription) {
            chartDescription.textContent = 'Nema troškova za odabrani mjesec.';
        }
        return;
    }

    chartCanvas.style.display = 'block';
    if (chartEmptyMessage) {
        chartEmptyMessage.hidden = true;
    }
    if (chartDescription) {
        chartDescription.textContent = 'Potrošnja po kategorijama u odabranom mjesecu';
    }

    const colors = generateCategoryColors(labels.length);

    categoryChart = new Chart(chartCanvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [
                {
                    data: values,
                    backgroundColor: colors,
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    hoverOffset: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: 8
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 14,
                        font: {
                            family: getComputedStyle(document.body).fontFamily,
                            size: 11
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: context => {
                            const label = context.label || '';
                            const value = Number(context.parsed || 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '58%'
        }
    });
}

function generateCategoryColors(count) {
    const palette = [
        '#1e6f9f',
        '#0f766e',
        '#c0392b',
        '#b7791f',
        '#4c1d95',
        '#0f172a',
        '#16a34a',
        '#be123c',
        '#0284c7',
        '#f97316'
    ];

    const colors = [];
    for (let index = 0; index < count; index += 1) {
        colors.push(palette[index % palette.length]);
    }
    return colors;
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

function escapeHtml(str = '') {
    return String(str).replace(/[&<>"]+/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
    })[c]);
}
