#!/usr/bin/env bash
# Makes a local certificate authority (CA) and a server certificate for RabbitMQ's TLS
# listener, used by docker-compose.tls.yml. Run once from anywhere; it skips if they exist.
# Development only: server.key is readable by all, so the rabbitmq user in the container can read it.
set -euo pipefail

dir="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$dir"
if [ -f "$dir/server.pem" ]; then
  echo "certificates already in $dir (delete the folder to make new ones)"
  exit 0
fi
cd "$dir"

# The CA: signs the server certificate; clients trust ca.pem.
openssl req -x509 -newkey rsa:2048 -nodes -days 825 -subj "/CN=EcoCollect dev CA" \
  -keyout ca.key -out ca.pem 2>/dev/null

# The server certificate: valid for the Compose hostname and for localhost.
openssl req -newkey rsa:2048 -nodes -subj "/CN=rabbitmq" -keyout server.key -out server.csr 2>/dev/null
printf 'subjectAltName=DNS:rabbitmq,DNS:localhost\nextendedKeyUsage=serverAuth\n' > server.ext
openssl x509 -req -in server.csr -CA ca.pem -CAkey ca.key -CAcreateserial -days 825 \
  -extfile server.ext -out server.pem 2>/dev/null
rm server.csr server.ext ca.srl

chmod 644 server.key   # read by the rabbitmq user inside the container
chmod 600 ca.key       # only needed to sign; never mounted
echo "certificates written to $dir"
