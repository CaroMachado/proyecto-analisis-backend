// server.js - VERSIÓN FINAL Y COMPLETA CON CÁLCULO DE NPS A 1 DECIMAL
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const cors =require('cors');
const { createCanvas } = require('canvas');
const d3Cloud = require('d3-cloud');

const app = express();
const PORT = process.env.PORT || 3000;

// --- CONFIGURACIÓN DE CORS ---
const whitelist = ['https://devwebcm.com', 'http://localhost:5500', 'http://127.0.0.1:5500'];
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || whitelist.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    }
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());

app.get('/health', (req, res) => res.status(200).send('OK'));

// --- FUNCIONES AUXILIARES ---
const STOPWORDS = ['de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'ha', 'me', 'si', 'sin', 'sobre', 'muy', 'cuando', 'también', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'uno', 'ni', 'contra', 'ese', 'eso', 'mi', 'qué', 'e', 'son', 'fue', 'gracias', 'hola', 'buen', 'dia', 'punto', 'puntos'];

function getWordsFromString(text) {
    if (!text || typeof text !== 'string') return [];
    return text.toLowerCase().match(/\b(\w+)\b/g)?.filter(word => !STOPWORDS.includes(word) && word.length > 2) || [];
}

// --- CAMBIO CLAVE: Cálculo de Satisfacción con 1 decimal ---
function calculateSatisfaction(stats) {
    if (!stats || stats.total === 0) return 0;
    const promotores = stats.muy_positivas || 0;
    const detractores = (stats.negativas || 0) + (stats.muy_negativas || 0);
    const indice = ((promotores / stats.total) - (detractores / stats.total)) * 100;
    // Se cambia Math.round(indice) por esto para obtener un decimal:
    return parseFloat(indice.toFixed(1));
}

function parseDateTime(fechaCell, horaCell) {
    try {
        if (!fechaCell || !horaCell) return null;
        let baseDate = fechaCell instanceof Date ? fechaCell : new Date(fechaCell);
        if (isNaN(baseDate.getTime())) return null;
        let hours = 0, minutes = 0;
        if (horaCell instanceof Date) {
            hours = horaCell.getUTCHours(); minutes = horaCell.getUTCMinutes();
        } else if (typeof horaCell === 'number') {
            const totalSecondsInDay = horaCell * 86400;
            hours = Math.floor(totalSecondsInDay / 3600) % 24;
            minutes = Math.floor((totalSecondsInDay % 3600) / 60);
        } else if (typeof horaCell === 'string') {
            const parts = horaCell.split(':');
            hours = parseInt(parts[0], 10) || 0; minutes = parseInt(parts[1], 10) || 0;
        } else { return null; }
        const finalDate = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate(), hours, minutes));
        return isNaN(finalDate.getTime()) ? null : finalDate;
    } catch { return null; }
}

function analizarComentarioMasCritico(comentarios, topCriticos) {
    const fallbackMessage = "No se encontraron comentarios negativos específicos para analizar.";
    if (!comentarios || comentarios.length === 0) return fallbackMessage;
    let comentarioRepresentativo = "";
    let mejorPuntuacion = -1;
    const palabrasClaveCriticas = topCriticos.toLowerCase().split(', ').filter(Boolean);
    for (const comentario of comentarios) {
        let puntuacionActual = 0;
        const comentarioLower = comentario.toLowerCase();
        puntuacionActual += comentario.length / 50;
        for (const clave of palabrasClaveCriticas) {
            if (comentarioLower.includes(clave)) puntuacionActual += 5;
        }
        if (puntuacionActual > mejorPuntuacion) {
            mejorPuntuacion = puntuacionActual;
            comentarioRepresentativo = comentario;
        }
    }
    if (comentarioRepresentativo) {
        return `<strong>Análisis de un comentario representativo:</strong><br>"<em>${comentarioRepresentativo}</em>"`;
    } else {
        const comentarioMasLargo = comentarios.reduce((a, b) => a.length > b.length ? a : b, "");
        if (comentarioMasLargo) return `<strong>Análisis de un comentario representativo:</strong><br>"<em>${comentarioMasLargo}</em>"`;
    }
    return fallbackMessage;
}

