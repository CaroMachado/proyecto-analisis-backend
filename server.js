// server.js -> PARA RENDER
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const path = require('path');
const stream = require('stream');
const cors = require('cors'); // Se añade CORS

const app = express();
const PORT = process.env.PORT || 3000;

// *** CONFIGURACIÓN ESENCIAL DE CORS ***
// Esto le da permiso a tu página en Hostinger para que pueda hacerle peticiones a este servidor.
app.use(cors());

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
        await workbook.xlsx.load(req.file.buffer);
        
        const worksheet = workbook.worksheets[0];
        worksheet.eachRow({ includeEmpty: false }, function(row, rowNumber) {
            if (rowNumber === 1) return;

            const fechaCell = row.getCell('A').value;
            if (!fechaCell) return;
            
            let jsDate = fechaCell instanceof Date ? fechaCell : new Date(fechaCell);
            if (isNaN(jsDate.getTime())) return;
            
            const diaSemana = DIAS_SEMANA[jsDate.getDay()];
            const fecha = jsDate.toLocaleDateString('es-AR', { day: '2-digit' });
            const hora = jsDate.getHours();
            uniqueDates[fecha] = true;

            const sector = String(row.getCell('D').value || '').trim();
            const ubicacion = String(row.getCell('E').value || '').trim();
            const sectorKey = sector && ubicacion ? `${sector} - ${ubicacion}` : (sector || ubicacion);
            if (!sectorKey) return;

            const comentario = String(row.getCell('F').value || '');
            const puntoCritico = String(row.getCell('H').value || '').trim();
            const calificacionDesc = String(row.getCell('I').value || '').trim();
            const puntoDestacado = String(row.getCell('J').value || '').trim();

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
            return res.status(400).json({ success: false, message: 'No se encontraron filas con datos de fecha válidos en el archivo Excel.' });
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
