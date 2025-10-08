(function () {
  const STORAGE_KEY = "financialTrackerTransactions";
  const SETTINGS_KEY = "financialTrackerSettings";

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

  const VENDOR_HINTS = [
    { keyword: "konzum", title: "Konzum", category: "Hrana", type: "expense" },
    { keyword: "lidl", title: "Lidl", category: "Hrana", type: "expense" },
    { keyword: "spar", title: "SPAR", category: "Hrana", type: "expense" },
    { keyword: "plodine", title: "Plodine", category: "Hrana", type: "expense" },
    { keyword: "ina", title: "INA", category: "Gorivo", type: "expense" },
    { keyword: "tifon", title: "Tifon", category: "Gorivo", type: "expense" },
    { keyword: "petrol", title: "Petrol", category: "Gorivo", type: "expense" },
    { keyword: "hep", title: "HEP", category: "Režije", type: "expense" },
    { keyword: "telekom", title: "Hrvatski Telekom", category: "Telekom", type: "expense" },
    { keyword: "telemach", title: "Telemach", category: "Telekom", type: "expense" },
    { keyword: "mirovina", title: "Mirovina", category: "Mirovina", type: "income" },
    { keyword: "plaća", title: "Plaća", category: "Plaća", type: "income" },
    { keyword: "uplata", title: "Uplata", category: "Ostali prihodi", type: "income" },
    { keyword: "isplata", title: "Isplata", category: "Plaća", type: "income" },
    { keyword: "ljekarna", title: "Ljekarna", category: "Lijekovi", type: "expense" },
    { keyword: "restoran", title: "Restoran", category: "Hrana", type: "expense" },
    { keyword: "račun", title: "Račun", category: "Režije", type: "expense" },
  ];

  const INCOME_KEYWORDS = [
    "uplata",
    "uplaćeno",
    "isplata",
    "mirovina",
    "plaća",
    "primljeno",
    "u korist",
    "credit",
    "cr",
  ];

  const EXPENSE_KEYWORDS = [
    "račun",
    "fiskalni",
    "ukupno",
    "za plaćanje",
    "pdv",
    "artikli",
    "trošak",
  ];

  const formatter = new Intl.NumberFormat("hr-HR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  });

  const viewDetails = {
    home: "Sažeci i pregled potrošnje za odabrani mjesec.",
    manual: "Ručni unos Prihoda ili Troška.",
    camera: "Slikajte račun, provjerite podatke i spremite.",
    history: "Pregled i brisanje stavki za mjesec.",
    settings: "Postavite privatnost i popis kategorija.",
  };

  const elements = {
    sidebar: document.querySelector(".sidebar"),
    menuToggle: document.getElementById("menu-toggle"),
    menuClose: document.getElementById("menu-close"),
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
    captureButton: document.getElementById("capture-button"),
    captureInput: document.getElementById("capture-input"),
    captureBlock: document.getElementById("capture-block"),
    receiptForm: document.getElementById("receipt-form"),
    receiptImage: document.getElementById("receipt-image"),
    receiptRetake: document.getElementById("receipt-retake"),
    receiptWarning: document.getElementById("receipt-warning"),
    receiptFeedback: document.getElementById("receipt-feedback"),
    receiptType: document.getElementById("receipt-type"),
    receiptName: document.getElementById("receipt-name"),
    receiptAmount: document.getElementById("receipt-amount"),
    receiptDate: document.getElementById("receipt-date"),
    receiptCategory: document.getElementById("receipt-category"),
    receiptNote: document.getElementById("receipt-note"),
    discardImages: document.getElementById("discard-images"),
    settingsForm: document.getElementById("settings-form"),
    settingsDiscardImages: document.getElementById("settings-discard-images"),
    settingsCategories: document.getElementById("settings-categories"),
    settingsFeedback: document.getElementById("settings-feedback"),
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
    ocrResult: {
      title: "",
      amount: "",
      date: "",
      category: "",
      type: "expense",
      note: "račun skeniran",
      confidence: 0,
    },
    warnings: {
      amountUncertain: false,
      titleUncertain: false,
    },
    settings: {
      discardImages: true,
      categories: [...DEFAULT_CATEGORIES],
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

  function loadSettings() {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (!stored) {
        return { discardImages: true, categories: [...DEFAULT_CATEGORIES] };
      }
      const parsed = JSON.parse(stored);
      return {
        discardImages: parsed.discardImages !== false,
        categories:
          Array.isArray(parsed.categories) && parsed.categories.length
            ? parsed.categories
            : [...DEFAULT_CATEGORIES],
      };
    } catch (error) {
      console.warn("Ne mogu učitati postavke", error);
      return { discardImages: true, categories: [...DEFAULT_CATEGORIES] };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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
        : view === "camera"
        ? "Slikaj račun"
        : view === "history"
        ? "Povijest"
        : "Postavke";
    elements.viewDescription.textContent = viewDetails[view] ?? "";

    if (view === "history") {
      renderTable();
    }
    if (view === "manual") {
      prefillManualForm();
    }
    if (view === "camera") {
      resetReceiptForm();
    }
    closeSidebar();
  }

  function closeSidebar() {
    elements.sidebar.classList.remove("open");
  }

  function openSidebar() {
    elements.sidebar.classList.add("open");
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
      .sort((a, b) => (a.date < b.date ? 1 : -1))
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
    state.settings.categories.forEach((category) => {
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

  function resetReceiptForm() {
    elements.captureInput.value = "";
    elements.captureBlock.hidden = false;
    elements.receiptForm.hidden = true;
    elements.receiptImage.src = "";
    elements.receiptFeedback.textContent = "";
    elements.receiptWarning.hidden = true;
    state.ocrResult = {
      title: "",
      amount: "",
      date: "",
      category: "",
      type: "expense",
      note: "račun skeniran",
      confidence: 0,
    };
    state.warnings = { amountUncertain: false, titleUncertain: false };
    updateReceiptFields();
  }

  function updateReceiptFields() {
    const today = new Date().toISOString().slice(0, 10);
    elements.receiptType.value = state.ocrResult.type || "expense";
    elements.receiptName.value = state.ocrResult.title || "";
    elements.receiptAmount.value = state.ocrResult.amount || "";
    elements.receiptDate.value = state.ocrResult.date || today;
    elements.receiptCategory.value = state.ocrResult.category || "";
    elements.receiptNote.value = state.ocrResult.note || "";

    elements.receiptName.closest(".form-group").classList.toggle(
      "is-uncertain",
      state.warnings.titleUncertain
    );
    elements.receiptAmount.closest(".form-group").classList.toggle(
      "is-uncertain",
      state.warnings.amountUncertain
    );

    if (state.warnings.amountUncertain || state.warnings.titleUncertain) {
      const messages = [];
      if (state.warnings.amountUncertain) {
        messages.push("Nismo sigurni u iznos. Molimo provjerite.");
      }
      if (state.warnings.titleUncertain) {
        messages.push("Nismo sigurni u naziv trgovine. Molimo upišite točan naziv.");
      }
      elements.receiptWarning.textContent = messages.join(" ");
      elements.receiptWarning.hidden = false;
    } else {
      elements.receiptWarning.hidden = true;
    }
  }

  function addTransaction(entry) {
    state.transactions.push(entry);
    saveTransactions(state.transactions);
    updateSummary();
    if (state.activeView === "history") {
      renderTable();
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
    renderTable();
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
  }

  function handleCaptureClick() {
    elements.captureInput.click();
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  function simulateOcr(textSample) {
    const sample = textSample.toLowerCase();
    let detected = {
      title: "",
      amount: "",
      date: "",
      category: "",
      type: "expense",
      note: "račun skeniran",
      confidence: 0.65,
    };

    const vendor = VENDOR_HINTS.find((hint) => sample.includes(hint.keyword));
    if (vendor) {
      detected.title = vendor.title;
      detected.category = vendor.category;
      detected.type = vendor.type;
      detected.confidence = 0.82;
    }

    const incomeMatch = INCOME_KEYWORDS.some((keyword) => sample.includes(keyword));
    const expenseMatch = EXPENSE_KEYWORDS.some((keyword) => sample.includes(keyword));
    if (incomeMatch && !expenseMatch) {
      detected.type = "income";
      detected.category = detected.category || "Plaća";
      detected.confidence = Math.max(detected.confidence, 0.78);
    }

    const amountMatch = sample.match(/(\d+[\.,]\d{2})/);
    if (amountMatch) {
      detected.amount = amountMatch[1].replace(",", ".");
      detected.confidence = Math.max(detected.confidence, 0.8);
    }

    const dateMatch = sample.match(/(\d{4}-\d{2}-\d{2})|(\d{2}[\.\/-]\d{2}[\.\/-]\d{4})/);
    if (dateMatch) {
      const raw = dateMatch[0];
      if (raw.includes("-")) {
        detected.date = raw;
      } else {
        const [day, month, year] = raw.split(/[\.\/-]/);
        detected.date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }

    const warnings = {
      amountUncertain: !detected.amount || detected.confidence < 0.75,
      titleUncertain: !detected.title || detected.confidence < 0.75,
    };

    if (warnings.amountUncertain || warnings.titleUncertain) {
      detected.confidence = Math.min(detected.confidence, 0.7);
    }

    return { detected, warnings };
  }

  async function handleCaptureChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      elements.captureBlock.hidden = true;
      elements.receiptFeedback.textContent = "";

      const imageUrl = await readFileAsDataURL(file);
      elements.receiptImage.src = imageUrl;

      const { detected, warnings } = simulateOcr(file.name);
      state.ocrResult = detected;
      state.warnings = warnings;
      elements.receiptForm.hidden = false;
      updateReceiptFields();

      if (!state.settings.discardImages) {
        elements.receiptNote.value = `${detected.note || ""} (slika sačuvana)`;
      }
    } catch (error) {
      console.error("Greška pri očitanju slike", error);
      elements.receiptFeedback.textContent =
        "OCR nije uspio. Fokusirajte kameru i pokušajte ponovno.";
      elements.captureBlock.hidden = false;
    }
  }

  function handleReceiptSubmit(event) {
    event.preventDefault();

    const type = elements.receiptType.value;
    const title = elements.receiptName.value.trim();
    const amount = Number(elements.receiptAmount.value);
    const date = elements.receiptDate.value;
    const category = elements.receiptCategory.value.trim();
    const note = elements.receiptNote.value.trim();

    if (!type || !title || !date || isNaN(amount)) {
      elements.receiptFeedback.textContent =
        "Molimo provjerite Tip, Naziv, Datum i Iznos prije spremanja.";
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
    elements.receiptFeedback.textContent = "Stavka je spremljena.";
    resetReceiptForm();
    setActiveView("home");
  }

  function handleSettingsSubmit(event) {
    event.preventDefault();
    const discardImages = elements.settingsDiscardImages.checked;
    const categoriesText = elements.settingsCategories.value;
    const categories = categoriesText
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    state.settings = {
      discardImages,
      categories: categories.length ? categories : [...DEFAULT_CATEGORIES],
    };
    elements.discardImages.checked = discardImages;
    saveSettings(state.settings);
    syncCategoryOptions();
    elements.settingsFeedback.textContent = "Postavke su spremljene.";
  }

  function handleDiscardToggle(event) {
    state.settings.discardImages = event.target.checked;
    elements.settingsDiscardImages.checked = state.settings.discardImages;
    saveSettings(state.settings);
  }

  function handleSettingsDiscardToggle(event) {
    state.settings.discardImages = event.target.checked;
    elements.discardImages.checked = state.settings.discardImages;
    saveSettings(state.settings);
  }

  function hydrateSettingsForm() {
    elements.settingsDiscardImages.checked = state.settings.discardImages;
    elements.settingsCategories.value = state.settings.categories.join(", ");
    elements.discardImages.checked = state.settings.discardImages;
  }

  function restoreState() {
    state.transactions = loadTransactions();
    state.settings = loadSettings();
    state.month = currentMonthString();
    elements.monthSelect.value = state.month;
    syncCategoryOptions();
    hydrateSettingsForm();
    resetManualForm();
    updateSummary();
  }

  function bindEvents() {
    elements.menuToggle.addEventListener("click", openSidebar);
    elements.menuClose.addEventListener("click", closeSidebar);

    elements.navButtons.forEach((button) => {
      button.addEventListener("click", () => setActiveView(button.dataset.view));
    });

    elements.monthSelect.addEventListener("change", handleMonthChange);
    elements.manualForm.addEventListener("submit", handleManualSubmit);
    elements.manualForm.addEventListener("reset", () => {
      setTimeout(resetManualForm, 0);
    });
    elements.manualForm.addEventListener("input", captureManualState);
    elements.captureButton.addEventListener("click", handleCaptureClick);
    elements.captureInput.addEventListener("change", handleCaptureChange);
    elements.receiptRetake.addEventListener("click", resetReceiptForm);
    elements.receiptForm.addEventListener("submit", handleReceiptSubmit);
    elements.tableBody.addEventListener("click", handleDelete);
    elements.confirmDialog.addEventListener("close", handleDialogClose);
    elements.discardImages.addEventListener("change", handleDiscardToggle);
    elements.settingsForm.addEventListener("submit", handleSettingsSubmit);
    elements.settingsDiscardImages.addEventListener("change", handleSettingsDiscardToggle);
  }

  document.addEventListener("DOMContentLoaded", () => {
    restoreState();
    bindEvents();
    setActiveView("home");
  });
})();
