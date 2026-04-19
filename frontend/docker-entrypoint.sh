#!/bin/sh
# Substitute API_URL, PORT, DNS_RESOLVER, and API_HOST into nginx config at startup.
# On Railway: API_URL = internal API address, PORT = public port for nginx.
# Locally:    API_URL defaults to http://api:8000, PORT defaults to 80.

API_URL="${API_URL:-http://api:8000}"
# Remove any trailing slash so proxy_pass variable doesn't strip the /api/ prefix
API_URL="${API_URL%/}"
NGINX_PORT="${PORT:-80}"
# Extract hostname from API_URL for the Host header (strips scheme and port)
API_HOST=$(echo "$API_URL" | sed -e 's|^https://||' -e 's|^http://||' | cut -d'/' -f1 | cut -d':' -f1)
# Read the container's DNS resolver so nginx can re-resolve the backend hostname
# on each request (Railway internal hostnames like *.railway.internal need this)
DNS_RESOLVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
DNS_RESOLVER="${DNS_RESOLVER:-127.0.0.11}"

echo "nginx: API_URL=${API_URL}  PORT=${NGINX_PORT}  DNS=${DNS_RESOLVER}"

sed \
  -e "s|__API_URL__|${API_URL}|g" \
  -e "s|__API_HOST__|${API_HOST}|g" \
  -e "s|__PORT__|${NGINX_PORT}|g" \
  -e "s|__DNS_RESOLVER__|${DNS_RESOLVER}|g" \
  /etc/nginx/conf.d/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
