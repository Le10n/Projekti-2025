(function () {
  const storageKey = "financialTrackerData";
  const defaultCategories = [
    "Mirovina",
    "Plaća",
    "Režije",
    "Hrana",
    "Lijekovi",
    "Zdravlje",
    "Prijevoz",
    "Gorivo",
    "Telekom",
    "Darovi",
    "Usluge",
    "Hobi",
    "Štednja",
    "Ostali troškovi",
    "Ostali prihodi",
  ];

  const receiptPreferenceKey = "financialTrackerReceiptSettings";

  const vendorCategoryHints = [
    { keyword: "konzum", title: "Konzum", category: "Hrana", type: "expense" },
    { keyword: "lidl", title: "Lidl", category: "Hrana", type: "expense" },
    { keyword: "spar", title: "SPAR", category: "Hrana", type: "expense" },
    { keyword: "plodine", title: "Plodine", category: "Hrana", type: "expense" },
    { keyword: "interspar", title: "Interspar", category: "Hrana", type: "expense" },
    { keyword: "ina", title: "INA", category: "Gorivo", type: "expense" },
    { keyword: "tifon", title: "Tifon", category: "Gorivo", type: "expense" },
    { keyword: "petrol", title: "Petrol", category: "Gorivo", type: "expense" },
    { keyword: "hep", title: "HEP", category: "Režije", type: "expense" },
    { keyword: "gradska toplana", title: "Gradska toplana", category: "Režije", type: "expense" },
    { keyword: "a1", title: "A1", category: "Telekom", type: "expense" },
    { keyword: "ht", title: "Hrvatski Telekom", category: "Telekom", type: "expense" },
    { keyword: "telemach", title: "Telemach", category: "Telekom", type: "expense" },
    { keyword: "mirovina", title: "Mirovina", category: "Mirovina", type: "income" },
    { keyword: "plaća", title: "Plaća", category: "Plaća", type: "income" },
    { keyword: "isplata", title: "Isplata", category: "Plaća", type: "income" },
    { keyword: "uplata", title: "Uplata", category: "Ostali prihodi", type: "income" },
    { keyword: "uplatnica", title: "Uplatnica", category: "Režije", type: "expense" },
    { keyword: "lijek", title: "Ljekarna", category: "Lijekovi", type: "expense" },
    { keyword: "ljekarna", title: "Ljekarna", category: "Lijekovi", type: "expense" },
    { keyword: "restoran", title: "Restoran", category: "Hrana", type: "expense" },
    { keyword: "caffe", title: "Caffe", category: "Hrana", type: "expense" },
    { keyword: "bar", title: "Bar", category: "Hrana", type: "expense" },
  ];

  const incomeKeywords = [
    "uplata",
    "uplaćeno",
    "isplata",
    "primljeno",
    "mirovina",
    "plaća",
    "credit",
    "cr",
    "u korist",
    "priljev",
  ];

  const expenseKeywords = [
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
    captureButton: document.getElementById("capture-button"),
    captureInput: document.getElementById("capture-input"),
    discardImages: document.getElementById("discard-images"),
    receiptSection: document.getElementById("receipt-review"),
    receiptImage: document.getElementById("receipt-image"),
    receiptSummary: document.getElementById("receipt-summary"),
    receiptWarning: document.getElementById("receipt-warning"),
    receiptForm: document.getElementById("receipt-form"),
    receiptType: document.getElementById("receipt-type"),
    receiptName: document.getElementById("receipt-name"),
    receiptCategory: document.getElementById("receipt-category"),
    receiptAmount: document.getElementById("receipt-amount"),
    receiptDate: document.getElementById("receipt-date"),
    receiptNote: document.getElementById("receipt-note"),
    receiptEdit: document.getElementById("receipt-edit"),
    receiptRetake: document.getElementById("receipt-retake"),
    receiptFeedback: document.getElementById("receipt-feedback"),
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
        CLICK_CAPTURE: "CAPTURE",
      },
      FORM_EDITING: {
        SUBMIT_FORM: "SUBMITTING",
        CANCEL: "IDLE",
      },
      CAPTURE: {
        PHOTO_TAKEN: "OCR_PROCESSING",
        CANCEL: "IDLE",
      },
      OCR_PROCESSING: {
        OCR_OK: "REVIEW",
        OCR_FAIL: "CAPTURE",
      },
      REVIEW: {
        EDIT_FIELDS: "REVIEW",
        RETAKE: "CAPTURE",
        CANCEL: "IDLE",
        CONFIRM_SAVE: "SUBMITTING",
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

  const receiptState = {
    file: null,
    data: null,
    editing: false,
    confidence: 0,
    discardImages: true,
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

  function loadReceiptPreferences() {
    try {
      const stored = localStorage.getItem(receiptPreferenceKey);
      if (!stored) {
        return { discardImages: true };
      }
      const parsed = JSON.parse(stored);
      return { discardImages: parsed.discardImages !== false };
    } catch (error) {
      console.warn("Ne mogu učitati postavke skeniranja", error);
      return { discardImages: true };
    }
  }

  function saveReceiptPreferences(preferences) {
    try {
      localStorage.setItem(
        receiptPreferenceKey,
        JSON.stringify({ discardImages: preferences.discardImages })
      );
    } catch (error) {
      console.warn("Ne mogu spremiti postavke skeniranja", error);
    }
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

  function resetReceiptFeedback() {
    if (!elements.receiptFeedback) return;
    elements.receiptFeedback.textContent = "";
    elements.receiptFeedback.className = "feedback";
  }

  function showReceiptFeedback(message, type = "info") {
    if (!elements.receiptFeedback) return;
    elements.receiptFeedback.textContent = message;
    elements.receiptFeedback.className = `feedback ${type}`;
  }

  function toggleReceiptFields(enable) {
    if (!elements.receiptForm) return;
    const fields = elements.receiptForm.querySelectorAll(
      "input, select, textarea"
    );
    fields.forEach((field) => {
      if (enable) {
        field.disabled = false;
        field.readOnly = false;
      } else {
        field.disabled = true;
        field.readOnly = true;
      }
    });
  }

  function setReceiptEditing(enable) {
    if (!elements.receiptForm || !elements.receiptEdit) return;
    receiptState.editing = enable;
    toggleReceiptFields(enable);
    elements.receiptForm.classList.toggle("is-editing", enable);
    elements.receiptEdit.textContent = enable ? "Završi uređivanje" : "Uredi";
    if (enable) {
      showReceiptFeedback("Polja su sada uređiva.", "info");
      elements.receiptName?.focus();
    }
  }

  function populateReceiptForm(data) {
    if (!elements.receiptForm) return;
    elements.receiptType.value = data.type || "expense";
    elements.receiptName.value = data.name || "";
    elements.receiptCategory.value = data.category || "";
    elements.receiptAmount.value = data.amount ? Number(data.amount).toFixed(2) : "";
    elements.receiptDate.value = data.date || "";
    elements.receiptNote.value = data.note || "";
  }

  function renderReceiptSummary(data) {
    if (!elements.receiptSummary) return;
    const typeLabel =
      data.type === "income"
        ? "Prihod"
        : data.type === "expense"
        ? "Trošak"
        : "";
    const items = [
      { label: "Tip", value: typeLabel },
      { label: "Naziv", value: data.name },
      { label: "Kategorija", value: data.category },
      {
        label: "Iznos",
        value:
          typeof data.amount === "number" && data.amount > 0
            ? formatCurrency(data.amount)
            : "—",
      },
      { label: "Datum", value: data.date },
    ];

    elements.receiptSummary.innerHTML = items
      .filter((item) => item.value)
      .map(
        (item) =>
          `<li><strong>${item.label}:</strong> <span>${item.value}</span></li>`
      )
      .join("");
  }

  function updateReceiptWarning(warnings = [], confidence = 1) {
    if (!elements.receiptWarning) return;
    const needsWarning = warnings.length || confidence < 0.7;
    if (!needsWarning) {
      elements.receiptWarning.hidden = true;
      elements.receiptWarning.textContent = "";
      return;
    }

    const messages = [...warnings];
    if (confidence < 0.7) {
      messages.push(
        "Nismo sigurni u sva polja. Molimo provjerite iznos i tip prije spremanja."
      );
    }
    elements.receiptWarning.textContent = messages.join(" ");
    elements.receiptWarning.hidden = false;
  }

  function resetReceiptReview() {
    if (!elements.receiptSection) return;
    elements.receiptSection.hidden = true;
    if (elements.receiptImage) {
      elements.receiptImage.removeAttribute("src");
    }
    if (elements.receiptSummary) {
      elements.receiptSummary.innerHTML = "";
    }
    if (elements.receiptForm) {
      elements.receiptForm.reset();
      elements.receiptForm.classList.remove("is-editing");
    }
    if (elements.receiptWarning) {
      elements.receiptWarning.hidden = true;
      elements.receiptWarning.textContent = "";
    }
    resetReceiptFeedback();
    toggleReceiptFields(false);
    receiptState.file = null;
    receiptState.data = null;
    receiptState.confidence = 0;
    receiptState.editing = false;
    if (elements.receiptEdit) {
      elements.receiptEdit.textContent = "Uredi";
    }
    if (elements.captureInput) {
      elements.captureInput.value = "";
    }
  }

  function previewReceiptImage(file) {
    if (!elements.receiptImage || !file) return;
    const reader = new FileReader();
    reader.onload = () => {
      elements.receiptImage.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function normaliseText(value) {
    return value
      .replace(/\.[^/.]+$/, "")
      .replace(/[\s_-]+/g, " ")
      .toLowerCase();
  }

  function toTitleCase(value) {
    return value
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function extractAmountFromText(text) {
    if (!text) return null;
    const matches = text.match(/\d+[\.,]\d{2}/g);
    if (!matches) return null;
    const amounts = matches
      .map((value) => Number(value.replace(",", ".")))
      .filter((value) => Number.isFinite(value));
    if (!amounts.length) return null;
    return Math.max(...amounts);
  }

  function extractDateFromText(text) {
    if (!text) return null;
    const isoMatch = text.match(/(20\d{2})[-_.](\d{2})[-_.](\d{2})/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return `${year}-${month}-${day}`;
    }
    const hrMatch = text.match(/(\d{2})[.\-](\d{2})[.\-](20\d{2})/);
    if (hrMatch) {
      const [, day, month, year] = hrMatch;
      return `${year}-${month}-${day}`;
    }
    return null;
  }

  function simulateOcr(file) {
    const baseText = normaliseText(file.name || "");
    const warnings = [];
    let confidence = 0.85;

    const vendor = vendorCategoryHints.find((hint) =>
      baseText.includes(hint.keyword)
    );

    let type = vendor?.type || "expense";
    let category = vendor?.category || (type === "income" ? "Ostali prihodi" : "Ostali troškovi");
    let title = vendor?.title || toTitleCase(baseText.split(" ").slice(0, 3).join(" "));

    if (!title || title.toLowerCase().startsWith("img")) {
      title = type === "income" ? "Uplata" : "Račun";
    }

    const amount = extractAmountFromText(baseText);
    if (!amount) {
      warnings.push("Nismo sigurni u iznos. Molimo provjerite.");
      confidence -= 0.2;
    }

    const keywordIncome = incomeKeywords.find((keyword) =>
      baseText.includes(keyword)
    );
    if (keywordIncome) {
      type = "income";
      if (keywordIncome.includes("mirovina")) {
        category = "Mirovina";
        title = "Mirovina";
      } else if (
        keywordIncome.includes("plaća") ||
        keywordIncome.includes("isplata")
      ) {
        category = "Plaća";
        title = "Plaća";
      } else {
        category = "Ostali prihodi";
      }
    }

    const keywordExpense = expenseKeywords.find((keyword) =>
      baseText.includes(keyword)
    );
    if (!keywordIncome && keywordExpense && !vendor) {
      type = "expense";
      category = "Ostali troškovi";
    }

    const detectedDate = extractDateFromText(baseText);
    let date = detectedDate;
    if (!date && file.lastModified) {
      date = new Date(file.lastModified).toISOString().slice(0, 10);
      confidence -= 0.05;
    }
    if (!date) {
      date = new Date().toISOString().slice(0, 10);
      warnings.push("Datum nije prepoznat pa smo predložili današnji datum.");
      confidence -= 0.1;
    }

    if (!vendor && !keywordIncome && !keywordExpense) {
      confidence -= 0.15;
      warnings.push("Molimo provjerite tip i kategoriju.");
    }

    confidence = Math.max(0.3, Math.min(1, confidence));

    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          title,
          type,
          category,
          amount: amount ? Number(amount.toFixed(2)) : null,
          date,
          note: "račun skeniran",
          confidence,
          warnings,
        });
      }, 800);
    });
  }

  async function processReceiptFile(file) {
    try {
      const ocrResult = await simulateOcr(file);
      receiptState.data = {
        type: ocrResult.type,
        name: ocrResult.title || "Račun",
        category: ocrResult.category,
        amount: ocrResult.amount,
        date: ocrResult.date,
        note: ocrResult.note,
      };
      receiptState.confidence = ocrResult.confidence;
      renderReceiptSummary(receiptState.data);
      populateReceiptForm(receiptState.data);
      setReceiptEditing(false);
      updateReceiptWarning(ocrResult.warnings, ocrResult.confidence);
      const feedbackType =
        ocrResult.warnings.length || ocrResult.confidence < 0.7
          ? "warning"
          : "info";
      showReceiptFeedback(
        "Provjerite podatke i po potrebi odaberite Uredi prije spremanja.",
        feedbackType
      );
      stateMachine.transition("OCR_OK");
    } catch (error) {
      console.error("OCR obrada nije uspjela", error);
      showReceiptFeedback(
        "Obrada nije uspjela. Fokusirajte kameru i pokušajte ponovno.",
        "error"
      );
      updateReceiptWarning(
        ["Obrada nije uspjela. Molimo pokušajte ponovno."],
        0.4
      );
      stateMachine.transition("OCR_FAIL");
    }
  }

  function handleCaptureClick() {
    if (!elements.captureInput) return;
    stateMachine.transition("CLICK_CAPTURE");
    resetReceiptReview();
    elements.captureInput.click();
  }

  function handleCaptureChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      stateMachine.transition("CANCEL");
      return;
    }
    receiptState.file = file;
    stateMachine.transition("PHOTO_TAKEN");
    if (elements.receiptSection) {
      elements.receiptSection.hidden = false;
    }
    previewReceiptImage(file);
    showReceiptFeedback("Obrađujemo račun...", "info");
    updateReceiptWarning([], 1);
    processReceiptFile(file);
  }

  function handleReceiptEdit() {
    if (!receiptState.data) {
      showReceiptFeedback("Najprije uslikajte račun.", "info");
      return;
    }
    if (receiptState.editing) {
      setReceiptEditing(false);
      populateReceiptForm(receiptState.data);
      renderReceiptSummary(receiptState.data);
      showReceiptFeedback(
        "Promjene nisu spremljene dok ne pritisnete Spremi.",
        "info"
      );
    } else {
      stateMachine.transition("EDIT_FIELDS");
      setReceiptEditing(true);
    }
  }

  function handleReceiptRetake() {
    stateMachine.transition("RETAKE");
    resetReceiptReview();
    if (elements.captureInput) {
      elements.captureInput.click();
    }
  }

  function handleReceiptSave(event) {
    event.preventDefault();
    resetReceiptFeedback();
    if (!receiptState.data && !receiptState.editing) {
      showReceiptFeedback("Najprije uslikajte račun.", "info");
      return;
    }

    let dataToSave;
    if (receiptState.editing) {
      const { type, name, category, amount, date, note, errors } = getFormData(
        elements.receiptForm
      );
      if (errors.length) {
        showReceiptFeedback(errors.join(" "), "error");
        stateMachine.transition("API_FAIL");
        return;
      }
      dataToSave = { type, name, category, amount, date, note };
      receiptState.data = dataToSave;
      receiptState.confidence = 1;
      renderReceiptSummary(receiptState.data);
      setReceiptEditing(false);
    } else {
      const { sanitized, errors } = validateTransactionObject(
        receiptState.data || {}
      );
      if (errors.length) {
        showReceiptFeedback(errors.join(" "), "error");
        stateMachine.transition("API_FAIL");
        return;
      }
      dataToSave = sanitized;
      receiptState.data = sanitized;
      populateReceiptForm(receiptState.data);
      renderReceiptSummary(receiptState.data);
    }

    stateMachine.transition("CONFIRM_SAVE");
    try {
      const allTransactions = loadTransactions();
      const newTransaction = {
        id: crypto.randomUUID(),
        ...dataToSave,
        amount: Number(dataToSave.amount),
        createdAt: new Date().toISOString(),
      };
      allTransactions.push(newTransaction);
      saveTransactions(allTransactions);
      showReceiptFeedback("Račun je spremljen.", "success");
      updateReceiptWarning([], 1);
      stateMachine.transition("API_OK");
      renderDashboard();
      if (receiptState.discardImages) {
        resetReceiptReview();
      }
    } catch (error) {
      console.error("Spremanje računa nije uspjelo", error);
      stateMachine.transition("API_FAIL");
      showReceiptFeedback("Spremanje nije uspjelo. Pokušajte ponovno.", "error");
    }
  }

  function validateTransactionObject(data) {
    const sanitized = {
      type: data.type || "",
      name: (data.name || "").trim(),
      category: (data.category || "").trim(),
      amount: Number(data.amount),
      date: data.date || "",
      note: (data.note || "").trim(),
    };

    const errors = [];
    if (!sanitized.type) errors.push("Odaberite tip transakcije.");
    if (!sanitized.name) errors.push("Naziv je obavezan.");
    if (!sanitized.category) errors.push("Kategorija je obavezna.");
    if (!Number.isFinite(sanitized.amount) || sanitized.amount <= 0) {
      errors.push("Iznos mora biti broj veći od 0 (npr. 25.00).");
    }
    if (!sanitized.date) errors.push("Datum je obavezan (format GGGG-MM-DD).");

    return { sanitized, errors };
  }

  function getFormData(form) {
    const formData = new FormData(form);
    const { sanitized, errors } = validateTransactionObject({
      type: formData.get("type"),
      name: formData.get("name"),
      category: formData.get("category"),
      amount: formData.get("amount"),
      date: formData.get("date"),
      note: formData.get("note"),
    });

    return {
      ...sanitized,
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

  function initReceiptCapture() {
    if (!elements.captureButton || !elements.captureInput) {
      return;
    }

    const preferences = loadReceiptPreferences();
    receiptState.discardImages = preferences.discardImages;
    if (elements.discardImages) {
      elements.discardImages.checked = preferences.discardImages;
      elements.discardImages.addEventListener("change", (event) => {
        receiptState.discardImages = Boolean(event.target.checked);
        saveReceiptPreferences({ discardImages: receiptState.discardImages });
      });
    }

    toggleReceiptFields(false);

    elements.captureButton.addEventListener("click", handleCaptureClick);
    elements.captureInput.addEventListener("change", handleCaptureChange);
    elements.receiptForm?.addEventListener("submit", handleReceiptSave);
    elements.receiptEdit?.addEventListener("click", handleReceiptEdit);
    elements.receiptRetake?.addEventListener("click", handleReceiptRetake);
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
    initReceiptCapture();
    initForm();
    initDialog();
    attachTableListeners();
    populateCategories();
    renderDashboard();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
