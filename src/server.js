"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
// Cria uma instância do Express
var app = express_1.default();
// Define a porta na qual o servidor vai rodar
var PORT = process.env.PORT || 3000;
// Define uma rota básica
app.get('/', function (req, res) {
    // Enviando uma resposta de tudo ok e setando o codigo como 200
    res.status(200).send('Hello World!');
});
// Inicia o servidor
app.listen(PORT, function () {
    console.log("Server is running on http://localhost:" + PORT);
});
