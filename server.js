// server.js - VERSIÓN FINAL, ROBUSTA Y CON ANÁLISIS MEJORADO
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// --- FUNCIONES AUXILIARES ---
const STOPWORDS = ['de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no', 'una', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'o', 'este', 'ha', 'me', 'si', 'sin', 'sobre', 'muy', 'cuando', 'también', 'hasta', 'hay', 'donde', 'quien', 'desde', 'todo', 'nos', 'durante', 'uno', 'ni', 'contra', 'ese', 'eso', 'mi', 'qué', 'e', 'son', 'fue', 'gracias', 'hola', 'buen', 'dia', 'punto', 'puntos'];

function getWordsFromString(text) {
    if (!text || typeof text !== 'string') return [];
    // Acepta letras y números, útil para "Caja G4", etc.
    return text.toLowerCase().match(/\b(\w+)\b/g)?.filter(word => !STOPWORDS.includes(word) && word.length > 2) || [];
}

function calculateSatisfaction(stats) {
    if (!stats || stats.total === 0) return 0;
    const promotores = (stats.muy_positivas || 0) + (stats.positivas || 0);
    const detractores = (stats.negativas || 0) + (stats.muy_negativas || 0);
    return Math.round(((promotores - detractores) / stats.total) * 100);
}

function parseDateTime(fechaCell, horaCell) {
    try {
        if (!fechaCell || !horaCell) return null;
        let baseDate = fechaCell instanceof Date ? fechaCell : new Date(fechaCell);
        if (isNaN(baseDate.getTime())) return null;

        let hours = 0, minutes = 0, seconds = 0;
        if (horaCell instanceof Date) {
            hours = horaCell.getUTCHours(); minutes = horaCell.getUTCMinutes(); seconds = horaCell.getUTCSeconds();
        } else if (typeof horaCell === 'number') {
            const totalSecondsInDay = horaCell * 86400;
            hours = Math.floor(totalSecondsInDay / 3600) % 24;
            minutes = Math.floor((totalSecondsInDay % 3600) / 60);
        } else if (typeof horaCell === 'string') {
            const parts = horaCell.split(':');
            hours = parseInt(parts[0], 10) || 0; minutes = parseInt(parts[1], 10) || 0;
        } else {
            return null;
        }

        const finalDate = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), baseDate.getUTCDate(), hours, minutes, seconds));
        return isNaN(finalDate.getTime()) ? null : finalDate;
    } catch {
        return null;
    }
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
        // Estructura de datos mejorada para análisis profundo
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
                const fechaStr = jsDate.toLocaleDateString('es-AR', { day: '2-digit', timeZone: 'UTC' });
                const hora = jsDate.getUTCHours();

                const sector = String(row.getCell(columnMap['sector']).value || '').trim();
                const ubicacion = String(row.getCell(columnMap['ubicacion']).value || '').trim();
                const sectorKey = sector && ubicacion ? `${sector} - ${ubicacion}` : (sector || ubicacion);
                if (!sectorKey) return;

                const calificacionDesc = String(row.getCell(columnMap['calificacion_descripcion']).value || '').trim();
                const comentario = String(row.getCell(columnMap['comentarios'])?.value || '');
                const puntoCritico = String(row.getCell(columnMap['puntos_criticos'])?.value || '').trim();
                const puntoDestacado = String(row.getCell(columnMap['destacados'])?.value || '').trim();

                if (!processedData.porDia[diaSemana]) {
                    processedData.porDia[diaSemana] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 };
                    dailyDetails[diaSemana] = {
                        valoracionesPorHora: Array.from({ length: 24 }, () => ({ muy_positivas: 0, muy_negativas: 0, sectoresPositivos: {}, sectoresNegativos: {} })),
                        sectores: {} // <-- NUEVO: Aquí guardaremos los detalles por sector para cada día
                    };
                    if (!processedData.fechas.includes(fechaStr)) processedData.fechas.push(fechaStr);
                }

                if (!processedData.porSector[sectorKey]) {
                    processedData.porSector[sectorKey] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 };
                }

                // NUEVO: Inicializar el sector dentro del día si no existe
                if (!dailyDetails[diaSemana].sectores[sectorKey]) {
                    dailyDetails[diaSemana].sectores[sectorKey] = {
                        muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0,
                        criticos: {}, destacados: {}, comentarios: []
                    };
                }

                // Agregamos datos a todos los niveles
                processedData.general.total++;
                processedData.porDia[diaSemana].total++;
                processedData.porHora[hora].total++;
                processedData.porSector[sectorKey].total++;
                dailyDetails[diaSemana].sectores[sectorKey].total++;

                if (puntoCritico) dailyDetails[diaSemana].sectores[sectorKey].criticos[puntoCritico] = (dailyDetails[diaSemana].sectores[sectorKey].criticos[puntoCritico] || 0) + 1;
                if (puntoDestacado) dailyDetails[diaSemana].sectores[sectorKey].destacados[puntoDestacado] = (dailyDetails[diaSemana].sectores[sectorKey].destacados[puntoDestacado] || 0) + 1;
                if (comentario) dailyDetails[diaSemana].sectores[sectorKey].comentarios.push(comentario);


                switch (calificacionDesc) {
                    case 'Muy Positiva':
                        processedData.general.muy_positivas++; processedData.porDia[diaSemana].muy_positivas++; processedData.porHora[hora].muy_positivas++; processedData.porSector[sectorKey].muy_positivas++;
                        dailyDetails[diaSemana].sectores[sectorKey].muy_positivas++;
                        dailyDetails[diaSemana].valoracionesPorHora[hora].muy_positivas++;
                        dailyDetails[diaSemana].valoracionesPorHora[hora].sectoresPositivos[sectorKey] = (dailyDetails[diaSemana].valoracionesPorHora[hora].sectoresPositivos[sectorKey] || 0) + 1;
                        if (comentario) processedData.nubes.positiva.push(...getWordsFromString(comentario));
                        break;
                    case 'Positiva':
                        processedData.general.positivas++; processedData.porDia[diaSemana].positivas++; processedData.porHora[hora].positivas++; processedData.porSector[sectorKey].positivas++;
                        dailyDetails[diaSemana].sectores[sectorKey].positivas++;
                        if (comentario) processedData.nubes.positiva.push(...getWordsFromString(comentario));
                        break;
                    case 'Negativa':
                        processedData.general.negativas++; processedData.porDia[diaSemana].negativas++; processedData.porHora[hora].negativas++; processedData.porSector[sectorKey].negativas++;
                        dailyDetails[diaSemana].sectores[sectorKey].negativas++;
                        if (comentario) processedData.nubes.negativa.push(...getWordsFromString(comentario));
                        break;
                    case 'Muy Negativa':
                        processedData.general.muy_negativas++; processedData.porDia[diaSemana].muy_negativas++; processedData.porHora[hora].muy_negativas++; processedData.porSector[sectorKey].muy_negativas++;
                        dailyDetails[diaSemana].sectores[sectorKey].muy_negativas++;
                        dailyDetails[diaSemana].valoracionesPorHora[hora].muy_negativas++;
                        dailyDetails[diaSemana].valoracionesPorHora[hora].sectoresNegativos[sectorKey] = (dailyDetails[diaSemana].valoracionesPorHora[hora].sectoresNegativos[sectorKey] || 0) + 1;
                        if (comentario) processedData.nubes.negativa.push(...getWordsFromString(comentario));
                        break;
                }
            } catch (e) { console.warn(`Se ignoró la fila ${rowNumber} por un error de formato.`); }
        });

        if (processedData.general.total === 0) {
            return res.status(400).json({ success: false, message: 'El archivo no contiene filas con un formato válido.' });
        }

        // --- POST-PROCESAMIENTO Y GENERACIÓN DE ANÁLISIS INTELIGENTE ---
        const getTopItems = (obj, count = 3) => Object.entries(obj).sort(([, a], [, b]) => b - a).slice(0, count).map(([name]) => name).join(', ');

        for (const dia in processedData.porDia) {
            const detallesDia = dailyDetails[dia];

            // 1. Análisis de picos por hora (se mantiene)
            const picoPositivo = detallesDia.valoracionesPorHora.reduce((p, c, i) => c.muy_positivas > p.count ? { hora: i, count: c.muy_positivas } : p, { hora: -1, count: -1 });
            const picoNegativo = detallesDia.valoracionesPorHora.reduce((p, c, i) => c.muy_negativas > p.count ? { hora: i, count: c.muy_negativas } : p, { hora: -1, count: -1 });

            // 2. NUEVO: Análisis de los peores y mejores sectores del día
            let sectorMasCritico = { nombre: 'N/A', satisfaccion: 101, criticos: 'N/A', total: 0 };
            
            Object.entries(detallesDia.sectores).forEach(([nombreSector, statsSector]) => {
                if (statsSector.total < 3) return; // Ignorar sectores con pocas respuestas para evitar outliers
                
                const satisfaccionSector = calculateSatisfaction(statsSector);
                if (satisfaccionSector < sectorMasCritico.satisfaccion) {
                    sectorMasCritico = {
                        nombre: nombreSector,
                        satisfaccion: satisfaccionSector,
                        criticos: getTopItems(statsSector.criticos, 3) || 'comentarios generales negativos',
                        total: statsSector.total
                    };
                }
            });

            // 3. Ensamblar el objeto de análisis final para el día
            processedData.porDia[dia].analisis = {
                picoPositivo: {
                    hora: picoPositivo.hora,
                    count: picoPositivo.count,
                    sectores: picoPositivo.hora !== -1 ? getTopItems(detallesDia.valoracionesPorHora[picoPositivo.hora].sectoresPositivos) : 'N/A'
                },
                sectorCritico: sectorMasCritico
            };
        }

        // Cálculo de índices de satisfacción globales
        processedData.general.satisfaccion = calculateSatisfaction(processedData.general);
        for (const dia in processedData.porDia) processedData.porDia[dia].satisfaccion = calculateSatisfaction(processedData.porDia[dia]);
        processedData.porHora.forEach(hora => hora.satisfaccion = calculateSatisfaction(hora));
        for (const sector in processedData.porSector) processedData.porSector[sector].satisfaccion = calculateSatisfaction(processedData.porSector[sector]);
        
        res.json({ success: true, data: processedData });
    } catch (error) {
        console.error('Error fatal al procesar el archivo:', error);
        res.status(500).json({ success: false, message: 'Hubo un error crítico al leer el archivo Excel.' });
    }
});

app.listen(PORT, () => console.log(`✅ Servidor corriendo en el puerto ${PORT}`));
