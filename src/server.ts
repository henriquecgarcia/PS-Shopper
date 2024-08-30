import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fs from "fs";

const Connection = require('database-js').Connection;

dotenv.config();

// To use the File API, add this import path for GoogleAIFileManager.
// Note that this is a different import path than what you use for generating content.
// For versions lower than @google/generative-ai@0.13.0
// use "@google/generative-ai/files"
import { GoogleGenerativeAI } from "@google/generative-ai";

// Cria uma instância do Express
const app = express();

// Define a porta na qual o servidor vai rodar
const PORT = process.env.PORT || 3000;
const GEMINI_KEY = process.env.GEMINI_API_KEY || 'YOUR_API_KEY';

if (GEMINI_KEY === 'YOUR_API_KEY') {
	console.error('API Key não configurada');
	process.exit(1);
}

app.use(bodyParser.json());

const genAI = new GoogleGenerativeAI(GEMINI_KEY);

const db = new Connection('sqlite://./data.db');
function createDatabase() {
    let str = 'CREATE TABLE IF NOT EXISTS readings (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id VARCHAR(255), month_year VARCHAR(100), stored_data VARCHAR(255));';
    let stmt = db.prepareStatement(str);
    stmt.execute()
		.then((results : any) => {
			console.log('Readings table created.');
		})
		.catch((err: any) => {
			console.error('Failed to create readings table.');
		})
	;
}

if (!db) {
    console.error('Failed to connect to database.');
    process.exit(1);
}
createDatabase();

// Define uma rota básica
app.get('/', (req: Request, res: Response) => {
	// Repondendo acesso restrito
	res.send('Acesso restrito');
});

async function getDataFromDatabase(customer_id: string, month_year: string) {
    let query = `SELECT * FROM readings WHERE customer_id = '${customer_id}' AND month_year = '${month_year}'`;
    let stmt = db.prepareStatement(query);
	return await stmt.execute()
		.then((results: any) => {
			return results;
		})
		.catch((err: any) => {
			console.error('Failed to get data from database.', err);
			return null;
		})
	;
}

async function saveDataToDatabase(customer_id: string, month_year: string, stored_data: string) {
    let query = `INSERT INTO readings (customer_id, month_year, stored_data) VALUES ('${customer_id}', '${month_year}', '${stored_data}');`;
    let stmt = db.prepareStatement(query);
    return await stmt.execute()
        .then((results: any) => {
            return results;
        })
        .catch((err: any) => {
            console.error('Failed to save data to database.', err);
            return null;
        })
    ;
}

interface UploadRequestBody {
    image: string;
    customer_code: string;
    measure_datetime: string;
    measure_type: 'WATER' | 'GAS';
}

// Converts local file information to a GoogleGenerativeAI.Part object.
function fileToGenerativePart(pathBase64 : string, mimeType : string) {
    return {
        inlineData: {
            data: pathBase64,
            mimeType
        },
    };
}

async function getImageData(filePart : any, measure_type : string) {
    // Choose a Gemini model.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    const prompt = "Locate the value price of the " + measure_type + " meter reading in the image below.";

    const generatedContent = await model.generateContent([prompt, filePart]);

    console.log(generatedContent.response.text());
    return generatedContent.response;
}

// Request type: GET
// Request Body
// {
//	"image": "base64",
//	"customer_code": "string",
//	"measure_datetime": "datetime",
//	"measure_type": "WATER" ou "GAS"
// }
// Definindo a rota /upload para aceitar requisições POST
app.post('/upload', async (req: Request, res: Response) => {
    const { image, customer_code, measure_datetime, measure_type }: UploadRequestBody = req.body;

    if (!image) {
        return res.status(400).json({
            error_code: 'INVALID_DATA',
            error_description: 'Image is required.',
        });
    }
    if (!customer_code) {
        return res.status(400).json({
            error_code: 'INVALID_DATA',
            error_description: 'Customer code is required.',
        });
    }
    if (!measure_datetime) {
        return res.status(400).json({
            error_code: 'INVALID_DATA',
            error_description: 'Measure datetime is required.',
        });
    }
    if (measure_type !== 'GAS' && measure_type !== 'WATER') {
        return res.status(400).json({
            error_code: 'INVALID_DATA',
            error_description: 'Invalid measure type.',
        });
    }

    const isDuplicate = await getDataFromDatabase(customer_code, measure_datetime);
    if (isDuplicate.length > 0) {
        return res.status(409).json({
            error_code: 'DOUBLE_REPORT',
            error_description: 'Leitura do mês já realizada',
        });
    }


    try {

        let image_fixed = fileToGenerativePart(image, "image/jpeg");
        let value = await getImageData(image_fixed, measure_type);
        
        const measure_value = value.text();

        if (measure_value === '') {
            return res.status(400).json({
                error_code: 'INVALID_DATA',
                error_description: 'Valor não encontrado na imagem.',
            });
        }

        const stored_data = JSON.stringify({
            customer_code,
            measure_datetime,
            measure_type,
            measure_value,
        });

        let success = saveDataToDatabase(customer_code, measure_datetime, stored_data);
        if (success === null) {
            return res.status(500).json({
                error_code: 'DATABASE_ERROR',
                error_description: 'Erro ao salvar dados no banco de dados.',
            });
        }

        // saving the image to the disk
        const imagePath = `./images/${customer_code}-${measure_datetime}.jpg`;
        fs.writeFileSync(imagePath, image, 'base64');
        const imageUrl = `${req.protocol}://${req.get('host')}/images/${customer_code}-${measure_datetime}.jpg`;

        res.status(200).json({
            image_url: imageUrl,
            measure_value: measure_value.trim(),
            measure_uuid: `${customer_code}-${measure_datetime}`,
        });

    } catch (error) {
        console.error('Erro ao processar a imagem:', error);
        res.status(500).json({
            error_code: 'API_ERROR',
            error_description: 'Erro ao processar a imagem com a API do Google Gemini.',
        });
    }
});

