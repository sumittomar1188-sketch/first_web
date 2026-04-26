import os
import sqlite3
from typing import Dict, Generator, List

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

DATABASE_FILE = "database.db"

app = FastAPI(title="Expense Tracker API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000", "*"] ,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExpenseCreate(BaseModel):
    name: str
    amount: int
    category: str
    date: str


class Expense(ExpenseCreate):
    id: int


def get_db() -> Generator[sqlite3.Connection, None, None]:
    connection = sqlite3.connect(DATABASE_FILE)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
    finally:
        connection.close()


def init_db() -> None:
    if not os.path.exists(DATABASE_FILE):
        open(DATABASE_FILE, "a").close()

    with sqlite3.connect(DATABASE_FILE) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                amount INTEGER NOT NULL,
                category TEXT NOT NULL,
                date TEXT NOT NULL
            )
            """
        )
        connection.commit()


@app.on_event("startup")
def startup_event() -> None:
    init_db()


def row_to_dict(row: sqlite3.Row) -> Dict[str, object]:
    return {key: row[key] for key in row.keys()}


@app.post("/add-expense")
def add_expense(expense: ExpenseCreate, db: sqlite3.Connection = Depends(get_db)) -> Dict[str, object]:
    if not expense.name.strip() or not expense.category.strip() or not expense.date.strip():
        raise HTTPException(status_code=400, detail="Name, category, and date are required")

    cursor = db.cursor()
    cursor.execute(
        "INSERT INTO expenses (name, amount, category, date) VALUES (?, ?, ?, ?)",
        (expense.name.strip(), expense.amount, expense.category.strip(), expense.date.strip()),
    )
    db.commit()
    new_id = cursor.lastrowid
    return {
        "message": "Expense added successfully",
        "expense": {
            "id": new_id,
            "name": expense.name.strip(),
            "amount": expense.amount,
            "category": expense.category.strip(),
            "date": expense.date.strip(),
        },
    }


@app.get("/expenses")
def get_expenses(db: sqlite3.Connection = Depends(get_db)) -> List[Dict[str, object]]:
    cursor = db.cursor()
    cursor.execute("SELECT * FROM expenses ORDER BY id DESC")
    rows = cursor.fetchall()
    return [row_to_dict(row) for row in rows]


@app.get("/total")
def get_total(db: sqlite3.Connection = Depends(get_db)) -> Dict[str, int]:
    cursor = db.cursor()
    cursor.execute("SELECT SUM(amount) AS total FROM expenses")
    row = cursor.fetchone()
    total = row["total"] if row and row["total"] is not None else 0
    return {"total": total}


@app.get("/category/{category_name}")
def get_expenses_by_category(category_name: str, db: sqlite3.Connection = Depends(get_db)) -> List[Dict[str, object]]:
    cursor = db.cursor()
    cursor.execute(
        "SELECT * FROM expenses WHERE LOWER(category) = LOWER(?) ORDER BY id DESC",
        (category_name.strip(),),
    )
    rows = cursor.fetchall()
    return [row_to_dict(row) for row in rows]


@app.delete("/delete/{expense_id}")
def delete_expense(expense_id: int, db: sqlite3.Connection = Depends(get_db)) -> Dict[str, str]:
    cursor = db.cursor()
    cursor.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    db.commit()
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Expense not found")
    return {"message": "Expense deleted successfully"}


@app.get("/insights")
def get_insights(db: sqlite3.Connection = Depends(get_db)) -> Dict[str, object]:
    cursor = db.cursor()
    cursor.execute("SELECT category, SUM(amount) AS total FROM expenses GROUP BY category")
    rows = cursor.fetchall()
    category_totals: Dict[str, int] = {row["category"]: int(row["total"]) for row in rows}

    cursor.execute("SELECT SUM(amount) AS total FROM expenses")
    total_row = cursor.fetchone()
    total_expense = total_row["total"] if total_row and total_row["total"] is not None else 0

    if not category_totals:
        return {
            "total_expense": 0,
            "highest_spending_category": None,
            "lowest_spending_category": None,
            "suggestions": ["No expenses yet. Add your first expense to get insights."],
            "category_totals": {},
        }

    sorted_categories = sorted(category_totals.items(), key=lambda item: item[1], reverse=True)
    highest_category, highest_value = sorted_categories[0]
    lowest_category, lowest_value = sorted_categories[-1]

    suggestions: List[str] = []
    category_key = highest_category.lower()
    if "food" in category_key:
        suggestions.append("Food is your highest spending category. Try reducing outside food and cooking more at home.")
    if "shopping" in category_key:
        suggestions.append("Shopping is high. Control unnecessary purchases and stick to a budget list.")
    if "transport" in category_key or "travel" in category_key:
        suggestions.append("Transportation costs are high. Consider carpooling, public transit, or planning trips carefully.")
    if "entertainment" in category_key:
        suggestions.append("Entertainment is expensive right now. Pick a few favorite activities and reduce extras.")
    if total_expense > 5000:
        suggestions.append("Total spending exceeds 5000. Aim to save at least 20% each month.")
    if not suggestions:
        suggestions.append("Review your top category spending and see where you can cut back.")

    return {
        "total_expense": total_expense,
        "highest_spending_category": {"category": highest_category, "amount": highest_value},
        "lowest_spending_category": {"category": lowest_category, "amount": lowest_value},
        "suggestions": suggestions,
        "category_totals": category_totals,
    }


@app.get("/")
def root() -> JSONResponse:
    return JSONResponse({"message": "Expense Tracker API is running. Use /expenses, /add-expense, /total, /insights."})


# Run this API with:
# uvicorn main:app --reload
