"""
Ledger — AI Financial Insight Tool
FastAPI Backend — pydantic-ai agents for structured Gemini output

Pipeline:
  1. Receive PDF in-memory (never touches disk)
  2. Convert pages → PNG images via pypdfium2
  3. pydantic-ai Agent[ExtractionResult]  →  typed transaction list
  4. pydantic-ai Agent[ClassificationResult]  →  categorised transaction list
  5. Pure-Python analytics (idle cash, subscriptions, category summary)
  6. Return AnalysisResponse
"""

import io
import os
import logging
import pypdfium2 as pdfium
from collections import defaultdict
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_ai import Agent, BinaryContent
from pydantic_ai.models.gemini import GeminiModel
from pydantic_ai.settings import ModelSettings

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("ledger")

# ─── Config ───────────────────────────────────────────────────────────────────
# GEMINI_API_KEY    = "AIzaSyDygs_kJCYCgG63Az5Bd65U4Rzp2YWFMuc"
GEMINI_MODEL_NAME = "gemini-3-flash-preview"   # free-tier model
SAFETY_BUFFER_PCT = 0.20
MAX_PDF_SIZE_MB   = 20
IMAGE_DPI         = 150

# os.environ["GEMINI_API_KEY"]=GEMINI_API_KEY
os.environ["GEMINI_MODEL_NAME"]=GEMINI_MODEL_NAME

# ─── FastAPI ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Ledger API",
    description="AI-powered bank statement analysis. Zero data retention.",
    version="2.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://finnius-ai-frontend.onrender.com", "https://finnius-ai-1.onrender.com", "https://finnius-ai.onrender.com"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS — shared between AI agents and API response
# ══════════════════════════════════════════════════════════════════════════════

class RawTransaction(BaseModel):
    """Output schema for Stage 1 — extraction agent."""
    date:   str   = Field(description="Transaction date in YYYY-MM-DD format")
    desc:   str   = Field(description="Merchant name or transaction description")
    amount: float = Field(gt=0, description="Positive transaction amount")
    type:   str   = Field(description="Exactly 'Debit' or 'Credit'")


class ExtractionResult(BaseModel):
    """Wrapper so the agent returns a typed list."""
    transactions: list[RawTransaction] = Field(
        description="All transactions extracted from the bank statement"
    )


class CategorisedTransaction(BaseModel):
    """Output schema for Stage 2 — classification agent."""
    date:     str   = Field(description="Transaction date YYYY-MM-DD")
    desc:     str   = Field(description="Merchant name or description")
    amount:   float = Field(gt=0, description="Positive transaction amount")
    type:     str   = Field(description="Exactly 'Debit' or 'Credit'")
    category: str   = Field(description="AI-assigned lifestyle bucket name")


class ClassificationResult(BaseModel):
    """Wrapper so the agent returns a typed list."""
    categories_used: list[str] = Field(
        description="The 5-8 lifestyle bucket names invented for this person"
    )
    transactions: list[CategorisedTransaction] = Field(
        description="All transactions with category assigned"
    )


# API response models (unchanged shape — frontend doesn't need to change)
class Transaction(BaseModel):
    date:     str
    desc:     str
    amount:   float
    type:     str
    category: Optional[str] = None

class IdleCash(BaseModel):
    monthly_burn:       float
    total_income:       float
    balance:            float
    safety_buffer:      float
    investable_surplus: float
    recommendation:     Optional[str] = None

class SubscriptionItem(BaseModel):
    desc:   str
    amount: float
    date:   str

class CategorySummary(BaseModel):
    name:         str
    total:        float
    count:        int
    pct_of_spend: float

class AnalysisResponse(BaseModel):
    transactions:      list[Transaction]
    categories:        list[CategorySummary]
    idle_cash:         IdleCash
    subscriptions:     list[SubscriptionItem]
    transaction_count: int
    period:            Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# PYDANTIC-AI AGENTS
# ══════════════════════════════════════════════════════════════════════════════

def _make_model() -> GeminiModel:
    """Build GeminiModel — fails fast if no API key is set."""
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY not set in environment.")
    return GeminiModel(GEMINI_MODEL_NAME)


