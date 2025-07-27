// Importar las librerías necesarias
const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const STOPWORDS = [
    'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un',
    'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus',
    'le', 'ya', 'o', 'este', 'ha', 'me', 'si', 'sin', 'sobre', 'este', 'muy',
    'cuando', 'también', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo',
    'nos', 'durante', 'uno', 'ni', 'contra', 'ese', 'eso', 'mi', 'qué', 'e', 'son',
    'fue', 'muy', 'gracias', 'hola', 'buen', 'dia', 'punto', 'puntos'
];

function getWordsFromString(text) {
    if (!text || typeof text !== 'string') return [];
    const textLower = text.toLowerCase();
    const words = textLower.match(/\b(\w+)\b/g) || [];
    return words.filter(word => !STOPWORDS.includes(word) && word.length > 3);
}

// *** FUNCIÓN DE CÁLCULO DE SATISFACCIÓN CORREGIDA ***
// Fórmula: ((% Promotores - % Detractores)) -> Resultado de -100 a 100
// Promotores: Muy Positivas + Positivas
// Detractores: Muy Negativas + Negativas
const calculateSatisfaction = (stats) => {
    if (stats.total === 0) return 0;
    const promotores = stats.muy_positivas + stats.positivas;
    const detractores = stats.negativas + stats.muy_negativas;
    return Math.round(((promotores - detractores) / stats.total) * 100);
};


app.post('/procesar', upload.single('archivoExcel'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No se subió ningún archivo.' });
        }

        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // *** LÓGICA DE LECTURA DE EXCEL MEJORADA ***
        // Se usa `cellDates: true` para que las fechas se conviertan a objetos de JS
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1, cellDates: true, raw: false });

        let processedData = {
            general: { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 },
            porDia: {},
            porHora: Array.from({ length: 24 }, () => ({ muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 })),
            porSector: {},
            comentarios: { positivos: [], negativos: [] },
            fechas: [],
            // *** NUEVO: Para guardar los puntos clave ***
            puntosCriticos: {},
            puntosDestacados: {}
        };
        
        let uniqueDates = {};
        const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        // Empezar desde la fila 1 para saltar el encabezado
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row[0] || !(row[0] instanceof Date)) continue; // Saltar si no hay fecha o no es válida

            const jsDate = row[0];
            const diaSemana = DIAS_SEMANA[jsDate.getDay()];
            const fecha = jsDate.toLocaleDateString('es-AR', { day: '2-digit' });
            const hora = jsDate.getHours();
            
            uniqueDates[fecha] = true;

            const sector = (row[2] || '').trim();
            const ubicacion = (row[3] || '').trim();
            const sectorKey = `${sector} - ${ubicacion}`;
            const calificacionDesc = (row[7] || '').trim();
            const comentario = (row[4] || '');
            
            // *** NUEVO: Leer las columnas de puntos críticos y destacados ***
            const puntoCritico = (row[8] || '').trim(); // Columna I
            const puntoDestacado = (row[9] || '').trim(); // Columna J

            if (!processedData.porDia[diaSemana]) {
                processedData.porDia[diaSemana] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0, criticos: {}, destacados: {} };
            }
            if (!processedData.porSector[sectorKey]) {
                processedData.porSector[sectorKey] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 };
            }

            processedData.general.total++;
            processedData.porDia[diaSemana].total++;
            processedData.porHora[hora].total++;
            processedData.porSector[sectorKey].total++;

            // Contar puntos críticos y destacados por día
            if (puntoCritico) {
                processedData.porDia[diaSemana].criticos[puntoCritico] = (processedData.porDia[diaSemana].criticos[puntoCritico] || 0) + 1;
            }
             if (puntoDestacado) {
                processedData.porDia[diaSemana].destacados[puntoDestacado] = (processedData.porDia[diaSemana].destacados[puntoDestacado] || 0) + 1;
            }

            switch (calificacionDesc) {
                case 'Muy Positiva':
                    processedData.general.muy_positivas++;
                    processedData.porDia[diaSemana].muy_positivas++;
                    processedData.porHora[hora].muy_positivas++;
                    processedData.porSector[sectorKey].muy_positivas++;
                    if(comentario) processedData.comentarios.positivos.push(...getWordsFromString(comentario));
                    break;
                case 'Positiva':
                    processedData.general.positivas++;
                    processedData.porDia[diaSemana].positivas++;
                    processedData.porHora[hora].positivas++;
                    processedData.porSector[sectorKey].positivas++;
                    if(comentario) processedData.comentarios.positivos.push(...getWordsFromString(comentario));
                    break;
                case 'Negativa':
                    processedData.general.negativas++;
                    processedData.porDia[diaSemana].negativas++;
                    processedData.porHora[hora].negativas++;
                    processedData.porSector[sectorKey].negativas++;
                    if(comentario) processedData.comentarios.negativos.push(...getWordsFromString(comentario));
                    break;
                case 'Muy Negativa':
                    processedData.general.muy_negativas++;
                    processedData.porDia[diaSemana].muy_negativas++;
                    processedData.porHora[hora].muy_negativas++;
                    processedData.porSector[sectorKey].muy_negativas++;
                    if(comentario) processedData.comentarios.negativos.push(...getWordsFromString(comentario));
                    break;
            }
        }
        
        processedData.fechas = Object.keys(uniqueDates);

        processedData.general.satisfaccion = calculateSatisfaction(processedData.general);
        for (const dia in processedData.porDia) {
            processedData.porDia[dia].satisfaccion = calculateSatisfaction(processedData.porDia[dia]);
        }
        for (const hora in processedData.porHora) {
            processedData.porHora[hora].satisfaccion = calculateSatisfaction(processedData.porHora[hora]);
        }
        for (const sector in processedData.porSector) {
            processedData.porSector[sector].satisfaccion = calculateSatisfaction(processedData.porSector[sector]);
        }

        const countWords = (arr) => arr.reduce((acc, word) => { acc[word] = (acc[word] || 0) + 1; return acc; }, {});
        processedData.nubes = {
            positiva: countWords(processedData.comentarios.positivos),
            negativa: countWords(processedData.comentarios.negativos)
        };
        
        res.json({ success: true, data: processedData });

    } catch (error) {
        console.error('Error procesando el archivo:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al procesar el Excel. Verifique que el formato sea correcto.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
