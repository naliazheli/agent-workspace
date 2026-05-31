FROM node:24-bookworm

WORKDIR /app

ARG DEBIAN_MIRROR=
ARG DEBIAN_SECURITY_MIRROR=

RUN if [ -n "$DEBIAN_MIRROR" ] || [ -n "$DEBIAN_SECURITY_MIRROR" ]; then \
      debian_mirror="${DEBIAN_MIRROR:-http://deb.debian.org/debian}"; \
      debian_security_mirror="${DEBIAN_SECURITY_MIRROR:-http://deb.debian.org/debian-security}"; \
      find /etc/apt -type f -exec sed -i \
        -e "s|http://deb.debian.org/debian-security|${debian_security_mirror}|g" \
        -e "s|https://deb.debian.org/debian-security|${debian_security_mirror}|g" \
        -e "s|http://security.debian.org/debian-security|${debian_security_mirror}|g" \
        -e "s|https://security.debian.org/debian-security|${debian_security_mirror}|g" \
        -e "s|http://deb.debian.org/debian|${debian_mirror}|g" \
        -e "s|https://deb.debian.org/debian|${debian_mirror}|g" {} +; \
    fi \
    && apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src

ENV NODE_ENV=production
EXPOSE 3010

CMD ["node", "src/index.js"]
