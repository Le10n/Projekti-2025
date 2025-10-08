(function () {
  const STORAGE_KEY = "financialTrackerTransactions";
  const PROFILE_KEY = "financialTrackerProfile";

  const DEFAULT_CATEGORIES = [
    "Mirovina",
    "Plaća",
    "Hrana",
    "Režije",
    "Gorivo",
    "Lijekovi",
    "Prijevoz",
    "Telekom",
    "Darovi",
    "Usluge",
  ];

  const formatter = new Intl.NumberFormat("hr-HR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });

  const viewDetails = {
    home: "Sažeci i pregled potrošnje za odabrani mjesec.",
    manual: "Ručni unos Prihoda ili Troška.",
    history: "Pregled i brisanje stavki za mjesec.",
    report: "Priprema mjesečnog izvatka spremnog za ispis.",
  };

  const elements = {
    navButtons: document.querySelectorAll(".nav-button"),
    views: document.querySelectorAll(".view"),
    viewTitle: document.getElementById("view-title"),
    viewDescription: document.getElementById("view-description"),
    monthSelect: document.getElementById("month-select"),
    incomeTotal: document.getElementById("income-total"),
    expenseTotal: document.getElementById("expense-total"),
    balanceTotal: document.getElementById("balance-total"),
    tableBody: document.getElementById("transaction-body"),
    confirmDialog: document.getElementById("confirm-dialog"),
    categoryList: document.getElementById("category-options"),
    manualForm: document.getElementById("transaction-form"),
    manualType: document.getElementById("type"),
    manualName: document.getElementById("name"),
    manualCategory: document.getElementById("category"),
    manualAmount: document.getElementById("amount"),
    manualDate: document.getElementById("date"),
    manualNote: document.getElementById("note"),
    manualFeedback: document.getElementById("form-feedback"),
    printButton: document.getElementById("print-button"),
    statementForm: document.getElementById("statement-form"),
    statementFeedback: document.getElementById("statement-feedback"),
    statementIssuerName: document.getElementById("statement-issuer-name"),
    statementIssuerAddress: document.getElementById("statement-issuer-address"),
    statementIssuerOib: document.getElementById("statement-issuer-oib"),
    statementRecipientName: document.getElementById("statement-recipient-name"),
    statementRecipientAddress: document.getElementById("statement-recipient-address"),
    statementPlace: document.getElementById("statement-place"),
    statementPreviewPeriod: document.getElementById("statement-period"),
    statementPreviewIssuer: document.getElementById("preview-issuer"),
    statementPreviewRecipient: document.getElementById("preview-recipient"),
    statementSummaryIncome: document.getElementById("summary-income"),
    statementSummaryExpense: document.getElementById("summary-expense"),
    statementSummaryBalance: document.getElementById("summary-balance"),
    statementTableBody: document.getElementById("statement-body"),
    statementNote: document.getElementById("statement-note"),
    statementPlaceDate: document.getElementById("statement-place-date"),
  };

  let pieChart;
  let currentDeleteId = null;

  const state = {
    activeView: "home",
    month: "",
    transactions: [],
    form: {
      type: "",
      title: "",
      category: "",
      amount: "",
      date: "",
      note: "",
    },
    profile: {
      issuerName: "Financijski tracker",
      issuerAddress: "",
      issuerOib: "",
      recipientName: "",
      recipientAddress: "",
      place: "Rovinj",
    },
  };

  function loadTransactions() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn("Ne mogu učitati transakcije", error);
      return [];
    }
  }

  function saveTransactions(transactions) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }

  function loadProfile() {
    try {
      const stored = localStorage.getItem(PROFILE_KEY);
      if (!stored) {
        return { ...state.profile };
      }
      const parsed = JSON.parse(stored);
      return {
        issuerName: parsed.issuerName || "Financijski tracker",
        issuerAddress: parsed.issuerAddress || "",
        issuerOib: parsed.issuerOib || "",
        recipientName: parsed.recipientName || "",
        recipientAddress: parsed.recipientAddress || "",
        place: parsed.place || "Rovinj",
      };
    } catch (error) {
      console.warn("Ne mogu učitati profil", error);
      return { ...state.profile };
    }
  }

  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }

  function setActiveView(view) {
    state.activeView = view;
    elements.views.forEach((section) => {
      const isActive = section.dataset.view === view;
      section.hidden = !isActive;
    });
    elements.navButtons.forEach((button) => {
      const isActive = button.dataset.view === view;
      button.classList.toggle("is-active", isActive);
    });
    elements.viewTitle.textContent =
      view === "home"
        ? "Početna"
        : view === "manual"
        ? "Nova stavka"
        : view === "history"
        ? "Povijest"
        : "Izvještaj";
    elements.viewDescription.textContent = viewDetails[view] ?? "";

    if (view === "home") {
      updateSummary();
    }
    if (view === "manual") {
      prefillManualForm();
    }
    if (view === "history") {
      renderTable();
    }
    if (view === "report") {
      renderStatement();
    }
  }

  function formatAmount(value) {
    const numeric = Number(value || 0);
    return formatter.format(isNaN(numeric) ? 0 : numeric);
  }

  function currentMonthString() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function filterTransactionsByMonth(transactions, month) {
    return transactions.filter((item) => item.date?.slice(0, 7) === month);
  }

  function updateSummary() {
    const monthlyTransactions = filterTransactionsByMonth(state.transactions, state.month);
    const income = monthlyTransactions
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expense = monthlyTransactions
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const balance = income - expense;

    elements.incomeTotal.textContent = formatAmount(income);
    elements.expenseTotal.textContent = formatAmount(expense);
    elements.balanceTotal.textContent = formatAmount(balance);

    updateChart(monthlyTransactions);
  }

  function updateChart(transactions) {
    const expenseByCategory = transactions
      .filter((item) => item.type === "expense")
      .reduce((acc, item) => {
        const key = item.category || "Nepoznato";
        acc[key] = (acc[key] || 0) + Number(item.amount || 0);
        return acc;
      }, {});

    const ctx = document.getElementById("category-chart");
    if (!ctx) return;
    const labels = Object.keys(expenseByCategory);
    const data = Object.values(expenseByCategory);

    if (pieChart) {
      pieChart.data.labels = labels;
      pieChart.data.datasets[0].data = data;
      pieChart.update();
      return;
    }

    pieChart = new Chart(ctx, {
      type: "pie",
      data: {
        labels,
        datasets: [
          {
            data,
            backgroundColor: [
              "#175676",
              "#4BA3C3",
              "#8FC0A9",
              "#F3DFA2",
              "#F7A072",
              "#9C89B8",
              "#F2D0A9",
            ],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "bottom",
          },
        },
      },
    });
  }

  function renderTable() {
    const monthly = filterTransactionsByMonth(state.transactions, state.month);
    elements.tableBody.innerHTML = "";

    if (!monthly.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "Nema stavki za odabrani mjesec.";
      row.appendChild(cell);
      elements.tableBody.appendChild(row);
      return;
    }

    monthly
      .slice()
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .forEach((item) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${item.date}</td>
          <td>${item.type === "income" ? "Prihod" : "Trošak"}</td>
          <td>${item.title}</td>
          <td>${item.category || "-"}</td>
          <td class="amount-column">${formatAmount(item.amount)}</td>
          <td><button class="danger-button delete-button" data-id="${item.id}">Obriši</button></td>
        `;
        elements.tableBody.appendChild(row);
      });
  }

  function syncCategoryOptions() {
    elements.categoryList.innerHTML = "";
    DEFAULT_CATEGORIES.forEach((category) => {
      const option = document.createElement("option");
      option.value = category;
      elements.categoryList.appendChild(option);
    });
  }

  function prefillManualForm() {
    const today = new Date().toISOString().slice(0, 10);
    elements.manualType.value = state.form.type || "";
    elements.manualName.value = state.form.title || "";
    elements.manualCategory.value = state.form.category || "";
    elements.manualAmount.value = state.form.amount || "";
    elements.manualDate.value = state.form.date || today;
    elements.manualNote.value = state.form.note || "";
  }

  function resetManualForm() {
    state.form = {
      type: "",
      title: "",
      category: "",
      amount: "",
      date: new Date().toISOString().slice(0, 10),
      note: "",
    };
    elements.manualForm.reset();
    prefillManualForm();
    elements.manualFeedback.textContent = "";
  }

  function captureManualState() {
    state.form = {
      type: elements.manualType.value,
      title: elements.manualName.value,
      category: elements.manualCategory.value,
      amount: elements.manualAmount.value,
      date: elements.manualDate.value,
      note: elements.manualNote.value,
    };
  }

  function addTransaction(entry) {
    state.transactions.push(entry);
    saveTransactions(state.transactions);
    updateSummary();
    if (state.activeView === "history") {
      renderTable();
    }
    if (state.activeView === "report") {
      renderStatement();
    }
  }

  function handleManualSubmit(event) {
    event.preventDefault();
    const formData = new FormData(elements.manualForm);
    const type = formData.get("type");
    const title = formData.get("name").trim();
    const category = formData.get("category").trim();
    const amount = Number(formData.get("amount"));
    const date = formData.get("date");
    const note = formData.get("note").trim();

    if (!type || !title || !category || !date || isNaN(amount)) {
      elements.manualFeedback.textContent =
        "Molimo ispunite Tip, Naziv, Kategoriju, Datum i Iznos.";
      return;
    }

    const entry = {
      id: crypto.randomUUID(),
      type,
      title,
      category,
      amount,
      date,
      note,
    };

    addTransaction(entry);
    elements.manualFeedback.textContent = "Stavka je spremljena.";
    resetManualForm();
    setActiveView("home");
  }

  function handleDelete(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("delete-button")) return;

    currentDeleteId = target.dataset.id;
    if (!currentDeleteId) return;

    if (typeof elements.confirmDialog.showModal === "function") {
      elements.confirmDialog.showModal();
    } else if (confirm("Jeste li sigurni da želite obrisati ovu stavku?")) {
      confirmDelete();
    }
  }

  function confirmDelete() {
    if (!currentDeleteId) return;
    state.transactions = state.transactions.filter((item) => item.id !== currentDeleteId);
    saveTransactions(state.transactions);
    updateSummary();
    if (state.activeView === "history") {
      renderTable();
    }
    if (state.activeView === "report") {
      renderStatement();
    }
    currentDeleteId = null;
  }

  function handleDialogClose(event) {
    if (event.target.returnValue === "confirm") {
      confirmDelete();
    } else {
      currentDeleteId = null;
    }
  }

  function handleMonthChange(event) {
    state.month = event.target.value;
    updateSummary();
    if (state.activeView === "history") {
      renderTable();
    }
    if (state.activeView === "report") {
      renderStatement();
    }
  }

  function handleStatementSubmit(event) {
    event.preventDefault();
    const formData = new FormData(elements.statementForm);
    state.profile = {
      issuerName: formData.get("issuerName").trim() || "Financijski tracker",
      issuerAddress: formData.get("issuerAddress").trim(),
      issuerOib: formData.get("issuerOib").trim(),
      recipientName: formData.get("recipientName").trim(),
      recipientAddress: formData.get("recipientAddress").trim(),
      place: formData.get("place").trim() || "Rovinj",
    };
    saveProfile(state.profile);
    renderStatement();
    elements.statementFeedback.textContent = "Podaci su spremljeni.";
  }

  function renderStatement() {
    const { issuerName, issuerAddress, issuerOib, recipientName, recipientAddress, place } =
      state.profile;
    const monthly = filterTransactionsByMonth(state.transactions, state.month)
      .slice()
      .sort((a, b) => (a.date > b.date ? 1 : -1));

    const income = monthly
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expense = monthly
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const balance = income - expense;

    elements.statementPreviewPeriod.textContent = state.month || "";

    const issuerLines = [issuerName];
    if (issuerAddress) issuerLines.push(issuerAddress);
    if (issuerOib) issuerLines.push(`OIB: ${issuerOib}`);
    elements.statementPreviewIssuer.innerHTML = issuerLines
      .filter(Boolean)
      .map((line) => `<div>${line}</div>`)
      .join("");

    const recipientLines = [recipientName || "", recipientAddress || ""]
      .filter(Boolean)
      .map((line) => `<div>${line}</div>`)
      .join("");
    elements.statementPreviewRecipient.innerHTML = recipientLines || "<div>________________</div>";

    const incomeText = formatAmount(income).replace(/\u00a0/g, " ");
    const expenseText = formatAmount(expense).replace(/\u00a0/g, " ");
    const balanceText = formatAmount(balance).replace(/\u00a0/g, " ");

    elements.statementSummaryIncome.textContent = incomeText;
    elements.statementSummaryExpense.textContent = expenseText;
    elements.statementSummaryBalance.textContent = balanceText;

    elements.statementTableBody.innerHTML = "";
    if (!monthly.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = "Nema stavki za odabrani mjesec.";
      row.appendChild(cell);
      elements.statementTableBody.appendChild(row);
    } else {
      monthly.forEach((item) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${item.date}</td>
          <td>${item.type === "income" ? "Prihod" : "Trošak"}</td>
          <td>${item.title}</td>
          <td>${item.category || "-"}</td>
          <td class="amount-column">${Number(item.amount || 0)
            .toFixed(2)
            .replace(".", ",")}</td>
        `;
        elements.statementTableBody.appendChild(row);
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    elements.statementPlaceDate.textContent = `${place || "Rovinj"}, ${today}`;
    elements.statementNote.textContent =
      "Napomena: Iznosi su izraženi u eurima. Dokument je automatski generiran iz aplikacije Financijski tracker.";

    hydrateStatementForm();
  }

  function hydrateStatementForm() {
    elements.statementIssuerName.value = state.profile.issuerName;
    elements.statementIssuerAddress.value = state.profile.issuerAddress;
    elements.statementIssuerOib.value = state.profile.issuerOib;
    elements.statementRecipientName.value = state.profile.recipientName;
    elements.statementRecipientAddress.value = state.profile.recipientAddress;
    elements.statementPlace.value = state.profile.place;
  }

  function handlePrintClick() {
    window.print();
  }

  function restoreState() {
    state.transactions = loadTransactions();
    state.profile = loadProfile();
    state.month = currentMonthString();
    elements.monthSelect.value = state.month;
    syncCategoryOptions();
    resetManualForm();
    hydrateStatementForm();
    updateSummary();
  }

  function bindEvents() {
    elements.navButtons.forEach((button) => {
      button.addEventListener("click", () => setActiveView(button.dataset.view));
    });

    elements.monthSelect.addEventListener("change", handleMonthChange);
    elements.manualForm.addEventListener("submit", handleManualSubmit);
    elements.manualForm.addEventListener("reset", () => {
      setTimeout(resetManualForm, 0);
    });
    elements.manualForm.addEventListener("input", captureManualState);
    elements.tableBody.addEventListener("click", handleDelete);
    elements.confirmDialog.addEventListener("close", handleDialogClose);
    elements.statementForm.addEventListener("submit", handleStatementSubmit);
    elements.printButton.addEventListener("click", handlePrintClick);
  }

  document.addEventListener("DOMContentLoaded", () => {
    restoreState();
    bindEvents();
    setActiveView("home");
  });
})();