# ── Agent 1: Extraction ────────────────────────────────────────────────────────
extraction_agent = Agent(
    model=None,   # set lazily on first use so startup doesn't fail without a key
    result_type=ExtractionResult,
    system_prompt=(
        "You are a financial document parser specialising in Indian bank statements. "
        "Examine the provided page images carefully. "
        "Extract EVERY transaction row — do not skip any. "
        "Rules:\n"
        "- date must be YYYY-MM-DD\n"
        "- amount must always be a positive number\n"
        "- type must be exactly 'Debit' or 'Credit'\n"
        "- Skip opening balance, closing balance, and totals rows\n"
        "- If a date is missing, infer from context or use the statement period"
    ),
    model_settings=ModelSettings(temperature=0.0, max_tokens=8192),
)

# ── Agent 2: Classification ────────────────────────────────────────────────────
classification_agent = Agent(
    model=None,
    result_type=ClassificationResult,
    system_prompt=(
        "You are a personal finance analyst with deep knowledge of Indian spending habits. "
        "You will receive a list of bank transactions. Your job:\n\n"
        "1. Invent 5–8 meaningful lifestyle category names that best describe THIS specific "
        "person's spending pattern. Make them descriptive and personal — not generic.\n"
        "   Good examples (tailor yours): 'Dining & Local Eats', 'Commute & Transport', "
        "'Streaming Subscriptions', 'Mutual Fund Investments', 'Household Utilities', "
        "'Online Shopping', 'Family Remittances', 'Insurance & Protection'\n\n"
        "2. Assign every transaction exactly one category from your invented set.\n\n"
        "Return categories_used (the list of bucket names you created) and "
        "transactions (every transaction with its category field filled in)."
    ),
    model_settings=ModelSettings(temperature=0.1, max_tokens=8192),
)


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 1 — PDF → PNG bytes
# ══════════════════════════════════════════════════════════════════════════════

def pdf_to_png_bytes(pdf_bytes: bytes) -> list[bytes]:
    """Convert every PDF page to raw PNG bytes, purely in memory."""
    pdf    = pdfium.PdfDocument(pdf_bytes)
    scale  = IMAGE_DPI / 72
    result = []
    for page in pdf:
        bitmap    = page.render(scale=scale, rotation=0)
        pil_image = bitmap.to_pil()
        buf       = io.BytesIO()
        pil_image.save(buf, format="PNG")
        result.append(buf.getvalue())
        page.close()
    pdf.close()
    log.info(f"PDF → {len(result)} page image(s) at {IMAGE_DPI} DPI")
    return result


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 2 — VLM extraction via pydantic-ai
# ══════════════════════════════════════════════════════════════════════════════

async def extract_transactions(png_pages: list[bytes]) -> list[dict]:
    if not GEMINI_API_KEY:
        log.warning("No API key — returning mock transactions")
        return _mock_transactions()

    # pydantic-ai BinaryContent wraps raw bytes with a mime_type.
    # Pass a list of [BinaryContent, BinaryContent, ..., str] as the user message.
    content_parts: list = [
        BinaryContent(data=page_bytes, media_type="image/png")
        for page_bytes in png_pages
    ]
    content_parts.append(
        f"This bank statement has {len(png_pages)} page(s). "
        "Extract every transaction and return them in the required structured format."
    )

    extraction_agent.model = _make_model()
    result = await extraction_agent.run(content_parts)

    txns = [t.model_dump() for t in result.data.transactions]
    log.info(f"Stage 1 ✓  extracted {len(txns)} transactions")
    return txns


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 3 — Classification via pydantic-ai
# ══════════════════════════════════════════════════════════════════════════════

async def classify_transactions(transactions: list[dict]) -> list[dict]:
    if not GEMINI_API_KEY:
        return _mock_classified(transactions)

    # Plain text prompt — no images needed for classification
    prompt = (
        f"Here are {len(transactions)} bank transactions from an Indian account. "
        "Invent appropriate lifestyle categories and classify every transaction.\n\n"
        "Transactions (JSON):\n"
        + "\n".join(
            f"{i+1}. {t['date']} | {t['desc']} | ₹{t['amount']} | {t['type']}"
            for i, t in enumerate(transactions)
        )
    )

    classification_agent.model = _make_model()
    result = await classification_agent.run(prompt)

    classified = [t.model_dump() for t in result.data.transactions]
    log.info(
        f"Stage 2 ✓  classified {len(classified)} transactions "
        f"into buckets: {result.data.categories_used}"
    )
    return classified


# ══════════════════════════════════════════════════════════════════════════════
# STAGE 4 — Pure-Python analytics (no AI)
# ══════════════════════════════════════════════════════════════════════════════

