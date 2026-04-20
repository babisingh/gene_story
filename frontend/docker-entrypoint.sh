#!/bin/sh
# Substitute API_URL, API_HOST, and PORT into the nginx config at container startup.
# On Railway: set API_URL to the public URL of the API service,
#             e.g.  API_URL=https://gs-api.up.railway.app
# Locally:    API_URL defaults to http://api:8000 (Docker Compose hostname)

API_URL="${API_URL:-http://api:8000}"
API_URL="${API_URL%/}"   # strip any trailing slash
NGINX_PORT="${PORT:-8000}"
API_HOST=$(echo "$API_URL" | sed -e 's|^https://||' -e 's|^http://||' | cut -d'/' -f1 | cut -d':' -f1)

echo "=== nginx entrypoint ==="
echo "  PORT     = ${NGINX_PORT}"
echo "  API_URL  = ${API_URL}"
echo "  API_HOST = ${API_HOST}"

if [ -z "$API_HOST" ]; then
    echo "ERROR: API_HOST is empty — API_URL is malformed: '${API_URL}'"
    echo "  Set API_URL to the full URL of the API service."
    echo "  Example: API_URL=https://gs-api.up.railway.app"
    exit 1
fi

sed \
  -e "s|__API_URL__|${API_URL}|g" \
  -e "s|__API_HOST__|${API_HOST}|g" \
  -e "s|__PORT__|${NGINX_PORT}|g" \
  /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

# Validate the generated config before starting — prints the error and the
# generated file so any substitution mistake is immediately visible in logs.
if ! nginx -t 2>&1; then
    echo "--- generated nginx config ---"
    cat /etc/nginx/conf.d/default.conf
    exit 1
fi

exec nginx -g "daemon off;"
