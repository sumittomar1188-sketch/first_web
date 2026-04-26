const API_URL = "http://localhost:8000";
const expenseForm = document.getElementById("expense-form");
const tableBody = document.getElementById("expenses-table-body");
const totalExpenseElement = document.getElementById("total-expense");
const showInsightsButton = document.getElementById("show-insights");
const showHistoryButton = document.getElementById("show-history");
const hideHistoryButton = document.getElementById("hide-history");
const historySection = document.getElementById("history-section");
const insightsCard = document.getElementById("insights-card");
const highestCategory = document.getElementById("highest-category");
const lowestCategory = document.getElementById("lowest-category");
const insightTotal = document.getElementById("insight-total");
const suggestionsList = document.getElementById("suggestions-list");
const topSuggestions = document.getElementById("top-suggestions");
const messageBox = document.getElementById("message");
const loadingOverlay = document.getElementById("loading-overlay");

function showMessage(text, type = "success") {
  messageBox.textContent = text;
  messageBox.className = `message ${type}`;
  messageBox.classList.remove("hidden");
  setTimeout(() => {
    messageBox.classList.add("hidden");
  }, 3200);
}

function setLoading(isLoading) {
  if (isLoading) {
    loadingOverlay.classList.remove("hidden");
  } else {
    loadingOverlay.classList.add("hidden");
  }
}

async function fetchExpenses() {
  setLoading(true);
  try {
    const [expenseResponse, totalResponse] = await Promise.all([
      fetch(`${API_URL}/expenses`),
      fetch(`${API_URL}/total`),
    ]);

    if (!expenseResponse.ok || !totalResponse.ok) {
      throw new Error("Unable to load expense data.");
    }

    const [expenses, totalData] = await Promise.all([
      expenseResponse.json(),
      totalResponse.json(),
    ]);

    updateExpenseTable(expenses);
    totalExpenseElement.textContent = totalData.total || 0;
  } catch (error) {
    updateExpenseTable([]);
    totalExpenseElement.textContent = 0;
    showMessage(error.message || "Failed to load expenses.", "error");
  } finally {
    setLoading(false);
  }
}

function updateExpenseTable(expenses) {
  if (!expenses || expenses.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="empty-state">No expenses found. Add your first expense now.</td></tr>`;
    return;
  }

  tableBody.innerHTML = expenses
    .map((expense) => {
      return `
        <tr>
          <td>${expense.name}</td>
          <td>$${expense.amount}</td>
          <td>${expense.category}</td>
          <td>${expense.date}</td>
          <td><button class="delete-btn" data-id="${expense.id}">Delete</button></td>
        </tr>
      `;
    })
    .join("");

  const deleteButtons = document.querySelectorAll(".delete-btn");
  deleteButtons.forEach((button) => {
    button.addEventListener("click", () => handleDeleteExpense(button.dataset.id));
  });
}

async function handleDeleteExpense(expenseId) {
  if (!expenseId) return;
  setLoading(true);
  try {
    const response = await fetch(`${API_URL}/delete/${expenseId}`, { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Could not delete expense.");
    }
    showMessage("Expense deleted successfully.", "success");
    await fetchExpenses();
    insightsCard.classList.add("hidden");
  } catch (error) {
    showMessage(error.message || "Error deleting expense.", "error");
  } finally {
    setLoading(false);
  }
}

expenseForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("name").value.trim();
  const amount = Number(document.getElementById("amount").value);
  const category = document.getElementById("category").value.trim();
  const date = document.getElementById("date").value;

  if (!name || !category || !date || Number.isNaN(amount) || amount < 0) {
    showMessage("Please enter valid expense details.", "error");
    return;
  }

  setLoading(true);
  try {
    const response = await fetch(`${API_URL}/add-expense`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, amount, category, date }),
    });

    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.detail || "Unable to add expense.");
    }

    showMessage("Expense added successfully.", "success");
    expenseForm.reset();
    await fetchExpenses();
    insightsCard.classList.add("hidden");
  } catch (error) {
    showMessage(error.message || "Failed to add expense.", "error");
  } finally {
    setLoading(false);
  }
});

showInsightsButton.addEventListener("click", async () => {
  setLoading(true);
  if (historySection) {
    historySection.classList.add("hidden");
  }
  try {
    const response = await fetch(`${API_URL}/insights`);
    if (!response.ok) {
      throw new Error("Unable to load insights.");
    }
    const insights = await response.json();
    displayInsights(insights);
  } catch (error) {
    showMessage(error.message || "Failed to fetch insights.", "error");
  } finally {
    setLoading(false);
  }
});

function displayInsights(data) {
  if (insightsCard) {
    insightsCard.classList.remove("hidden");
  }

  const categoryTotals = data?.category_totals ?? {};
  const highest = data?.highest_spending_category ?? { category: "-", amount: 0 };
  const lowest = data?.lowest_spending_category ?? { category: "-", amount: 0 };
  const total = typeof data?.total_expense === "number" ? data.total_expense : 0;

  const categoryMetrics = Object.entries(categoryTotals).map(([category, amount]) => ({
    category,
    amount: Number(amount) || 0,
  }));

  const fallbackHighest = categoryMetrics.reduce(
    (best, current) => (current.amount > best.amount ? current : best),
    { category: "-", amount: 0 }
  );

  const fallbackLowest = categoryMetrics.reduce(
    (worst, current) => (current.amount < worst.amount ? current : worst),
    { category: "-", amount: 0 }
  );

  const displayHighest = highest.amount > 0 ? highest : fallbackHighest;
  const displayLowest = lowest.amount > 0 ? lowest : fallbackLowest;
  const displayTotal = total > 0 ? total : categoryMetrics.reduce((sum, item) => sum + item.amount, 0);

  highestCategory.textContent = `${displayHighest.category || "-"} ($${displayHighest.amount ?? 0})`;
  lowestCategory.textContent = `${displayLowest.category || "-"} ($${displayLowest.amount ?? 0})`;
  insightTotal.textContent = `$${displayTotal}`;

  if (suggestionsList) {
    suggestionsList.innerHTML = "";
  }
  if (topSuggestions) {
    topSuggestions.innerHTML = "";
  }

  const suggestions = Array.isArray(data?.suggestions) && data.suggestions.length > 0
    ? data.suggestions
    : ["No suggestions available yet."];

  suggestions.forEach((suggestion) => {
    const li = document.createElement("li");
    li.textContent = suggestion || "Suggestion not available.";
    if (suggestionsList) {
      suggestionsList.appendChild(li);
    }
  });

  suggestions.slice(0, 2).forEach((suggestion) => {
    const li = document.createElement("li");
    li.textContent = suggestion || "Suggestion not available.";
    if (topSuggestions) {
      topSuggestions.appendChild(li);
    }
  });
}

showHistoryButton.addEventListener("click", async () => {
  historySection.classList.remove("hidden");
  insightsCard.classList.add("hidden");
  await fetchExpenses();
});

hideHistoryButton.addEventListener("click", () => {
  historySection.classList.add("hidden");
});

window.addEventListener("DOMContentLoaded", () => {
  fetchExpenses();
});
