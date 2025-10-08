(function () {
  const storageKey = "financialTrackerData";
  const defaultCategories = [
    "Mirovina",
    "Plaća",
    "Režije",
    "Hrana",
    "Lijekovi",
    "Prijevoz",
    "Darovi",
    "Usluge",
    "Hobi",
    "Štednja",
  ];

  const formatter = new Intl.NumberFormat("hr-HR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });

  const elements = {
    monthSelect: document.getElementById("month-select"),
    incomeTotal: document.getElementById("income-total"),
    expenseTotal: document.getElementById("expense-total"),
    balanceTotal: document.getElementById("balance-total"),
    form: document.getElementById("transaction-form"),
    feedback: document.getElementById("form-feedback"),
    tableBody: document.getElementById("transaction-body"),
    categoryList: document.getElementById("category-options"),
    confirmDialog: document.getElementById("confirm-dialog"),
  };

  let categoryChart;
  let trendChart;
  let currentDeleteId = null;

  const stateMachine = {
    state: "IDLE",
    transitions: {
      IDLE: {
        FILL_FORM: "FORM_EDITING",
        CLICK_DELETE: "DELETING",
        CHANGE_MONTH: "IDLE",
      },
      FORM_EDITING: {
        SUBMIT_FORM: "SUBMITTING",
        CANCEL: "IDLE",
      },
      SUBMITTING: {
        API_OK: "IDLE",
        API_FAIL: "ERROR",
      },
      DELETING: {
        CONFIRM_DELETE: "SUBMITTING",
        CANCEL: "IDLE",
      },
      ERROR: {
        RETRY: "SUBMITTING",
        CANCEL: "IDLE",
      },
    },
    transition(event) {
      const next = this.transitions[this.state]?.[event];
      if (!next) {
        return;
      }
      this.state = next;
    },
  };

  function loadTransactions() {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Ne mogu učitati podatke", error);
      return [];
    }
  }

  function saveTransactions(data) {
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  function formatCurrency(amount) {
    return formatter.format(amount);
  }

  function toMonthValue(dateString) {
    return dateString.slice(0, 7);
  }

  function populateCategories() {
    const uniqueCategories = new Set(defaultCategories);
    loadTransactions().forEach((item) => {
      uniqueCategories.add(item.category);
    });

    elements.categoryList.innerHTML = "";
    Array.from(uniqueCategories)
      .sort((a, b) => a.localeCompare(b, "hr"))
      .forEach((category) => {
        if (!category) return;
        const option = document.createElement("option");
        option.value = category;
        elements.categoryList.appendChild(option);
      });
  }

  function resetFeedback() {
    elements.feedback.textContent = "";
    elements.feedback.className = "feedback";
  }

  function showFeedback(message, type) {
    elements.feedback.textContent = message;
    elements.feedback.className = `feedback ${type}`;
  }

  function getFormData(form) {
    const formData = new FormData(form);
    const type = formData.get("type");
    const name = formData.get("name").trim();
    const category = formData.get("category").trim();
    const amount = Number(formData.get("amount"));
    const date = formData.get("date");
    const note = formData.get("note").trim();

    const errors = [];
    if (!type) errors.push("Odaberite tip transakcije.");
    if (!name) errors.push("Naziv je obavezan.");
    if (!category) errors.push("Kategorija je obavezna.");
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push("Iznos mora biti broj veći od 0 (npr. 25.00).");
    }
    if (!date) errors.push("Datum je obavezan (format GGGG-MM-DD).");

    return {
      type,
      name,
      category,
      amount,
      date,
      note,
      errors,
    };
  }

  function updateSummary(transactions) {
    const incomeTotal = transactions
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + item.amount, 0);
    const expenseTotal = transactions
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + item.amount, 0);
    const balance = incomeTotal - expenseTotal;

    elements.incomeTotal.textContent = formatCurrency(incomeTotal);
    elements.expenseTotal.textContent = formatCurrency(expenseTotal);
    elements.balanceTotal.textContent = formatCurrency(balance);
  }

  function updateTable(transactions) {
    elements.tableBody.innerHTML = "";
    if (!transactions.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "Nema zapisa za odabrani mjesec.";
      row.appendChild(cell);
      elements.tableBody.appendChild(row);
      return;
    }

    const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

    sorted.forEach((item) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Datum">${item.date}</td>
        <td data-label="Tip">${item.type === "income" ? "Prihod" : "Trošak"}</td>
        <td data-label="Naziv">${item.name}</td>
        <td data-label="Kategorija">${item.category}</td>
        <td data-label="Iznos" class="amount-value">${formatCurrency(item.amount)}</td>
        <td data-label="Brisanje">
          <button class="delete-button" data-id="${item.id}">Obriši</button>
        </td>
      `;
      row.title = item.note ? `Bilješka: ${item.note}` : "";
      elements.tableBody.appendChild(row);
    });
  }

  function updateCategoryChart(transactions) {
    const expenseTransactions = transactions.filter(
      (item) => item.type === "expense"
    );

    const categoryTotals = expenseTransactions.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + item.amount;
      return acc;
    }, {});

    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);

    const colors = labels.map((_, index) => {
      const hue = (index * 67) % 360;
      return `hsl(${hue} 70% 55%)`;
    });

    const ctx = document.getElementById("category-chart");

    if (categoryChart) {
      categoryChart.data.labels = labels;
      categoryChart.data.datasets[0].data = data;
      categoryChart.data.datasets[0].backgroundColor = colors;
      categoryChart.update();
      return;
    }

    categoryChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderColor: "#ffffff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              font: {
                size: 14,
              },
            },
          },
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.raw || 0;
                return `${context.label}: ${formatCurrency(value)}`;
              },
            },
          },
        },
      },
    });
  }

  function updateTrendChart(allTransactions) {
    const monthlyTotals = allTransactions.reduce((acc, item) => {
      const month = toMonthValue(item.date);
      if (!acc[month]) {
        acc[month] = { income: 0, expense: 0 };
      }
      if (item.type === "income") {
        acc[month].income += item.amount;
      } else {
        acc[month].expense += item.amount;
      }
      return acc;
    }, {});

    const sortedMonths = Object.keys(monthlyTotals).sort((a, b) => a.localeCompare(b));
    const labels = sortedMonths;
    const incomeData = labels.map((label) => monthlyTotals[label].income);
    const expenseData = labels.map((label) => monthlyTotals[label].expense);

    const ctx = document.getElementById("trend-chart");

    if (trendChart) {
      trendChart.data.labels = labels;
      trendChart.data.datasets[0].data = incomeData;
      trendChart.data.datasets[1].data = expenseData;
      trendChart.update();
      return;
    }

    trendChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Prihodi",
            data: incomeData,
            borderColor: "#1a73e8",
            backgroundColor: "rgba(26, 115, 232, 0.1)",
            tension: 0.3,
            fill: true,
          },
          {
            label: "Troškovi",
            data: expenseData,
            borderColor: "#d32f2f",
            backgroundColor: "rgba(211, 47, 47, 0.1)",
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        scales: {
          y: {
            ticks: {
              callback(value) {
                return formatCurrency(value);
              },
            },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label(context) {
                const value = context.raw || 0;
                return `${context.dataset.label}: ${formatCurrency(value)}`;
              },
            },
          },
          legend: {
            labels: {
              font: {
                size: 14,
              },
            },
          },
        },
      },
    });
  }

  function renderDashboard() {
    const allTransactions = loadTransactions();
    const selectedMonth = elements.monthSelect.value;

    const filtered = allTransactions.filter(
      (item) => toMonthValue(item.date) === selectedMonth
    );

    updateSummary(filtered);
    updateTable(filtered);
    updateCategoryChart(filtered);
    updateTrendChart(allTransactions);
    populateCategories();
  }

  function handleSubmit(event) {
    event.preventDefault();
    resetFeedback();

    stateMachine.transition("SUBMIT_FORM");
    const { type, name, category, amount, date, note, errors } = getFormData(
      elements.form
    );

    if (errors.length) {
      stateMachine.transition("API_FAIL");
      showFeedback(errors.join(" "), "error");
      return;
    }

    try {
      const allTransactions = loadTransactions();
      const newTransaction = {
        id: crypto.randomUUID(),
        type,
        name,
        category,
        amount,
        date,
        note,
        createdAt: new Date().toISOString(),
      };
      allTransactions.push(newTransaction);
      saveTransactions(allTransactions);
      elements.form.reset();
      setDefaultValues();
      stateMachine.transition("API_OK");
      showFeedback("Stavka je spremljena.", "success");
      renderDashboard();
    } catch (error) {
      console.error("Spremanje nije uspjelo", error);
      stateMachine.transition("API_FAIL");
      showFeedback("Spremanje nije uspjelo. Pokušajte ponovno.", "error");
    }
  }

  function setDefaultValues() {
    const today = new Date().toISOString().slice(0, 10);
    const dateInput = document.getElementById("date");
    if (!dateInput.value) {
      dateInput.value = today;
    }
    if (!elements.monthSelect.value) {
      elements.monthSelect.value = today.slice(0, 7);
    }
  }

  function handleReset() {
    resetFeedback();
    stateMachine.transition("CANCEL");
    setDefaultValues();
  }

  function attachTableListeners() {
    elements.tableBody.addEventListener("click", (event) => {
      const button = event.target.closest(".delete-button");
      if (!button) return;
      const id = button.dataset.id;
      currentDeleteId = id;
      stateMachine.transition("CLICK_DELETE");
      openConfirmDialog();
    });
  }

  function openConfirmDialog() {
    if (typeof elements.confirmDialog.showModal === "function") {
      elements.confirmDialog.showModal();
    } else {
      const confirmDelete = window.confirm(
        "Jeste li sigurni da želite obrisati ovu stavku?"
      );
      if (confirmDelete) {
        executeDelete();
      } else {
        stateMachine.transition("CANCEL");
      }
    }
  }

  function executeDelete() {
    if (!currentDeleteId) {
      stateMachine.transition("CANCEL");
      return;
    }

    stateMachine.transition("CONFIRM_DELETE");
    try {
      const allTransactions = loadTransactions();
      const updated = allTransactions.filter((item) => item.id !== currentDeleteId);
      saveTransactions(updated);
      currentDeleteId = null;
      stateMachine.transition("API_OK");
      renderDashboard();
    } catch (error) {
      console.error("Brisanje nije uspjelo", error);
      stateMachine.transition("API_FAIL");
      showFeedback("Brisanje nije uspjelo. Pokušajte ponovno.", "error");
    }
  }

  function handleDialogClose(event) {
    const value = event.target.returnValue;
    if (value === "confirm") {
      executeDelete();
    } else {
      currentDeleteId = null;
      stateMachine.transition("CANCEL");
    }
  }

  function initMonthSelect() {
    const todayMonth = new Date().toISOString().slice(0, 7);
    elements.monthSelect.value = todayMonth;
    elements.monthSelect.addEventListener("change", () => {
      stateMachine.transition("CHANGE_MONTH");
      renderDashboard();
    });
  }

  function initForm() {
    setDefaultValues();
    elements.form.addEventListener("submit", handleSubmit);
    elements.form.addEventListener("reset", handleReset);
    elements.form.addEventListener("input", () => {
      stateMachine.transition("FILL_FORM");
    });
  }

  function initDialog() {
    if (!elements.confirmDialog) return;
    elements.confirmDialog.addEventListener("close", handleDialogClose);
  }

  function init() {
    initMonthSelect();
    initForm();
    initDialog();
    attachTableListeners();
    populateCategories();
    renderDashboard();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
