// script.js - VERSIÓN FINAL CON VISUALIZACIÓN DE NUBE COMO IMAGEN
document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    const reporteContainer = document.getElementById('reporte-container');
    const loader = document.getElementById('loader');
    const errorDiv = document.getElementById('error');
    const downloadBtn = document.getElementById('downloadPdf');
    
    // CORRECCIÓN: Referencia correcta al input del archivo
    const archivoInput = document.getElementById('archivoExcel'); 

    const API_URL = 'https://proyecto-analisis-backend-znf7.onrender.com/procesar';
    const COLORS = {
        muy_positiva: '#28a745', positiva: '#5cb85c', negativa: '#e74c3c',
        muy_negativa: '#dc3545', nps_line: '#343a40'
    };

    Chart.register(ChartDataLabels);

    uploadForm.addEventListener('submit', function(e) {
        e.preventDefault();
        loader.style.display = 'block';
        errorDiv.style.display = 'none';
        reporteContainer.innerHTML = '';
        downloadBtn.style.display = 'none';
        
        // CORRECCIÓN: Usar el FormData del formulario directamente
        const formData = new FormData(uploadForm);

        fetch(API_URL, { method: 'POST', body: formData })
        .then(async response => {
            if (!response.ok) {
                // Si la respuesta es 400, el servidor enviará un mensaje específico.
                const errorData = await response.json().catch(() => ({ message: `Error ${response.status}: ${response.statusText}` }));
                throw new Error(errorData.message || 'Error desconocido del servidor');
            }
            return response.json();
        })
        .then(result => {
            loader.style.display = 'none';
            if (result.success && result.data.general.total > 0) {
                generarInforme(result.data);
                downloadBtn.style.display = 'block';
            } else {
                errorDiv.textContent = 'Error: ' + (result.message || 'No se encontraron datos válidos.');
                errorDiv.style.display = 'block';
            }
        })
        .catch(err => {
            loader.style.display = 'none';
            errorDiv.textContent = 'Error: ' + err.message;
            errorDiv.style.display = 'block';
        });
    });

    downloadBtn.addEventListener('click', function() {
        loader.style.display = 'block';
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'pt', 'a4', true);
        const pages = reporteContainer.querySelectorAll('.report-page');

        const promises = Array.from(pages).map(page =>
            html2canvas(page, { scale: 2.5, useCORS: true, backgroundColor: null })
        );

        Promise.all(promises).then(canvases => {
            canvases.forEach((canvas, index) => {
                const imgData = canvas.toDataURL('image/png', 0.95);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();
                if (index > 0) pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            });
            pdf.save('Informe-Satisfaccion-Hipodromo.pdf');
            loader.style.display = 'none';
        });
    });

    function generarInforme(data) {
        const fechas = [...new Set(data.fechas)].join(', ');
        const ordenSemanas = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
        const diasOrdenados = Object.keys(data.porDia).sort((a, b) => ordenSemanas.indexOf(a) - ordenSemanas.indexOf(b));

        reporteContainer.innerHTML = `
            <div class="report-page"><h1>INFORME<br>FIN DE SEMANA<br>${fechas}</h1></div>
            <div class="report-page"><h2>SATISFACCIÓN POR DÍA</h2><div class="chart-container"><canvas id="satisfaccionPorDiaChart"></canvas></div></div>
            <div class="report-page"><h2>ANÁLISIS DE COMENTARIOS</h2><div class="wordcloud-container"><div class="wordcloud-box"><h3>Palabras Clave Positivas</h3><div id="wordCloudPositive" class="wordcloud-image"></div></div><div class="wordcloud-box"><h3>Palabras Clave Negativas</h3><div id="wordCloudNegative" class="wordcloud-image"></div></div></div></div>
            <div class="report-page"><h2>SATISFACCIÓN POR HORA</h2><div class="chart-container"><canvas id="satisfaccionPorHoraChart"></canvas></div></div>
            ${diasOrdenados.map(dia => generarPaginaDia(dia, data)).join('')}
            <div class="report-page" style="justify-content:center;"><h1 style="font-size: 36px;">Muchas gracias</h1></div>`;

        renderGraficos(data, diasOrdenados);
        renderNubes(data.nubes);
    }

    function generarPaginaDia(dia, data) {
        const diaData = data.porDia[dia];
        const analisis = diaData.analisis;

        const resumenPositivo = `Se recibieron <strong>${diaData.muy_positivas}</strong> calificaciones Muy Positivas.`;
        const picoPositivo = analisis.picoPositivo.hora !== -1 
            ? `El pico de valoraciones <strong>Muy Positivas</strong> fue a las <strong>${analisis.picoPositivo.hora}hs</strong> (${analisis.picoPositivo.count} respuestas), destacándose en: <strong>${analisis.picoPositivo.sectores}</strong>.` 
            : "No hubo un pico destacable de valoraciones positivas.";
        
        let insightCritico = "No se identificó un sector particularmente crítico durante el día.";
        if (analisis.sectorCritico.nombre !== 'N/A') {
            insightCritico = `El sector con menor satisfacción fue <strong>${analisis.sectorCritico.nombre}</strong> (índice ${analisis.sectorCritico.satisfaccion}). Los motivos principales de queja fueron: <strong>${analisis.sectorCritico.criticos}</strong>.
            <br><br><strong>Análisis de Comentarios:</strong><br><div class="ia-conclusion">${analisis.conclusionIA.replace(/\n/g, '<br>')}</div>`;
        }
        
        const sectoresDelDia = diaData.sectoresDelDia || [];
        sectoresDelDia.sort((a, b) => b.stats.satisfaccion - a.stats.satisfaccion);

        const mejores = sectoresDelDia.slice(0, 5);
        const peores = sectoresDelDia.slice(-5).reverse();

        return `
            <div class="report-page">
                <h2 style="text-transform: uppercase;">${dia}</h2>
                <div class="day-details-container">
                    <div class="summary-cards">
                        <div class="summary-card"><span class="icon">👍</span><p>${resumenPositivo}<br><br>${picoPositivo}</p></div>
                        <div class="summary-card"><span class="icon">🚨</span><p>${insightCritico}</p></div>
                    </div>
                    <div class="sector-tables">
                        <div class="sector-table"><h3>Mejores Sectores (del Día)</h3>${generarTablaSectores(mejores)}</div>
                        <div class="sector-table"><h3>Sectores a Mejorar (del Día)</h3>${generarTablaSectores(peores)}</div>
                    </div>
                </div>
            </div>`;
    }

    function renderGraficos(data, diasOrdenados) {
        const ctxDia = document.getElementById('satisfaccionPorDiaChart').getContext('2d');
        new Chart(ctxDia, {
            type: 'bar',
            data: { labels: diasOrdenados, datasets: [ { type: 'line', label: 'Índice de Satisfacción', data: diasOrdenados.map(d => data.porDia[d].satisfaccion), borderColor: COLORS.nps_line, yAxisID: 'y1', tension: 0.1, datalabels: { align: 'top', anchor: 'end', backgroundColor: 'rgba(52, 58, 64, 0.75)', borderRadius: 4, color: 'white', font: { weight: 'bold' }, padding: 6, formatter: v => v.toFixed(0) } }, { label: 'Muy Positivas', data: diasOrdenados.map(d => data.porDia[d].muy_positivas), backgroundColor: COLORS.muy_positiva, stack: 'Stack 0', datalabels: { display: false } }, { label: 'Positivas', data: diasOrdenados.map(d => data.porDia[d].positivas), backgroundColor: COLORS.positiva, stack: 'Stack 0', datalabels: { display: false } }, { label: 'Negativas', data: diasOrdenados.map(d => data.porDia[d].negativas), backgroundColor: COLORS.negativa, stack: 'Stack 0', datalabels: { display: false } }, { label: 'Muy Negativas', data: diasOrdenados.map(d => data.porDia[d].muy_negativas), backgroundColor: COLORS.muy_negativa, stack: 'Stack 0', datalabels: { display: false } } ] },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { stacked: true, title: { display: true, text: 'Cantidad de Respuestas' } }, y1: { position: 'right', min: -100, max: 100, title: { display: true, text: 'Índice de Satisfacción' }, grid: { drawOnChartArea: false } } }, plugins: { legend: { position: 'top' }, datalabels: { display: ctx => ctx.dataset.type === 'line' } } }
        });
        const ctxHora = document.getElementById('satisfaccionPorHoraChart').getContext('2d');
        new Chart(ctxHora, {
            type: 'bar',
            data: { labels: Array.from({ length: 24 }, (_, i) => `${i}:00`), datasets: [ { type: 'line', label: 'Índice de Satisfacción', data: data.porHora.map(h => h.satisfaccion), borderColor: COLORS.nps_line, yAxisID: 'y1', tension: 0.4, datalabels: { display: true, align: 'top', anchor: 'end', font: { size: 9 }, color: COLORS.nps_line, formatter: (value, context) => data.porHora[context.dataIndex].total > 0 ? value.toFixed(0) : '', backgroundColor: 'rgba(255, 255, 255, 0.6)', borderRadius: 3, padding: { top: 2, bottom: 1, left: 4, right: 4 } } }, { label: 'Muy Positivas', data: data.porHora.map(h => h.muy_positivas), backgroundColor: COLORS.muy_positiva, stack: 'Stack 0' }, { label: 'Positivas', data: data.porHora.map(h => h.positivas), backgroundColor: COLORS.positiva, stack: 'Stack 0' }, { label: 'Negativas', data: data.porHora.map(h => h.negativas), backgroundColor: COLORS.negativa, stack: 'Stack 0' }, { label: 'Muy Negativas', data: data.porHora.map(h => h.muy_negativas), backgroundColor: COLORS.muy_negativa, stack: 'Stack 0' } ] },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { title: { display: true, text: 'Hora del Día' } }, y: { stacked: true, title: { display: true, text: 'Cantidad de Respuestas' } }, y1: { position: 'right', min: -100, max: 100, title: { display: true, text: 'Índice de Satisfacción' }, grid: { drawOnChartArea: false } } }, plugins: { legend: { position: 'top' }, datalabels: { display: ctx => ctx.dataset.type === 'line' } } }
        });
    }

    function renderNubes(nubesData) {
        const positiveContainer = document.getElementById('wordCloudPositive');
        const negativeContainer = document.getElementById('wordCloudNegative');

        if (nubesData.positiva_b64) {
            positiveContainer.innerHTML = `<img src="data:image/png;base64,${nubesData.positiva_b64}" alt="Nube de palabras positivas" style="width: 100%; height: auto;">`;
        } else {
            positiveContainer.style.display = 'flex';
            positiveContainer.style.alignItems = 'center';
            positiveContainer.style.justifyContent = 'center';
            positiveContainer.textContent = "No hay datos suficientes.";
        }

        if (nubesData.negativa_b64) {
            negativeContainer.innerHTML = `<img src="data:image/png;base64,${nubesData.negativa_b64}" alt="Nube de palabras negativas" style="width: 100%; height: auto;">`;
        } else {
            negativeContainer.style.display = 'flex';
            negativeContainer.style.alignItems = 'center';
            negativeContainer.style.justifyContent = 'center';
            negativeContainer.textContent = "No hay datos suficientes.";
        }
    }

    function generarTablaSectores(sectores) {
        if (!sectores.length) return '<p>No hay datos de sectores para este día.</p>';
        return `<table><thead><tr><th>Sector - Ubicación</th><th>Resp.</th><th>Satisf.</th><th>Gráfico</th></tr></thead><tbody>${sectores.map(({ nombre, stats }) => `<tr><td>${nombre}</td><td>${stats.total}</td><td>${stats.satisfaccion.toFixed(0)}</td><td><div class="nps-bar-container"><div class="nps-bar" style="width: ${(stats.satisfaccion + 100) / 2}%;"></div></div></td></tr>`).join('')}</tbody></table>`;
    }
});
