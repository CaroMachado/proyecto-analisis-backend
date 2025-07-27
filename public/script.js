document.addEventListener('DOMContentLoaded', function() {
    const uploadForm = document.getElementById('uploadForm');
    const reporteContainer = document.getElementById('reporte-container');
    const loader = document.getElementById('loader');
    const errorDiv = document.getElementById('error');
    const downloadBtn = document.getElementById('downloadPdf');

    const COLORS = {
        muy_positiva: '#28a745', // Verde fuerte
        positiva: '#8fbc8f',     // Verde claro
        negativa: '#fd7e14',     // Naranja
        muy_negativa: '#dc3545', // Rojo
        nps_line: '#343a40'
    };

    uploadForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(this);

        loader.style.display = 'block';
        errorDiv.style.display = 'none';
        reporteContainer.innerHTML = '';
        downloadBtn.style.display = 'none';

        fetch('/procesar', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(result => {
            loader.style.display = 'none';
            if (result.success && result.data.general.total > 0) {
                generarInforme(result.data);
                downloadBtn.style.display = 'block';
            } else {
                let message = result.message || 'No se encontraron datos válidos en el archivo Excel. Por favor, verifique el contenido.';
                errorDiv.textContent = 'Error: ' + message;
                errorDiv.style.display = 'block';
            }
        })
        .catch(err => {
            loader.style.display = 'none';
            errorDiv.textContent = 'Ha ocurrido un error de conexión.';
            errorDiv.style.display = 'block';
            console.error(err);
        });
    });

    downloadBtn.addEventListener('click', function() {
        loader.style.display = 'block';
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'pt', 'a4', true);
        const pages = reporteContainer.querySelectorAll('.report-page');
        
        let promises = [];
        pages.forEach(page => {
            promises.push(html2canvas(page, { scale: 2, useCORS: true, backgroundColor: null }));
        });

        Promise.all(promises).then(canvases => {
            canvases.forEach((canvas, index) => {
                const imgData = canvas.toDataURL('image/png');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                if (index > 0) {
                    pdf.addPage();
                }
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
            });
            pdf.save('Informe-Satisfaccion-Fin-de-Semana.pdf');
            loader.style.display = 'none';
        });
    });
    
    // *** FUNCIÓN DE CONCLUSIONES TOTALMENTE RENOVADA ***
    function generarConclusiones(diaData) {
        // Función para obtener los N items más frecuentes de un objeto
        const getTopItems = (obj, count) => {
            return Object.entries(obj)
                .sort(([, a], [, b]) => b - a)
                .slice(0, count)
                .map(([name]) => name)
                .join(', ');
        };

        const mejoresSectores = getTopItems(diaData.destacados, 4) || 'varios sectores';
        const peoresSectores = getTopItems(diaData.criticos, 4) || 'varios sectores';

        const conclusionPositiva = `Se destaca principalmente la atención en ${mejoresSectores}. Los clientes valoraron positivamente la amabilidad y la limpieza.`;
        const conclusionNegativa = `Las oportunidades de mejora se observan en ${peoresSectores}, donde los clientes mencionaron principalmente demoras o falta de limpieza.`;

        return { conclusionPositiva, conclusionNegativa };
    }


    function generarPaginaDia(dia, data) {
        const diaData = data.porDia[dia];
        let sectoresDelDia = Object.entries(data.porSector)
            .filter(([, stats]) => stats.total > 5) // Considerar sectores con más de 5 respuestas
            .sort((a, b) => b[1].satisfaccion - a[1].satisfaccion);

        const mejoresSectores = sectoresDelDia.slice(0, 7);
        const peoresSectores = sectoresDelDia.slice(-7).reverse();
        
        const { conclusionPositiva, conclusionNegativa } = generarConclusiones(diaData);
        
        return `
        <div class="report-page">
            <h2 style="text-transform: uppercase;">${dia}</h2>
            <div class="day-details-container">
                <div class="summary-cards">
                    <div class="summary-card">
                       <span class="icon">👍</span>
                       <p>El ${dia.toLowerCase()} recibimos <strong>${diaData.muy_positivas + diaData.positivas}</strong> calificaciones positivas y <strong>${diaData.muy_negativas + diaData.negativas}</strong> negativas.</p>
                    </div>
                    <div class="summary-card">
                        <span class="icon">✔️</span>
                        <p>${conclusionPositiva}</p>
                    </div>
                    <div class="summary-card">
                        <span class="icon">📚</span>
                        <p>${conclusionNegativa}</p>
                    </div>
                </div>
                <div class="sector-tables">
                    <div class="sector-table">
                        <h3>Sectores con mayor nivel de satisfacción</h3>
                        ${generarTablaSectores(mejoresSectores)}
                    </div>
                    <div class="sector-table">
                        <h3>Sectores con menor nivel de satisfaction</h3>
                        ${generarTablaSectores(peoresSectores)}
                    </div>
                </div>
            </div>
        </div>`;
    }

    function generarInforme(data) {
        const fechas = [...new Set(data.fechas)].join(', ');
        
        reporteContainer.innerHTML = `
            <div class="report-page">
                <h1>INFORME<br>FIN DE SEMANA<br>${fechas}</h1>
            </div>
            <div class="report-page">
                <h2>SATISFACCIÓN POR DÍA</h2>
                <div class="chart-container"><canvas id="satisfaccionPorDiaChart"></canvas></div>
            </div>
            <div class="report-page">
                 <h2>ANÁLISIS DE COMENTARIOS</h2>
                 <div class="wordcloud-container">
                     <div class="wordcloud-box">
                         <h3>Palabras Clave Positivas</h3>
                         <canvas id="wordCloudCanvasPositive"></canvas>
                     </div>
                     <div class="wordcloud-box">
                         <h3>Palabras Clave Negativas</h3>
                         <canvas id="wordCloudCanvasNegative"></canvas>
                     </div>
                 </div>
            </div>
            <div class="report-page">
                <h2>SATISFACCIÓN POR HORA</h2>
                <div class="chart-container"><canvas id="satisfaccionPorHoraChart"></canvas></div>
            </div>
            ${Object.keys(data.porDia).sort((a, b) => ['Viernes', 'Sábado', 'Domingo'].indexOf(a) - ['Viernes', 'Sábado', 'Domingo'].indexOf(b)).map(dia => generarPaginaDia(dia, data)).join('')}
            <div class="report-page">
                 <h1 style="font-size: 36px; margin-top: 300px;">Muchas gracias</h1>
            </div>`;
        renderGraficos(data);
        renderNubes(data.nubes);
    }
    
    function renderNubes(nubesData) {
        const positiveWords = Object.entries(nubesData.positiva).map(([text, weight]) => [text, weight]);
        const negativeWords = Object.entries(nubesData.negativa).map(([text, weight]) => [text, weight]);
        const options = { list: [], gridSize: 10, weightFactor: 8, fontFamily: 'system-ui, sans-serif', minSize: 12, shuffle: false, rotateRatio: 0.3, shape: 'circle', backgroundColor: '#ffffff' };
        
        if(positiveWords.length > 0) {
            WordCloud(document.getElementById('wordCloudCanvasPositive'), { ...options, list: positiveWords.slice(0, 60), color: (word, weight) => weight > 5 ? COLORS.muy_positiva : COLORS.positiva });
        }
        if(negativeWords.length > 0) {
            WordCloud(document.getElementById('wordCloudCanvasNegative'), { ...options, list: negativeWords.slice(0, 60), color: (word, weight) => weight > 2 ? COLORS.muy_negativa : COLORS.negativa });
        }
    }

    function renderGraficos(data) {
        const diasOrdenados = Object.keys(data.porDia).sort((a, b) => ['Viernes', 'Sábado', 'Domingo'].indexOf(a) - ['Viernes', 'Sábado', 'Domingo'].indexOf(b));
        const ctxDia = document.getElementById('satisfaccionPorDiaChart').getContext('2d');
        new Chart(ctxDia, {
            type: 'bar',
            data: {
                labels: diasOrdenados,
                datasets: [
                    { type: 'line', label: 'Índice de Satisfacción', data: diasOrdenados.map(d => data.porDia[d].satisfaccion), borderColor: COLORS.nps_line, yAxisID: 'y1', tension: 0.1 },
                    { label: 'Muy Positivas', data: diasOrdenados.map(d => data.porDia[d].muy_positivas), backgroundColor: COLORS.muy_positiva, stack: 'Stack 0' },
                    { label: 'Positivas', data: diasOrdenados.map(d => data.porDia[d].positivas), backgroundColor: COLORS.positiva, stack: 'Stack 0' },
                    { label: 'Negativas', data: diasOrdenados.map(d => data.porDia[d].negativas), backgroundColor: COLORS.negativa, stack: 'Stack 0' },
                    { label: 'Muy Negativas', data: diasOrdenados.map(d => data.porDia[d].muy_negativas), backgroundColor: COLORS.muy_negativa, stack: 'Stack 0' },
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, position: 'left', title: { display: true, text: 'Cantidad de Respuestas' } }, y1: { position: 'right', min: -100, max: 100, title: { display: true, text: 'Índice de Satisfacción (-100 a 100)' }, grid: { drawOnChartArea: false } } } }
        });

        const horas = Array.from({length: 24}, (_, i) => i);
        const ctxHora = document.getElementById('satisfaccionPorHoraChart').getContext('2d');
        new Chart(ctxHora, {
            type: 'bar',
            data: {
                labels: horas.map(h => `${h}:00`),
                datasets: [
                    { type: 'line', label: 'Índice de Satisfacción', data: horas.map(h => data.porHora[h].satisfaccion), borderColor: COLORS.nps_line, yAxisID: 'y1', tension: 0.4 },
                    { label: 'Muy Positivas', data: horas.map(h => data.porHora[h].muy_positivas), backgroundColor: COLORS.muy_positiva, stack: 'Stack 0' },
                    { label: 'Positivas', data: horas.map(h => data.porHora[h].positivas), backgroundColor: COLORS.positiva, stack: 'Stack 0' },
                    { label: 'Negativas', data: horas.map(h => data.porHora[h].negativas), backgroundColor: COLORS.negativa, stack: 'Stack 0' },
                    { label: 'Muy Negativas', data: horas.map(h => data.porHora[h].muy_negativas), backgroundColor: COLORS.muy_negativa, stack: 'Stack 0' },
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, position: 'left', title: { display: true, text: 'Cantidad de Respuestas' } }, y1: { position: 'right', min: -100, max: 100, title: { display: true, text: 'Índice de Satisfacción' }, grid: { drawOnChartArea: false } } } }
        });
    }

    function generarTablaSectores(sectores) {
        if(sectores.length === 0) return '<p>No hay suficientes datos para mostrar.</p>';
        return `
        <table>
            <thead><tr><th>Sector - Ubicación</th><th>Respuestas</th><th>Satisfacción</th><th>Gráfico</th></tr></thead>
            <tbody>
                ${sectores.map(([key, stats]) => `
                    <tr>
                        <td>${key}</td>
                        <td>${stats.total}</td>
                        <td>${stats.satisfaccion.toFixed(2)}</td>
                        <td>
                            <div class="nps-bar-container"><div class="nps-bar" style="width: ${Math.max(0, (stats.satisfaccion + 100) / 2)}%;"></div></div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
    }
});
