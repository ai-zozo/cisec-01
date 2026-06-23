FROM node:20-slim

# Prisma זקוק ל-openssl ול-CA certs
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# מתקינים תלויות
COPY package.json ./
RUN npm install --omit=dev && npm install prisma@^5.22.0

# מעתיקים את כל הקוד (כולל prisma/schema + קבצי seed xlsx)
COPY . .

# מייצרים את Prisma client
RUN npx prisma generate

RUN mkdir -p /app/backups

EXPOSE 4000

# init.js מריץ migrate deploy + seed (idempotent) ואז מרים את השרת
CMD ["npm", "run", "start"]
