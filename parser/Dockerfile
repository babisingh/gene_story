FROM python:3.11-slim

# Accept proxy build args so pip can reach PyPI when behind a proxy
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
ENV HTTP_PROXY=$HTTP_PROXY
ENV HTTPS_PROXY=$HTTPS_PROXY
ENV NO_PROXY=$NO_PROXY

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir \
    --trusted-host pypi.org \
    --trusted-host files.pythonhosted.org \
    -r requirements.txt

COPY . .
RUN chmod +x seed.sh

# Default: run both loaders in sequence (Railway deployment).
# Override for individual scripts: docker compose run --rm parser python gtf_parser.py
CMD ["sh", "seed.sh"]
