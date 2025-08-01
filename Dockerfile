FROM node:18

# Instala dependencias para canvas
RUN apt-get update && \
    apt-get install -y \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    build-essential \
    g++

# Crea y configura el directorio de trabajo
WORKDIR /app

# Copia los archivos
COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