def compute_idle_cash(transactions: list[dict]) -> dict:
    debits  = [t for t in transactions if t["type"] == "Debit"]
    credits = [t for t in transactions if t["type"] == "Credit"]

    monthly_burn  = sum(t["amount"] for t in debits)
    total_income  = sum(t["amount"] for t in credits)
    balance       = total_income - monthly_burn
    safety_buffer = balance * SAFETY_BUFFER_PCT
    surplus       = balance - safety_buffer

    recommendation = None
    if surplus > 0:
        monthly_liquid  = round(surplus * 0.07 / 12)
        monthly_savings = round(surplus * 0.03 / 12)
        recommendation = (
            f"You have ₹{surplus:,.0f} in investable surplus after your monthly burn "
            f"and a 20% safety buffer. Moving this to a risk-free Liquid Fund or Digital Gold "
            f"could yield ~₹{monthly_liquid:,.0f}/month (7% p.a.) vs. "
            f"~₹{monthly_savings:,.0f}/month sitting idle in savings (3% p.a.)."
        )

    return {
        "monthly_burn":       round(monthly_burn, 2),
        "total_income":       round(total_income, 2),
        "balance":            round(balance, 2),
        "safety_buffer":      round(safety_buffer, 2),
        "investable_surplus": round(surplus, 2),
        "recommendation":     recommendation,
    }


def find_subscriptions(transactions: list[dict]) -> list[dict]:
    keywords = ("subscription", "subscriptions", "streaming", "saas")
    return [
        {"desc": t["desc"], "amount": t["amount"], "date": t["date"]}
        for t in transactions
        if any(kw in t.get("category", "").lower() for kw in keywords)
    ]


def build_category_summary(transactions: list[dict]) -> list[dict]:
    debits      = [t for t in transactions if t["type"] == "Debit"]
    total_spend = sum(t["amount"] for t in debits) or 1
    cat_totals: dict[str, list] = defaultdict(list)
    for t in debits:
        cat_totals[t.get("category", "Uncategorised")].append(t["amount"])
    summary = []
    for cat, amounts in cat_totals.items():
        total = sum(amounts)
        summary.append({
            "name":         cat,
            "total":        round(total, 2),
            "count":        len(amounts),
            "pct_of_spend": round(total / total_spend * 100, 1),
        })
    return sorted(summary, key=lambda x: x["total"], reverse=True)


def infer_period(transactions: list[dict]) -> str:
    dates = []
    for t in transactions:
        try:
            dates.append(datetime.strptime(t["date"], "%Y-%m-%d"))
        except Exception:
            pass
    if not dates:
        return "Unknown period"
    lo, hi = min(dates), max(dates)
    if lo.month == hi.month and lo.year == hi.year:
        return lo.strftime("%B %Y")
    return f"{lo.strftime('%d %b')} – {hi.strftime('%d %b %Y')}"


# ══════════════════════════════════════════════════════════════════════════════
# MOCK FALLBACKS (when no API key is set)
# ══════════════════════════════════════════════════════════════════════════════

def _mock_transactions() -> list[dict]:
    return [
        {"date": "2026-10-01", "desc": "Zomato Bangalore",     "amount": 685,    "type": "Debit"},
        {"date": "2026-10-02", "desc": "Salary Payout — Oct",  "amount": 100253, "type": "Credit"},
        {"date": "2026-10-03", "desc": "Varalakshi Tiffins",   "amount": 180,    "type": "Debit"},
        {"date": "2026-10-04", "desc": "Zerodha Buy Order",    "amount": 15000,  "type": "Debit"},
        {"date": "2026-10-05", "desc": "Ola Cabs",             "amount": 340,    "type": "Debit"},
        {"date": "2026-10-06", "desc": "YouTube Premium",      "amount": 189,    "type": "Debit"},
        {"date": "2026-10-07", "desc": "Rameshwaram Café",     "amount": 520,    "type": "Debit"},
        {"date": "2026-10-08", "desc": "BESCOM Electric Bill", "amount": 1200,   "type": "Debit"},
        {"date": "2026-10-09", "desc": "Amazon Order",         "amount": 2340,   "type": "Debit"},
        {"date": "2026-10-10", "desc": "Google One Storage",   "amount": 130,    "type": "Debit"},
        {"date": "2026-10-11", "desc": "Namma Metro Recharge", "amount": 500,    "type": "Debit"},
        {"date": "2026-10-12", "desc": "Swiggy Order",         "amount": 430,    "type": "Debit"},
        {"date": "2026-10-13", "desc": "LIC Premium",          "amount": 4500,   "type": "Debit"},
        {"date": "2026-10-14", "desc": "Spotify Premium",      "amount": 119,    "type": "Debit"},
        {"date": "2026-10-15", "desc": "Rapido Bike",          "amount": 95,     "type": "Debit"},
        {"date": "2026-10-16", "desc": "Blinkit Groceries",    "amount": 1640,   "type": "Debit"},
        {"date": "2026-10-17", "desc": "Groww MF SIP",         "amount": 5000,   "type": "Debit"},
        {"date": "2026-10-18", "desc": "Netflix Subscription", "amount": 649,    "type": "Debit"},
        {"date": "2026-10-19", "desc": "PhonePe UPI — Mom",    "amount": 3000,   "type": "Debit"},
        {"date": "2026-10-20", "desc": "BBMP Property Tax",    "amount": 6200,   "type": "Debit"},
    ]