function generarNubeComoImagen(wordList, colorPalette) {
    if (!wordList || wordList.length === 0) {
        return Promise.resolve(null);
    }
    
    return new Promise(resolve => {
        const canvas = createCanvas(800, 600);
        const ctx = canvas.getContext('2d');
        const maxWeight = Math.max(...wordList.map(item => item[1]));
        const minWeight = Math.min(...wordList.map(item => item[1]));
        
        const words = wordList.map(item => ({
            text: item[0],
            size: 10 + 90 * ((item[1] - minWeight) / (maxWeight - minWeight || 1)),
            color: item[1] > (maxWeight / 3) ? colorPalette.strong : colorPalette.light
        }));

        const layout = d3Cloud()
            .size([800, 600])
            .canvas(() => createCanvas(1, 1))
            .words(words)
            .padding(5)
            .rotate(() => (Math.random() > 0.5) ? 0 : 90)
            .font('DejaVu Sans')
            .fontSize(d => d.size)
            .on('end', (words) => {
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, 800, 600);
                
                ctx.save();
                ctx.translate(400, 300);
                words.forEach(word => {
                    ctx.save();
                    ctx.translate(word.x, word.y);
                    ctx.rotate(word.rotate * Math.PI / 180);
                    ctx.font = `${word.size}px ${word.font}`;
                    ctx.fillStyle = word.color;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(word.text, 0, 0);
                    ctx.restore();
                });
                ctx.restore();
                
                resolve(canvas.toDataURL().split(',')[1]);
            });

        layout.start();
    });
}


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
            nubes: { positiva: [], negativa: [] },
            fechas: [],
        };
        const dailyDetails = {};
        const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        const worksheet = workbook.worksheets[0];
        
        let columnMap = {};
        worksheet.getRow(1).eachCell((cell, colNumber) => {
            if (cell.value) columnMap[cell.value.toString().toLowerCase().trim().replace(/ /g, '_')] = colNumber;
        });
        
        const requiredColumns = ['fecha', 'hora', 'sector', 'ubicacion', 'calificacion_descripcion'];
        for (const col of requiredColumns) {
            if (!columnMap[col]) return res.status(400).json({ success: false, message: `El archivo Excel no contiene la columna requerida: "${col}"` });
        }
        
        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            try {
                const jsDate = parseDateTime(row.getCell(columnMap['fecha']).value, row.getCell(columnMap['hora']).value);
                if (!jsDate) return;
                const diaSemana = DIAS_SEMANA[jsDate.getUTCDay()];
                const fechaStr = jsDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
                const hora = jsDate.getUTCHours();
                const sector = String(row.getCell(columnMap['sector']).value || '').trim();
                const ubicacion = String(row.getCell(columnMap['ubicacion']).value || '').trim();
                const sectorKey = sector && ubicacion ? `${sector} - ${ubicacion}` : (sector || ubicacion);
                if (!sectorKey) return;
                const calificacionDesc = String(row.getCell(columnMap['calificacion_descripcion']).value || '').trim();
                const comentario = String(row.getCell(columnMap['comentarios'])?.value || '').trim();
                const puntoCritico = String(row.getCell(columnMap['puntos_criticos'])?.value || '').trim();
                const puntoDestacado = String(row.getCell(columnMap['destacados'])?.value || '').trim();

                if (!processedData.porDia[diaSemana]) {
                    processedData.porDia[diaSemana] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0, sectoresDelDia: [] };
                    dailyDetails[diaSemana] = { valoracionesPorHora: Array.from({ length: 24 }, () => ({ muy_positivas: 0, sectoresPositivos: {} })), sectores: {} };
                }
                if (!processedData.fechas.includes(fechaStr)) {
                    processedData.fechas.push(fechaStr);
                }
                if (!processedData.porSector[sectorKey]) {
                    processedData.porSector[sectorKey] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 };
                }
                if (!dailyDetails[diaSemana].sectores[sectorKey]) {
                    dailyDetails[diaSemana].sectores[sectorKey] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0, criticos: {}, destacados: {}, comentarios: [] };
                }

                processedData.general.total++;
                processedData.porDia[diaSemana].total++;
                processedData.porHora[hora].total++;
                processedData.porSector[sectorKey].total++;
                dailyDetails[diaSemana].sectores[sectorKey].total++;

                if (puntoCritico) dailyDetails[diaSemana].sectores[sectorKey].criticos[puntoCritico] = (dailyDetails[diaSemana].sectores[sectorKey].criticos[puntoCritico] || 0) + 1;
                if (puntoDestacado) dailyDetails[diaSemana].sectores[sectorKey].destacados[puntoDestacado] = (dailyDetails[diaSemana].sectores[sectorKey].destacados[puntoDestacado] || 0) + 1;
                if (calificacionDesc === 'Negativa' || calificacionDesc === 'Muy Negativa') {
                    if (comentario) dailyDetails[diaSemana].sectores[sectorKey].comentarios.push(comentario);
                }

                switch (calificacionDesc) {
                    case 'Muy Positiva':
                        processedData.general.muy_positivas++; processedData.porDia[diaSemana].muy_positivas++; processedData.porHora[hora].muy_positivas++; processedData.porSector[sectorKey].muy_positivas++; dailyDetails[diaSemana].sectores[sectorKey].muy_positivas++; dailyDetails[diaSemana].valoracionesPorHora[hora].muy_positivas++; dailyDetails[diaSemana].valoracionesPorHora[hora].sectoresPositivos[sectorKey] = (dailyDetails[diaSemana].valoracionesPorHora[hora].sectoresPositivos[sectorKey] || 0) + 1;
                        if (comentario) processedData.nubes.positiva.push(...getWordsFromString(comentario));
                        break;
                    case 'Positiva':
                        processedData.general.positivas++; processedData.porDia[diaSemana].positivas++; processedData.porHora[hora].positivas++; processedData.porSector[sectorKey].positivas++; dailyDetails[diaSemana].sectores[sectorKey].positivas++;
                        if (comentario) processedData.nubes.positiva.push(...getWordsFromString(comentario));
                        break;
                    case 'Negativa':
                        processedData.general.negativas++; processedData.porDia[diaSemana].negativas++; processedData.porHora[hora].negativas++; processedData.porSector[sectorKey].negativas++; dailyDetails[diaSemana].sectores[sectorKey].negativas++;
                        if (comentario) processedData.nubes.negativa.push(...getWordsFromString(comentario));
                        break;
                    case 'Muy Negativa':
                        processedData.general.muy_negativas++; processedData.porDia[diaSemana].muy_negativas++; processedData.porHora[hora].muy_negativas++; processedData.porSector[sectorKey].muy_negativas++; dailyDetails[diaSemana].sectores[sectorKey].muy_negativas++;
                        if (comentario) processedData.nubes.negativa.push(...getWordsFromString(comentario));
                        break;
                }
            } catch (e) { console.warn(`Se ignoró la fila ${rowNumber} por un error de formato.`); }
        });

        if (processedData.general.total === 0) return res.status(400).json({ success: false, message: 'El archivo no contiene filas con un formato válido.' });
        
        for (const dia of Object.keys(dailyDetails)) {
            const detallesSectoresDia = dailyDetails[dia].sectores;
            const sectoresCalculados = [];
            for (const nombreSector in detallesSectoresDia) {
                const statsSector = detallesSectoresDia[nombreSector];
                if (statsSector.total > 0) {
                    statsSector.satisfaccion = calculateSatisfaction(statsSector);
                    sectoresCalculados.push({ nombre: nombreSector, stats: statsSector });
                }
            }
            if (processedData.porDia[dia]) {
                processedData.porDia[dia].sectoresDelDia = sectoresCalculados;
            }
        }

        processedData.fechas.sort((a, b) => { const [dayA, monthA, yearA] = a.split('/'); const [dayB, monthB, yearB] = b.split('/'); return new Date(`${yearA}-${monthA}-${dayA}`) - new Date(`${yearB}-${monthB}-${dayB}`); });
        processedData.fechas = processedData.fechas.map(f => f.split('/')[0]);
        const getTopItems = (obj, count = 3) => Object.entries(obj).sort(([, a], [, b]) => b - a).slice(0, count).map(([name]) => name).join(', ');
        
        for (const dia in processedData.porDia) {
            let sectorMasCritico = { nombre: 'N/A', satisfaccion: 101, criticos: 'N/A', total: 0, comentarios: [] };
            if (processedData.porDia[dia].sectoresDelDia) {
                processedData.porDia[dia].sectoresDelDia.forEach(({ nombre, stats }) => {
                    if (stats.total < 3) return;
                    if (stats.satisfaccion < sectorMasCritico.satisfaccion) {
                        sectorMasCritico = { nombre: nombre, satisfaccion: stats.satisfaccion, criticos: getTopItems(stats.criticos, 3) || 'comentarios generales', total: stats.total, comentarios: stats.comentarios };
                    }
                });
            }
            const picoPositivo = dailyDetails[dia].valoracionesPorHora.reduce((p, c, i) => c.muy_positivas > p.count ? { hora: i, count: c.muy_positivas } : p, { hora: -1, count: -1 });
            const conclusionIA = analizarComentarioMasCritico(sectorMasCritico.comentarios, sectorMasCritico.criticos);
            processedData.porDia[dia].analisis = { picoPositivo: { hora: picoPositivo.hora, count: picoPositivo.count, sectores: picoPositivo.hora !== -1 ? getTopItems(dailyDetails[dia].valoracionesPorHora[picoPositivo.hora].sectoresPositivos) : 'N/A' }, sectorCritico: sectorMasCritico, conclusionIA: conclusionIA };
        }

        processedData.general.satisfaccion = calculateSatisfaction(processedData.general);
        for (const dia in processedData.porDia) { processedData.porDia[dia].satisfaccion = calculateSatisfaction(processedData.porDia[dia]); }
        processedData.porHora.forEach(hora => { hora.satisfaccion = calculateSatisfaction(hora); });
        for (const sector in processedData.porSector) { processedData.porSector[sector].satisfaccion = calculateSatisfaction(processedData.porSector[sector]); }
        
        const countWords = (arr) => arr.reduce((acc, w) => { acc[w] = (acc[w] || 0) + 1; return acc; }, {});
        let positiveList = Object.entries(countWords(processedData.nubes.positiva)).sort((a, b) => b[1] - a[1]).slice(0, 50);
        let negativeList = Object.entries(countWords(processedData.nubes.negativa)).sort((a, b) => b[1] - a[1]).slice(0, 50);
        
        const greenPalette = { strong: '#43a047', light: '#7cb342' };
        const redPalette = { strong: '#d32f2f', light: '#fb8c00' };

        const nubePositivaB64 = await generarNubeComoImagen(positiveList, greenPalette);
        const nubeNegativaB64 = await generarNubeComoImagen(negativeList, redPalette);
        
        processedData.nubes = {
            positiva_b64: nubePositivaB64,
            negativa_b64: nubeNegativaB64
        };
        
        res.json({ success: true, data: processedData });

    } catch (error) {
        console.error('Error fatal al procesar el archivo:', error.stack || error);
        res.status(500).json({ success: false, message: 'Hubo un error crítico al procesar el archivo Excel.' });
    }
});

app.listen(PORT, () => console.log(`✅ Servidor corriendo en el puerto ${PORT}`));
