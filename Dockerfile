# Use a imagem oficial do Node.js como base
FROM node:18-alpine

# Cria e define o diretório de trabalho
WORKDIR /app

# Copia o package.json e o package-lock.json para o contêiner
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia o restante do código para o contêiner
COPY . .

# Compila o TypeScript
RUN npm run build

# Expõe a porta da aplicação
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "dist/index.js"]