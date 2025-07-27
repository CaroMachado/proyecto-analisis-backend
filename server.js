// server.js FINAL Y CORRECTO
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs'); // La nueva librería eficiente
const path = require('path');
const stream = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const STOPWORDS = ['de','la','que','el','en','y','a','los','del','se','las','por','un','para','con','no','una','su','al','lo','como','más','pero','sus','le','ya','o','este','ha','me','si','sin','sobre','este','muy','cuando','también','hasta','hay','donde','quien','desde','todo','nos','durante','uno','ni','contra','ese','eso','mi','qué','e','son','fue','muy','gracias','hola','buen','dia','punto','puntos'];
function getWordsFromString(text) { if (!text || typeof text !== 'string') return []; const textLower = text.toLowerCase(); const words = textLower.match(/\b(\w+)\b/g) || []; return words.filter(word => !STOPWORDS.includes(word) && word.length > 3); }
const calculateSatisfaction = (stats) => { if (stats.total === 0) return 0; const promotores = stats.muy_positivas + stats.positivas; const detractores = stats.negativas + stats.muy_negativas; return Math.round(((promotores - detractores) / stats.total) * 100); };

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/procesar', upload.single('archivoExcel'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No se subió ningún archivo.' });
        }

        const processedData = { general: { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 }, porDia: {}, porHora: Array.from({ length: 24 }, () => ({ muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 })), porSector: {}, comentarios: { positivos: [], negativos: [] }, fechas: [], puntosCriticos: {}, puntosDestacados: {} };
        const uniqueDates = {};
        const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        const workbook = new ExcelJS.Workbook();
        const buffer = req.file.buffer;
        const readStream = new stream.PassThrough();
        readStream.end(buffer);

        await workbook.xlsx.read(readStream);
        
        const worksheet = workbook.worksheets[0];
        worksheet.eachRow({ includeEmpty: false }, function(row, rowNumber) {
            if (rowNumber === 1) return;

            const fechaCell = row.getCell(1).value;
            if (!fechaCell || !(fechaCell instanceof Date)) return;

            const jsDate = fechaCell;
            const diaSemana = DIAS_SEMANA[jsDate.getDay()];
            const fecha = jsDate.toLocaleDateString('es-AR', { day: '2-digit' });
            const hora = jsDate.getHours();
            uniqueDates[fecha] = true;

            const sector = String(row.getCell(4).value || '').trim();
            const ubicacion = String(row.getCell(5).value || '').trim();
            const sectorKey = `${sector} - ${ubicacion}`;
            const comentario = String(row.getCell(6).value || '');
            const puntoCritico = String(row.getCell(8).value || '').trim();
            const calificacionDesc = String(row.getCell(9).value || '').trim();
            const puntoDestacado = String(row.getCell(10).value || '').trim();

            if (!processedData.porDia[diaSemana]) { processedData.porDia[diaSemana] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0, criticos: {}, destacados: {} }; }
            if (!processedData.porSector[sectorKey]) { processedData.porSector[sectorKey] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 }; }

            processedData.general.total++;
            processedData.porDia[diaSemana].total++;
            processedData.porHora[hora].total++;
            processedData.porSector[sectorKey].total++;

            if (puntoCritico) { processedData.porDia[diaSemana].criticos[puntoCritico] = (processedData.porDia[diaSemana].criticos[puntoCritico] || 0) + 1; }
            if (puntoDestacado) { processedData.porDia[diaSemana].destacados[puntoDestacado] = (processedData.porDia[diaSemana].destacados[puntoDestacado] || 0) + 1; }

            switch (calificacionDesc) {
                case 'Muy Positiva': processedData.general.muy_positivas++; processedData.porDia[diaSemana].muy_positivas++; processedData.porHora[hora].muy_positivas++; processedData.porSector[sectorKey].muy_positivas++; if(comentario) processedData.comentarios.positivos.push(...getWordsFromString(comentario)); break;
                case 'Positiva': processedData.general.positivas++; processedData.porDia[diaSemana].positivas++; processedData.porHora[hora].positivas++; processedData.porSector[sectorKey].positivas++; if(comentario) processedData.comentarios.positivos.push(...getWordsFromString(comentario)); break;
                case 'Negativa': processedData.general.negativas++; processedData.porDia[diaSemana].negativas++; processedData.porHora[hora].negativas++; processedData.porSector[sectorKey].negativas++; if(comentario) processedData.comentarios.negativos.push(...getWordsFromString(comentario)); break;
                case 'Muy Negativa': processedData.general.muy_negativas++; processedData.porDia[diaSemana].muy_negativas++; processedData.porHora[hora].muy_negativas++; processedData.porSector[sectorKey].muy_negativas++; if(comentario) processedData.comentarios.negativos.push(...getWordsFromString(comentario)); break;
            }
        });

        if (processedData.general.total === 0) {
            return res.status(400).json({ success: false, message: 'No se encontraron filas con datos válidos en el archivo.' });
        }

        processedData.fechas = Object.keys(uniqueDates);
        processedData.general.satisfaccion = calculateSatisfaction(processedData.general);
        for (const dia in processedData.porDia) { processedData.porDia[dia].satisfaccion = calculateSatisfaction(processedData.porDia[dia]); }
        for (const hora in processedData.porHora) { processedData.porHora[hora].satisfaccion = calculateSatisfaction(processedData.porHora[hora]); }
        for (const sector in processedData.porSector) { processedData.porSector[sector].satisfaccion = calculateSatisfaction(processedData.porSector[sector]); }
        const countWords = (arr) => arr.reduce((acc, word) => { acc[word] = (acc[word] || 0) + 1; return acc; }, {});
        processedData.nubes = { positiva: countWords(processedData.comentarios.positivos), negativa: countWords(processedData.comentarios.negativos) };
        
        res.json({ success: true, data: processedData });

    } catch (error) {
        console.error('Error fatal al procesar el archivo:', error);
        res.status(500).json({ success: false, message: 'Hubo un error crítico al leer el archivo Excel.' });
    }
});

app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
