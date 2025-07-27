// server.js - VERSIÓN FINAL CON ANÁLISIS DETALLADO Y REAL
const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const cors = require('cors');

const app = express();
app.use(cors());
const PORT = process.env.PORT || 3000;

// Constantes y funciones auxiliares
const STOPWORDS = ['de','la','que','el','en','y','a','los','del','se','las','por','un','para','con','no','una','su','al','lo','como','más','pero','sus','le','ya','o','este','ha','me','si','sin','sobre','este','muy','cuando','también','hasta','hay','donde','quien','desde','todo','nos','durante','uno','ni','contra','ese','eso','mi','qué','e','son','fue','muy','gracias','hola','buen','dia','punto','puntos'];
function getWordsFromString(text) { if (!text || typeof text !== 'string') return []; return text.toLowerCase().match(/\b(\w+)\b/g)?.filter(word => !STOPWORDS.includes(word) && word.length > 3) || []; }
const calculateSatisfaction = (stats) => { if (stats.total === 0) return 0; const promotores = stats.muy_positivas + stats.positivas; const detractores = stats.negativas + stats.muy_negativas; return Math.round(((promotores - detractores) / stats.total) * 100); };

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post('/procesar', upload.single('archivoExcel'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No se subió ningún archivo.' });

        // Estructuras de datos para el análisis
        const processedData = {
            general: { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 },
            porDia: {},
            porHora: Array.from({ length: 24 }, () => ({ muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 })),
            porSector: {},
            comentarios: { positivos: [], negativos: [] },
            fechas: [],
        };
        const dailyDetails = {}; // Para el análisis profundo por día
        const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(req.file.buffer);
        
        const worksheet = workbook.worksheets[0];
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber === 1) return;

            const fechaCell = row.getCell('A').value;
            if (!fechaCell || !(fechaCell instanceof Date) || isNaN(new Date(fechaCell).getTime())) return;
            
            const jsDate = new Date(fechaCell);
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

            // Inicializar estructuras si es la primera vez que vemos el día
            if (!processedData.porDia[diaSemana]) {
                processedData.porDia[diaSemana] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 };
                dailyDetails[diaSemana] = {
                    valoracionesPorHora: Array.from({ length: 24 }, () => ({ muy_positivas: 0, muy_negativas: 0, sectoresPositivos: {}, sectoresNegativos: {} })),
                    criticos: {},
                    destacados: {}
                };
                processedData.fechas.push(fecha);
            }
            if (!processedData.porSector[sectorKey]) {
                processedData.porSector[sectorKey] = { muy_positivas: 0, positivas: 0, negativas: 0, muy_negativas: 0, total: 0 };
            }

            // Acumuladores generales
            processedData.general.total++;
            processedData.porDia[diaSemana].total++;
            processedData.porHora[hora].total++; // Agregación por hora para el gráfico general
            processedData.porSector[sectorKey].total++;

            if (puntoCritico) dailyDetails[diaSemana].criticos[puntoCritico] = (dailyDetails[diaSemana].criticos[puntoCritico] || 0) + 1;
            if (puntoDestacado) dailyDetails[diaSemana].destacados[puntoDestacado] = (dailyDetails[diaSemana].destacados[puntoDestacado] || 0) + 1;

            // Procesamiento por tipo de calificación
            switch (calificacionDesc) {
                case 'Muy Positiva':
                    processedData.general.muy_positivas++;
                    processedData.porDia[diaSemana].muy_positivas++;
                    processedData.porHora[hora].muy_positivas++;
                    processedData.porSector[sectorKey].muy_positivas++;
                    dailyDetails[diaSemana].valoracionesPorHora[hora].muy_positivas++;
                    dailyDetails[diaSemana].valoracionesPorHora[hora].sectoresPositivos[sectorKey] = (dailyDetails[diaSemana].valoracionesPorHora[hora].sectoresPositivos[sectorKey] || 0) + 1;
                    if (comentario) processedData.comentarios.positivos.push(...getWordsFromString(comentario));
                    break;
                case 'Positiva':
                    processedData.general.positivas++;
                    processedData.porDia[diaSemana].positivas++;
                    processedData.porHora[hora].positivas++;
                    processedData.porSector[sectorKey].positivas++;
                    if (comentario) processedData.comentarios.positivos.push(...getWordsFromString(comentario));
                    break;
                case 'Negativa':
                    processedData.general.negativas++;
                    processedData.porDia[diaSemana].negativas++;
                    processedData.porHora[hora].negativas++;
                    processedData.porSector[sectorKey].negativas++;
                    if (comentario) processedData.comentarios.negativos.push(...getWordsFromString(comentario));
                    break;
                case 'Muy Negativa':
                    processedData.general.muy_negativas++;
                    processedData.porDia[diaSemana].muy_negativas++;
                    processedData.porHora[hora].muy_negativas++;
                    processedData.porSector[sectorKey].muy_negativas++;
                    dailyDetails[diaSemana].valoracionesPorHora[hora].muy_negativas++;
                    dailyDetails[diaSemana].valoracionesPorHora[hora].sectoresNegativos[sectorKey] = (dailyDetails[diaSemana].valoracionesPorHora[hora].sectoresNegativos[sectorKey] || 0) + 1;
                    if (comentario) processedData.comentarios.negativos.push(...getWordsFromString(comentario));
                    break;
            }
        });

        if (processedData.general.total === 0) {
            return res.status(400).json({ success: false, message: 'No se encontraron filas con datos válidos en el Excel.' });
        }

        // POST-PROCESAMIENTO: Generar el análisis detallado
        const getTopItems = (obj, count = 1) => Object.entries(obj).sort(([, a], [, b]) => b - a).slice(0, count).map(([name]) => name).join(', ');

        for (const dia in processedData.porDia) {
            const detalles = dailyDetails[dia];
            const picoPositivo = detalles.valoracionesPorHora.reduce((p, c, i) => c.muy_positivas > p.count ? { hora: i, count: c.muy_positivas } : p, { hora: -1, count: -1 });
            const picoNegativo = detalles.valoracionesPorHora.reduce((p, c, i) => c.muy_negativas > p.count ? { hora: i, count: c.muy_negativas } : p, { hora: -1, count: -1 });
            
            processedData.porDia[dia].analisis = {
                picoPositivo,
                picoNegativo,
                sectorPicoPositivo: picoPositivo.hora !== -1 ? getTopItems(detalles.valoracionesPorHora[picoPositivo.hora].sectoresPositivos) : 'N/A',
                sectorPicoNegativo: picoNegativo.hora !== -1 ? getTopItems(detalles.valoracionesPorHora[picoNegativo.hora].sectoresNegativos) : 'N/A',
                topDestacados: getTopItems(detalles.destacados, 4) || 'varios motivos',
                topCriticos: getTopItems(detalles.criticos, 5) || 'varios motivos'
            };
        }

        // Cálculo final de satisfacción y nubes
        processedData.general.satisfaccion = calculateSatisfaction(processedData.general);
        for (const dia in processedData.porDia) { processedData.porDia[dia].satisfaccion = calculateSatisfaction(processedData.porDia[dia]); }
        for (const hora in processedData.porHora) { processedData.porHora[hora].satisfaccion = calculateSatisfaction(processedData.porHora[hora]); }
        for (const sector in processedData.porSector) { processedData.porSector[sector].satisfaccion = calculateSatisfaction(processedData.porSector[sector]); }
        processedData.nubes = { positiva: getWordsFromString(processedData.comentarios.positivos.join(' ')), negativa: getWordsFromString(processedData.comentarios.negativos.join(' ')) };
        
        res.json({ success: true, data: processedData });
    } catch (error) {
        console.error('Error fatal al procesar el archivo:', error);
        res.status(500).json({ success: false, message: 'Hubo un error crítico al leer el archivo Excel.' });
    }
});