def _mock_classified(transactions: list[dict]) -> list[dict]:
    mapping = {
        "zomato":      "Dining & Local Eats",
        "salary":      "Income",
        "varalakshi":  "Dining & Local Eats",
        "zerodha":     "Investments",
        "ola":         "Commute & Transport",
        "youtube":     "Streaming Subscriptions",
        "rameshwaram": "Dining & Local Eats",
        "bescom":      "Household Utilities",
        "amazon":      "Online Shopping",
        "google":      "Streaming Subscriptions",
        "metro":       "Commute & Transport",
        "swiggy":      "Dining & Local Eats",
        "lic":         "Insurance & Protection",
        "spotify":     "Streaming Subscriptions",
        "rapido":      "Commute & Transport",
        "blinkit":     "Dining & Local Eats",
        "groww":       "Investments",
        "netflix":     "Streaming Subscriptions",
        "phonepe":     "Family Remittances",
        "bbmp":        "Household Utilities",
    }
    for t in transactions:
        desc_lower = t["desc"].lower()
        t["category"] = next(
            (cat for key, cat in mapping.items() if key in desc_lower),
            "Miscellaneous"
        )
    return transactions


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/health")
def health():
    return {
        "status":     "ok",
        "ai_enabled": bool(GEMINI_API_KEY),
        "model":      GEMINI_MODEL_NAME,
        "version":    "2.0.0",
    }


@app.post("/api/analyze", response_model=AnalysisResponse)
async def analyze(file: UploadFile = File(...)):

    # ── Validate ──────────────────────────────────────────────────────────────
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=415,
            detail="Unsupported File Format — only PDF bank statements accepted.",
        )

    pdf_bytes = await file.read()

    if not pdf_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    if len(pdf_bytes) > MAX_PDF_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_PDF_SIZE_MB} MB limit.")

    log.info(f"▶ Received: {file.filename!r}  ({len(pdf_bytes) / 1024:.1f} KB)")

    try:
        # ── 1. PDF → images ───────────────────────────────────────────────────
        png_pages = pdf_to_png_bytes(pdf_bytes)

        # ── 2. Extract transactions (pydantic-ai agent) ───────────────────────
        raw_txns = await extract_transactions(png_pages)

        if not raw_txns:
            raise HTTPException(
                status_code=422,
                detail="No transactions found. Please upload a valid bank statement PDF.",
            )

        # ── 3. Classify into lifestyle buckets (pydantic-ai agent) ────────────
        classified = await classify_transactions(raw_txns)

        # ── 4. Analytics ──────────────────────────────────────────────────────
        idle_cash  = compute_idle_cash(classified)
        subs       = find_subscriptions(classified)
        categories = build_category_summary(classified)
        period     = infer_period(classified)

        log.info(f"✓ Done — {len(classified)} txns, {len(categories)} buckets, "
                 f"surplus ₹{idle_cash['investable_surplus']:,.0f}")

        return AnalysisResponse(
            transactions      = [Transaction(**t)      for t in classified],
            categories        = [CategorySummary(**c)  for c in categories],
            idle_cash         = IdleCash(**idle_cash),
            subscriptions     = [SubscriptionItem(**s) for s in subs],
            transaction_count = len(classified),
            period            = period,
        )

    except HTTPException:
        raise
    except Exception as e:
        log.exception(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── Dev entry point ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
