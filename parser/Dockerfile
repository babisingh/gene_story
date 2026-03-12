FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Default command — override with: docker compose run --rm parser python load_cytoband.py
CMD ["python", "gtf_parser.py"]
