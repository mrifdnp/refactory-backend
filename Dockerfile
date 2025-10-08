# Gunakan image Node.js resmi
FROM node:20

# Set workdir
WORKDIR /app

# Copy package.json dan install dependencies
COPY package*.json ./
RUN npm install

# Copy seluruh kode
COPY . .

# Jalankan app
CMD ["npm", "start"]

# App jalan di port 3000
EXPOSE 3000
