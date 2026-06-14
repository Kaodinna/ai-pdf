# AI PDF Studio

AI-powered PDF splitting and merging. Upload PDFs, split/merge them, use natural language commands, and save reusable extraction templates — all backed by Claude AI.

## Stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, pdf.js for page thumbnails
- **Backend**: Python FastAPI, pypdf + pdfplumber for PDF manipulation
- **AI**: Anthropic Claude (`claude-sonnet-4-20250514`)
- **Storage**: Local filesystem (`/tmp/ai-pdf-*`)

## Setup

### 1. Backend

```bash
cd api
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Create .env from example and fill in your key
cp .env.example .env
# Edit .env: ANTHROPIC_API_KEY=sk-ant-...

uvicorn main:app --reload --port 8000
```

API will be at `http://localhost:8000`. Docs at `http://localhost:8000/docs`.

### 2. Frontend

```bash
cd app
npm install
npm run dev
```

App will be at `http://localhost:3000`.

## Features

- **Upload**: Drag-and-drop or click to upload PDFs. Shows filename, size, and page count.
- **Split**: By page range, every N pages, or select individual pages from a thumbnail grid.
- **Merge**: Upload multiple PDFs, drag to reorder, optionally skip blank pages.
- **AI Commands**: Type natural language instructions — "extract pages with a signature", "remove blank pages" — and Claude executes them.
- **Templates**: Define named extraction patterns. Apply a template to any uploaded PDF and Claude identifies matching pages.

## Adding a New Template

Templates are stored in `api/data/templates.json`. You can add them via the UI (Templates tab) or manually:

```json
{
  "id": "unique-uuid",
  "name": "Invoice Header",
  "description": "Pages containing invoice number, billing address, and total amount",
  "page_rules": "usually page 1",
  "created_at": "2024-01-01T00:00:00"
}
```

Fields:
- `name` — display name
- `description` — what content to match (Claude reads this)
- `page_rules` — optional positional hint (e.g. "always page 1", "last page", "any page containing 'Signature'")

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload` | Upload a PDF, returns file_id + page data |
| POST | `/split` | Split by range, every N pages, or selected pages |
| POST | `/merge` | Merge multiple PDFs |
| POST | `/ai-plan` | Natural language instruction → page selection |
| GET | `/templates` | List saved templates |
| POST | `/templates` | Create a template |
| DELETE | `/templates/:id` | Delete a template |
| POST | `/templates/:id/apply` | Apply template to a file_id |
| GET | `/download/:filename` | Download a processed PDF |

All endpoints return `{ success: bool, data: ..., error: string | null }`.

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `ANTHROPIC_API_KEY` | `api/.env` | Your Anthropic API key |
| `NEXT_PUBLIC_API_URL` | `app/.env.local` | Backend URL (default: `http://localhost:8000`) |