// Rota para confirmar a leitura
// Request type: POST
// Request Body
// {
//    "measure_uuid": "string",
//    "confirmed_value": integer
// }
app.patch('/confirm', async (req: Request, res: Response) => {
    const { measure_uuid, confirmed_value } = req.body;

    if (!measure_uuid) {
        return res.status(400).json({
            error_code: 'INVALID_DATA',
            error_description: 'Measure UUID is required.',
        });
    }
    if (!confirmed_value) {
        return res.status(400).json({
            error_code: 'INVALID_DATA',
            error_description: 'Confirmed value is required.',
        });
    }

    const [customer_code, measure_datetime] = measure_uuid.split('-');

    const data = await getDataFromDatabase(customer_code, measure_datetime);
    if (!data || data.length === 0) {
        return res.status(404).json({
            error_code: 'DATA_NOT_FOUND',
            error_description: 'Data not found.',
        });
    }

    const stored_data = JSON.parse(data[0].stored_data);

    if (stored_data.measure_value === confirmed_value) {
        return res.status(409).json({
            error_code: 'CONFIRMATION_DUPLICATE',
            error_description: 'Leitura já confirmada',
        });
    }

    stored_data.measure_value = confirmed_value;
    const new_stored_data = JSON.stringify(stored_data);

    const query = `UPDATE readings SET stored_data = '${new_stored_data}' WHERE customer_id = '${customer_code}' AND month_year = '${measure_datetime}'`;
    let success = await db.prepareStatement(query).execute();
    if (success === null) {
        return res.status(500).json({
            error_code: 'DATABASE_ERROR',
            error_description: 'Erro ao salvar dados no banco de dados.',
        });
    }

    res.status(200).json({
        success: true,
    });
});

// Função para formatar as respostas na rota `/list`
app.get("/:client_id/list", async (req: Request, res: Response) => {
    const { client_id } = req.params;
    let measure_type = req.query.measure_type;

    if (!client_id) {
        return res.status(400).json({
            error_code: 'INVALID_DATA',
            error_description: 'Client ID is required.',
        });
    }

    let query = `SELECT * FROM readings WHERE customer_id = '${client_id}'`;
    if (measure_type === 'WATER' || measure_type === 'GAS') {
        query += ` AND stored_data LIKE '%${measure_type}%'`;
    } else if (measure_type) {
        return res.status(400).json({
            error_code: 'INVALID_TYPE',
            error_description: 'Tipo de medição não permitida',
        });
    }

    try {
        let stmt = db.prepareStatement(query);
        let results = await stmt.execute();
        if (results.length === 0) {
            return res.status(404).json({
                error_code: "MEASURES_NOT_FOUND",
                error_description: "Nenhuma leitura encontrada",
            });
        }

        const measures = results.map((result: any) => {
            const stored_data = JSON.parse(result.stored_data);
            return {
                measure_uuid: `${result.customer_id}-${result.month_year}`,
                measure_datetime: stored_data.measure_datetime,
                measure_type: stored_data.measure_type,
                has_confirmed: !!stored_data.measure_value,
                image_url: `${req.protocol}://${req.get('host')}/images/${result.customer_id}-${result.month_year}.jpg`,
            };
        });

        res.status(200).json({
            customer_code: client_id,
            measures,
        });
    } catch (err) {
        console.error('Failed to get data from database.', err);
        return res.status(500).json({
            error_code: "DATABASE_ERROR",
            error_description: "Erro ao acessar o banco de dados",
        });
    }
});

// Criando uma rota para acessar o arquivo de imagem
app.get('/images/:image', (req: Request, res: Response) => {
    const { image } = req.params;

    const path = `./images/${image}`;
    if (!fs.existsSync(path)) {
        return res.status(404).json({
            error_code: 'IMAGE_NOT_FOUND',
            error_description: 'Imagem não encontrada.',
        });
    }

    const file = fs.readFileSync(path);
    res.writeHead(200, { 'Content-Type': 'image/jpeg' });
    res.end(file, 'binary');

    return;
});

// Inicia o servidor
app.listen(PORT, () => {
	console.log(`Server is running on http://localhost:${PORT}`);
});