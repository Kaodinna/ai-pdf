FROM python:3.12-slim

WORKDIR /app

# tesseract-ocr: the actual OCR engine binary pytesseract wraps — needed for
# highlight positioning on scanned pages that have no embedded PDF text layer.
RUN apt-get update && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
