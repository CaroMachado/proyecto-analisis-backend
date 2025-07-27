const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ... (El resto de las funciones auxiliares como STOPWORDS, etc., no cambian)
const STOPWORDS = [
    'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un',
    'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus',
    'le', 'ya', 'o', 'este', 'ha', 'me', 'si', 'sin', 'sobre', 'este', 'muy',
    'cuando', 'también', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo',
    'nos', 'durante', 'uno', 'ni', 'contra', 'ese', 'eso', 'mi', 'qué', 'e', 'son',
    'fue', 'muy', 'gracias', 'hola', 'buen', 'dia', 'punto', 'puntos'
];
function getWordsFromString(text) { if (!text || typeof text !== 'string') return []; const textLower = text.toLowerCase(); const words = textLower.match(/\b(\w+)\b/g) || []; return words.filter(word => !STOPWORDS.includes(word) && word.length > 3); }
const calculateSatisfaction = (stats) => { if (stats.total === 0) return 0; const promotores = stats.muy_positivas + stats.positivas; const detractores = stats.negativas + stats.muy_negativas; return Math.round(((promotores - detractores) / stats.total) * 100); };
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


// *** RUTA /PROCESAR CON DIAGNÓSTICOS ***
app.post('/procesar', upload.single('archivoExcel'), (req, res) => {
    
    // MENSAJE 1
    console.log('[DIAGNÓSTICO] 1. Petición POST a /procesar recibida.');

    try {
        if (!req.file) {
            console.log('[DIAGNÓSTICO] ERROR: No se recibió ningún archivo.');
            return res.status(400).json({ success: false, message: 'No se subió ningún archivo.' });
        }

        // MENSAJE 2
        console.log(`[DIAGNÓSTICO] 2. Archivo recibido: ${req.file.originalname}, Tamaño: ${req.file.size} bytes.`);

        // MENSAJE 3
        console.log('[DIAGNÓSTICO] 3. Intentando leer el archivo con la librería XLSX...');
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        
        // MENSAJE 4
        console.log('[DIAGNÓSTICO] 4. Archivo leído correctamente. Extrayendo datos de la hoja...');
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet, { header: 1, cellDates: true, raw: false });
        
        // MENSAJE 5
        console.log(`[DIAGNÓSTICO] 5. Datos extraídos. Se encontraron ${data.length - 1} filas para procesar.`);

        // ... (El resto de la lógica de procesamiento sigue aquí)
        let processedData = { general: { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 }, porDia: {}, porHora: Array.from({ length: 24 }, () => ({ muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 })), porSector: {}, comentarios: { positivos: [], negativos: [] }, fechas: [], puntosCriticos: {}, puntosDestacados: {} };
        let uniqueDates = {};
        const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || !row[0] || !(row[0] instanceof Date)) continue;
            const jsDate = row[0]; const diaSemana = DIAS_SEMANA[jsDate.getDay()]; const fecha = jsDate.toLocaleDateString('es-AR', { day: '2-digit' }); const hora = jsDate.getHours();
            uniqueDates[fecha] = true;
            const sector = String(row[3] || '').trim(); const ubicacion = String(row[4] || '').trim(); const sectorKey = `${sector} - ${ubicacion}`; const comentario = String(row[5] || ''); const puntoCritico = String(row[7] || '').trim(); const calificacionDesc = String(row[8] || '').trim(); const puntoDestacado = String(row[9] || '').trim();
            if (!processedData.porDia[diaSemana]) { processedData.porDia[diaSemana] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0, criticos: {}, destacados: {} }; }
            if (!processedData.porSector[sectorKey]) { processedData.porSector[sectorKey] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 }; }
            processedData.general.total++; processedData.porDia[diaSemana].total++; processedData.porHora[hora].total++; processedData.porSector[sectorKey].total++;
            if (puntoCritico) { processedData.porDia[diaSemana].criticos[puntoCritico] = (processedData.porDia[diaSemana].criticos[puntoCritico] || 0) + 1; }
            if (puntoDestacado) { processedData.porDia[diaSemana].destacados[puntoDestacado] = (processedData.porDia[diaSemana].destacados[puntoDestacado] || 0) + 1; }
            switch (calificacionDesc) {
                case 'Muy Positiva': processedData.general.muy_positivas++; processedData.porDia[diaSemana].muy_positivas++; processedData.porHora[hora].muy_positivas++; processedData.porSector[sectorKey].muy_positivas++; if(comentario) processedData.comentarios.positivos.push(...getWordsFromString(comentario)); break;
                case 'Positiva': processedData.general.positivas++; processedData.porDia[diaSemana].positivas++; processedData.porHora[hora].positivas++; processedData.porSector[sectorKey].positivas++; if(comentario) processedData.comentarios.positivos.push(...getWordsFromString(comentario)); break;
                case 'Negativa': processedData.general.negativas++; processedData.porDia[diaSemana].negativas++; processedData.porHora[hora].negativas++; processedData.porSector[sectorKey].negativas++; if(comentario) processedData.comentarios.negativos.push(...getWordsFromString(comentario)); break;
                case 'Muy Negativa': processedData.general.muy_negativas++; processedData.porDia[diaSemana].muy_negativas++; processedData.porHora[hora].muy_negativas++; processedData.porSector[sectorKey].muy_negativas++; if(comentario) processedData.comentarios.negativos.push(...getWordsFromString(comentario)); break;
            }
        }

        // MENSAJE 6
        console.log('[DIAGNÓSTICO] 6. Bucle de procesamiento de filas completado.');
        
        processedData.fechas = Object.keys(uniqueDates);
        processedData.general.satisfaccion = calculateSatisfaction(processedData.general);
        for (const dia in processedData.porDia) { processedData.porDia[dia].satisfaccion = calculateSatisfaction(processedData.porDia[dia]); }
        for (const hora in processedData.porHora) { processedData.porHora[hora].satisfaccion = calculateSatisfaction(processedData.porHora[hora]); }
        for (const sector in processedData.porSector) { processedData.porSector[sector].satisfaccion = calculateSatisfaction(processedData.porSector[sector]); }
        const countWords = (arr) => arr.reduce((acc, word) => { acc[word] = (acc[word] || 0) + 1; return acc; }, {});
        processedData.nubes = { positiva: countWords(processedData.comentarios.positivos), negativa: countWords(processedData.comentarios.negativos) };
        
        // MENSAJE 7
        console.log('[DIAGNÓSTICO] 7. Todos los cálculos finalizados. Enviando respuesta JSON.');

        res.json({ success: true, data: processedData });

    } catch (error) {
        // Si el código falla en cualquier punto del 'try', se ejecutará esto.
        console.error('[DIAGNÓSTICO] ERROR FATAL DENTRO DEL TRY-CATCH:', error);
        res.status(500).json({ success: false, message: 'Error interno del servidor al procesar el Excel.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
