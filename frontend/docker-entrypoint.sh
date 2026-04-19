#!/bin/sh
# Substitute API_URL and PORT into nginx config at container startup.
# On Railway: API_URL = internal API address, PORT = public port for nginx.
# Locally:    API_URL defaults to http://api:8000, PORT defaults to 80.

API_URL="${API_URL:-http://api:8000}"
NGINX_PORT="${PORT:-80}"
# Extract hostname from API_URL for the Host header (strips scheme and path)
API_HOST=$(echo "$API_URL" | sed 's|https\?://||' | cut -d'/' -f1 | cut -d':' -f1)

sed \
  -e "s|__API_URL__|${API_URL}|g" \
  -e "s|__API_HOST__|${API_HOST}|g" \
  -e "s|__PORT__|${NGINX_PORT}|g" \
  /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
