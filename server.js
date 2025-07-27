// server.js - VERSIÓN FINAL CON ANÁLISIS DETALLADO
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

const STOPWORDS = ['de','la','que','el','en','y','a','los','del','se','las','por','un','para','con','no','una','su','al','lo','como','más','pero','sus','le','ya','o','este','ha','me','si','sin','sobre','este','muy','cuando','también','hasta','hay','donde','quien','desde','todo','nos','durante','uno','ni','contra','ese','eso','mi','qué','e','son','fue','muy','gracias','hola','buen','dia','punto','puntos'];
function getWordsFromString(text) { if (!text || typeof text !== 'string') return []; const textLower = text.toLowerCase(); const words = textLower.match(/\b(\w+)\b/g) || []; return words.filter(word => !STOPWORDS.includes(word) && word.length > 3); }
const calculateSatisfaction = (stats) => { if (stats.total === 0) return 0; const promotores = stats.muy_positivas + stats.positivas; const detractores = stats.negativas + stats.muy_negativas; return Math.round(((promotores - detractores) / stats.total) * 100); };

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/procesar', upload.single('archivoExcel'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No se subió ningún archivo.' });

        const processedData = {
            general: { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 },
            porDia: {},
            porHora: Array.from({ length: 24 }, () => ({ muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 })),
            porSector: {},
            comentarios: { positivos: [], negativos: [] },
            fechas: [],
        };
        const dailyDetails = {}; // Para el análisis profundo
        const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        
        const worksheet = workbook.worksheets[0];
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;
            const fechaCell = row.getCell('A').value;
            if (!fechaCell) return;
            
            let jsDate = fechaCell instanceof Date ? fechaCell : new Date(fechaCell);
            if (isNaN(jsDate.getTime())) return;
            
            const diaSemana = DIAS_SEMANA[jsDate.getDay()];
            const fecha = jsDate.toLocaleDateString('es-AR', { day: '2-digit' });
            const hora = jsDate.getHours();
            
            const sector = String(row.getCell('D').value || '').trim();
            const ubicacion = String(row.getCell('E').value || '').trim();
            const sectorKey = sector && ubicacion ? `${sector} - ${ubicacion}` : (sector || ubicacion);
            if (!sectorKey) return;
            
            const comentario = String(row.getCell('F').value || '');
            const puntoCritico = String(row.getCell('H').value || '').trim();
            const calificacionDesc = String(row.getCell('I').value || '').trim();
            const puntoDestacado = String(row.getCell('J').value || '').trim();
            
            if (!processedData.porDia[diaSemana]) {
                processedData.porDia[diaSemana] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 };
                dailyDetails[diaSemana] = { valoracionesPorHora: Array.from({ length: 24 }, () => ({ positivas: 0, negativas: 0 })), criticos: {}, destacados: {} };
                processedData.fechas.push(fecha);
            }
            
            if (!processedData.porSector[sectorKey]) {
                processedData.porSector[sectorKey] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 };
            }

            processedData.general.total++;
            processedData.porDia[diaSemana].total++;
            processedData.porHora[hora].total++;
            processedData.porSector[sectorKey].total++;

            if (puntoCritico) dailyDetails[diaSemana].criticos[puntoCritico] = (dailyDetails[diaSemana].criticos[puntoCritico] || 0) + 1;
            if (puntoDestacado) dailyDetails[diaSemana].destacados[puntoDestacado] = (dailyDetails[diaSemana].destacados[puntoDestacado] || 0) + 1;

            let esPositiva = false;
            let esNegativa = false;
            switch (calificacionDesc) {
                case 'Muy Positiva': esPositiva = true; processedData.general.muy_positivas++; processedData.porDia[diaSemana].muy_positivas++; processedData.porHora[hora].muy_positivas++; processedData.porSector[sectorKey].muy_positivas++; break;
                case 'Positiva': esPositiva = true; processedData.general.positivas++; processedData.porDia[diaSemana].positivas++; processedData.porHora[hora].positivas++; processedData.porSector[sectorKey].positivas++; break;
                case 'Negativa': esNegativa = true; processedData.general.negativas++; processedData.porDia[diaSemana].negativas++; processedData.porHora[hora].negativas++; processedData.porSector[sectorKey].negativas++; break;
                case 'Muy Negativa': esNegativa = true; processedData.general.muy_negativas++; processedData.porDia[diaSemana].muy_negativas++; processedData.porHora[hora].muy_negativas++; processedData.porSector[sectorKey].muy_negativas++; break;
            }
            if (esPositiva) {
                dailyDetails[diaSemana].valoracionesPorHora[hora].positivas++;
                if (comentario) processedData.comentarios.positivos.push(...getWordsFromString(comentario));
            }
            if (esNegativa) {
                dailyDetails[diaSemana].valoracionesPorHora[hora].negativas++;
                if (comentario) processedData.comentarios.negativos.push(...getWordsFromString(comentario));
            }
        });

        if (processedData.general.total === 0) {
            return res.status(400).json({ success: false, message: 'No se encontraron filas con datos válidos en el Excel.' });
        }

        const getTopItems = (obj, count) => Object.entries(obj).sort(([, a], [, b]) => b - a).slice(0, count).map(([name]) => name).join(', ');
        
        for (const dia in processedData.porDia) {
            const detalles = dailyDetails[dia];
            const picoPositivo = detalles.valoracionesPorHora.reduce((p, c, i) => c.positivas > p.count ? { hora: i, count: c.positivas } : p, { hora: -1, count: -1 });
            const picoNegativo = detalles.valoracionesPorHora.reduce((p, c, i) => c.negativas > p.count ? { hora: i, count: c.negativas } : p, { hora: -1, count: -1 });

            processedData.porDia[dia].analisis = {
                picoPositivo,
                picoNegativo,
                topDestacados: getTopItems(detalles.destacados, 4) || 'varios motivos',
                topCriticos: getTopItems(detalles.criticos, 5) || 'varios motivos'
            };
        }

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