app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));```

#### **Paso 3: Archivo `script.js` con Gráficos y Tarjetas Corregidas (Para Hostinger)**

Reemplaza el `script.js` de tu Hostinger con esta versión. Utiliza toda la nueva información del servidor y corrige la generación del PDF.

```javascript
// script.js - VERSIÓN FINAL CON TODAS LAS CORRECCIONES
document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    const reporteContainer = document.getElementById('reporte-container');
    const loader = document.getElementById('loader');
    const errorDiv = document.getElementById('error');
    const downloadBtn = document.getElementById('downloadPdf');
    const API_URL = 'https://proyecto-analisis-backend-znf7.onrender.com/procesar';

    Chart.register(ChartDataLabels);

    uploadForm.addEventListener('submit', function(e) {
        e.preventDefault();
        loader.style.display = 'block';
        errorDiv.style.display = 'none';
        reporteContainer.innerHTML = '';
        downloadBtn.style.display = 'none';

        fetch(API_URL, { method: 'POST', body: new FormData(this) })
        .then(response => response.ok ? response.json() : response.json().then(err => { throw new Error(err.message || 'Error del servidor') }))
        .then(result => {
            loader.style.display = 'none';
            if (result.success && result.data.general.total > 0) {
                generarInforme(result.data);
                downloadBtn.style.display = 'block';
            } else {
                 errorDiv.textContent = 'Error: ' + (result.message || 'No se encontraron datos.');
                 errorDiv.style.display = 'block';
            }
        })
        .catch(err => {
            loader.style.display = 'none';
            errorDiv.textContent = 'Error: ' + err.message;
        });
    });

    const COLORS = { muy_positiva: '#28a745', positiva: '#8fbc8f', negativa: '#fd7e14', muy_negativa: '#dc3545', nps_line: '#343a40' };

    downloadBtn.addEventListener('click', function() {
        loader.style.display = 'block';
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'pt', 'a4', true); // 'true' para compresión
        const pages = reporteContainer.querySelectorAll('.report-page');
        
        let promises = Array.from(pages).map(page => html2canvas(page, { scale: 2.5, useCORS: true, backgroundColor: null }));

        Promise.all(promises).then(canvases => {
            canvases.forEach((canvas, index) => {
                const imgData = canvas.toDataURL('image/png', 0.95); // Calidad 95%
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                if (index > 0) pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            });
            pdf.save('Informe-Satisfaccion-Hipodromo.pdf');
            loader.style.display = 'none';
        });
    });
    
    function generarPaginaDia(dia, data) {
        const diaData = data.porDia[dia];
        const analisis = diaData.analisis;

        const conclusionPositiva = `El pico de valoraciones <strong>Muy Positivas</strong> fue a las <strong>${analisis.picoPositivo.hora}hs</strong> (${analisis.picoPositivo.count} respuestas), destacándose en el sector <strong>${analisis.sectorPicoPositivo}</strong>. Los motivos más elegidos fueron: ${analisis.topDestacados}.`;
        const conclusionNegativa = `La hora más crítica fue a las <strong>${analisis.picoNegativo.hora}hs</strong> con <strong>${analisis.picoNegativo.count}</strong> valoraciones <strong>Muy Negativas</strong>, principalmente en <strong>${analisis.sectorPicoNegativo}</strong>. Las oportunidades de mejora se observan en: ${analisis.topCriticos}.`;
        
        let sectoresDelDia = Object.entries(data.porSector).filter(([, stats]) => stats.total > 2).sort((a, b) => b[1].satisfaccion - a[1].satisfaccion);
        const mejoresSectores = sectoresDelDia.slice(0, 7);
        const peoresSectores = sectoresDelDia.slice(-7).sort((a, b) => b[1].satisfaccion - a[1].satisfaccion); // Orden descendente

        return `<div class="report-page"><h2 style="text-transform: uppercase;">${dia}</h2><div class="day-details-container"><div class="summary-cards"><div class="summary-card"><span class="icon">👍</span><p>Recibimos <strong>${diaData.muy_positivas}</strong> calificaciones Muy Positivas y <strong>${diaData.muy_negativas}</strong> Muy Negativas.</p></div><div class="summary-card"><span class="icon">✔️</span><p>${conclusionPositiva}</p></div><div class="summary-card"><span class="icon">📚</span><p>${conclusionNegativa}</p></div></div><div class="sector-tables"><div class="sector-table"><h3>Sectores con mayor nivel de satisfacción</h3>${generarTablaSectores(mejoresSectores)}</div><div class="sector-table"><h3>Sectores con menor nivel de satisfacción</h3>${generarTablaSectores(peoresSectores)}</div></div></div></div>`;
    }

    function generarInforme(data) {
        const fechas = [...new Set(data.fechas)].join(', ');
        const ordenSemanas = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        const diasOrdenados = Object.keys(data.porDia).sort((a, b) => ordenSemanas.indexOf(a) - ordenSemanas.indexOf(b));

        reporteContainer.innerHTML = `<div class="report-page"><h1>INFORME<br>FIN DE SEMANA<br>${fechas}</h1></div><div class="report-page"><h2>SATISFACCIÓN POR DÍA</h2><div class="chart-container"><canvas id="satisfaccionPorDiaChart"></canvas></div></div><div class="report-page"><h2>ANÁLISIS DE COMENTARIOS</h2><div class="wordcloud-container"><div class="wordcloud-box"><h3>Palabras Clave Positivas</h3><canvas id="wordCloudCanvasPositive"></canvas></div><div class="wordcloud-box"><h3>Palabras Clave Negativas</h3><canvas id="wordCloudCanvasNegative"></canvas></div></div></div><div class="report-page"><h2>SATISFACCIÓN POR HORA</h2><div class="chart-container"><canvas id="satisfaccionPorHoraChart"></canvas></div></div>${diasOrdenados.map(dia => generarPaginaDia(dia, data)).join('')}<div class="report-page" style="justify-content:center;"><h1 style="font-size: 36px;">Muchas gracias</h1></div>`;
        renderGraficos(data, diasOrdenados);
        renderNubes(data.nubes);
    }
    
    function renderGraficos(data, diasOrdenados) {
        const ctxDia = document.getElementById('satisfaccionPorDiaChart').getContext('2d');
        new Chart(ctxDia, { type: 'bar', data: { labels: diasOrdenados, datasets: [ { type: 'line', label: 'Índice de Satisfacción', data: diasOrdenados.map(d => data.porDia[d].satisfaccion), borderColor: COLORS.nps_line, yAxisID: 'y1', tension: 0.1, datalabels: { align: 'top', anchor: 'end', backgroundColor: 'rgba(52, 58, 64, 0.75)', borderRadius: 4, color: 'white', font: { weight: 'bold' }, padding: 6, formatter: (value) => value.toFixed(2) } }, { label: 'Muy Positivas', data: diasOrdenados.map(d => data.porDia[d].muy_positivas), backgroundColor: COLORS.muy_positiva, stack: 'Stack 0', datalabels: { display: false } }, { label: 'Positivas', data: diasOrdenados.map(d => data.porDia[d].positivas), backgroundColor: COLORS.positiva, stack: 'Stack 0', datalabels: { display: false } }, { label: 'Negativas', data: diasOrdenados.map(d => data.porDia[d].negativas), backgroundColor: COLORS.negativa, stack: 'Stack 0', datalabels: { display: false } }, { label: 'Muy Negativas', data: diasOrdenados.map(d => data.porDia[d].muy_negativas), backgroundColor: COLORS.muy_negativa, stack: 'Stack 0', datalabels: { display: false } }, ] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { stacked: true, title: { display: true, text: 'Cantidad de Respuestas' } }, y1: { position: 'right', min: -100, max: 100, title: { display: true, text: 'Índice de Satisfacción (-100 a 100)' }, grid: { drawOnChartArea: false } } }, plugins: { legend: { position: 'top' }, datalabels: { display: (context) => context.dataset.type === 'line' } } } });

        const ctxHora = document.getElementById('satisfaccionPorHoraChart').getContext('2d');
        new Chart(ctxHora, { type: 'bar', data: { labels: Array.from({length: 24}, (_, i) => i), datasets: [ { type: 'line', label: 'Índice de Satisfacción', data: data.porHora.map(h => h.satisfaccion), borderColor: COLORS.nps_line, yAxisID: 'y1', tension: 0.4, datalabels: { display: false } }, { label: 'Muy Positivas', data: data.porHora.map(h => h.muy_positivas), backgroundColor: COLORS.muy_positiva, stack: 'Stack 0' }, { label: 'Positivas', data: data.porHora.map(h => h.positivas), backgroundColor: COLORS.positiva, stack: 'Stack 0' }, { label: 'Negativas', data: data.porHora.map(h => h.negativas), backgroundColor: COLORS.negativa, stack: 'Stack 0' }, { label: 'Muy Negativas', data: data.porHora.map(h => h.muy_negativas), backgroundColor: COLORS.muy_negativa, stack: 'Stack 0' }, ] }, options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Hora del Día' } }, y: { stacked: true, title: { display: true, text: 'Cantidad de Respuestas' } }, y1: { position: 'right', min: -100, max: 100, title: { display: true, text: 'Índice de Satisfacción' }, grid: { drawOnChartArea: false } } }, plugins: { legend: { position: 'top' }, datalabels: {display: false} } } });
    }

    function renderNubes(nubesData) {
        const countWords = (arr) => arr.reduce((acc, word) => { acc[word] = (acc[word] || 0) + 1; return acc; }, {});
        const positiveWords = Object.entries(countWords(nubesData.positiva));
        const negativeWords = Object.entries(countWords(nubesData.negativa));
        const options = { list: [], gridSize: 10, weightFactor: 8, fontFamily: 'system-ui, sans-serif', minSize: 12, shuffle: false, rotateRatio: 0.3, shape: 'circle', backgroundColor: '#ffffff' };
        if (positiveWords.length > 0) WordCloud(document.getElementById('wordCloudCanvasPositive'), { ...options, list: positiveWords.slice(0, 60), color: (word, weight) => weight > 5 ? COLORS.muy_positiva : COLORS.positiva });
        if (negativeWords.length > 0) WordCloud(document.getElementById('wordCloudCanvasNegative'), { ...options, list: negativeWords.slice(0, 60), color: (word, weight) => weight > 2 ? COLORS.muy_negativa : COLORS.negativa });
    }

    function generarTablaSectores(sectores) {
        if (sectores.length === 0) return '<p>No hay suficientes datos para mostrar.</p>';
        return `<table><thead><tr><th>Sector - Ubicación</th><th>Respuestas</th><th>Satisfacción</th><th>Gráfico</th></tr></thead><tbody>${sectores.map(([key, stats]) => `<tr><td>${key}</td><td>${stats.total}</td><td>${stats.satisfaccion.toFixed(2)}</td><td><div class="nps-bar-container"><div class="nps-bar" style="width: ${Math.max(0, (stats.satisfaccion + 100) / 2)}%;"></div></div></td></tr>`).join('')}</tbody></table>`;
    }
});
