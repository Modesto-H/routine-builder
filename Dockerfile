FROM caddy:alpine

COPY Caddyfile /etc/caddy/Caddyfile

COPY . /usr/share/caddy

EXPOSE 5170