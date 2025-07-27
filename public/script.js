document.addEventListener('DOMContentLoaded', function() {
    // ... (todo el código inicial hasta el uploadForm.addEventListener es igual)
    const uploadForm = document.getElementById('uploadForm');
    const reporteContainer = document.getElementById('reporte-container');
    const loader = document.getElementById('loader');
    const errorDiv = document.getElementById('error');
    const downloadBtn = document.getElementById('downloadPdf');

    const COLORS = {
        muy_positiva: '#28a745',
        positiva: '#8fbc8f',
        negativa: '#fd7e14',
        muy_negativa: '#dc3545',
        nps_line: '#343a40'
    };

    uploadForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(this);

        loader.style.display = 'block';
        errorDiv.style.display = 'none';
        reporteContainer.innerHTML = '';
        downloadBtn.style.display = 'none';

        // ***** CAMBIO AQUÍ: La URL ahora apunta a nuestro backend en Render *****
        fetch('/procesar', { // Se cambió de 'procesar.php' a '/procesar'
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(result => {
            loader.style.display = 'none';
            if (result.success) {
                generarInforme(result.data);
                downloadBtn.style.display = 'block';
            } else {
                errorDiv.textContent = 'Error: ' + result.message;
                errorDiv.style.display = 'block';
            }
        })
        .catch(err => {
            loader.style.display = 'none';
            errorDiv.textContent = 'Ha ocurrido un error de conexión. Revisa la consola para más detalles.';
            errorDiv.style.display = 'block';
            console.error(err);
        });
    });

    // ... (la función downloadBtn.addEventListener es igual)
    downloadBtn.addEventListener('click', function() {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'pt', 'a4');
        const pages = reporteContainer.querySelectorAll('.report-page');
        let pagePromises = [];

        pages.forEach(page => {
            pagePromises.push(
                html2canvas(page, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: null
                })
            );
        });
        
        Promise.all(pagePromises).then(canvases => {
            canvases.forEach((canvas, index) => {
                const imgData = canvas.toDataURL('image/png');
                const imgProps= pdf.getImageProperties(imgData);
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
                
                if (index > 0) {
                    pdf.addPage();
                }
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            });
            pdf.save('Informe-Satisfaccion-Fin-de-Semana.pdf');
        });
    });

    // ***** NUEVA FUNCIÓN PARA GENERAR CONCLUSIONES AUTOMÁTICAS *****
    function generarConclusiones(dia, data) {
        // Encontrar la mejor y peor hora del día analizando todo el finde
        let mejorHora = { hora: -1, nps: -101 };
        let peorHora = { hora: -1, nps: 101 };
        data.porHora.forEach((stats, hora) => {
            if (stats.total > 0) {
                if (stats.nps > mejorHora.nps) mejorHora = { hora, nps: stats.nps, count: stats.muy_positivas };
                if (stats.nps < peorHora.nps) peorHora = { hora, nps: stats.nps, count: stats.muy_negativas + stats.negativas };
            }
        });
        
        // Encontrar mejores y peores sectores (simplificado a los del día)
        let sectores = Object.entries(data.porSector)
            .filter(([key, stats]) => stats.total > 5) // Considerar sectores con más de 5 respuestas
            .sort((a, b) => b[1].nps - a[1].nps);
        
        const mejoresSectores = sectores.slice(0, 4).map(s => s[0].replace(' - ', ' '));
        const peoresSectores = sectores.slice(-4).reverse().map(s => s[0].replace(' - ', ' '));

        const conclusionPositiva = `A las ${mejorHora.hora}hs fue la franja horaria donde mejor nos valoraron, con un NPS de ${mejorHora.nps.toFixed(2)}. Recibimos ${mejorHora.count} calificaciones muy positivas hacia ${mejoresSectores.join(', ')}. Se destaca la amabilidad y la limpieza.`;
        
        const conclusionNegativa = `A las ${peorHora.hora}hs es la franja horaria donde más calificaciones negativas recibimos (${peorHora.count}), con un NPS de ${peorHora.nps.toFixed(2)}. Las oportunidades de mejora se observan en ${peoresSectores.join(', ')}.`;

        return { conclusionPositiva, conclusionNegativa };
    }

    // ***** FUNCIÓN generarPaginaDia ACTUALIZADA PARA USAR LAS CONCLUSIONES *****
    function generarPaginaDia(dia, data) {
        let sectoresDelDia = Object.entries(data.porSector)
            .filter(([key, stats]) => stats.total > 0)
            .sort((a, b) => b[1].nps - a[1].nps);

        const mejoresSectores = sectoresDelDia.slice(0, 7);
        const peoresSectores = sectoresDelDia.slice(-7).reverse();
        
        // Generar las conclusiones automáticas
        const { conclusionPositiva, conclusionNegativa } = generarConclusiones(dia, data);
        
        return `
        <div class="report-page">
            <img src="https://i.imgur.com/xQf2P1H.png" class="logo" alt="Logo Hipódromo">
            <h2 style="text-transform: uppercase;">${dia}</h2>
            <div class="day-details-container">
                <div class="sector-tables">
                    <div class="sector-table">
                        <h3>Sectores con mayor nivel de satisfacción</h3>
                        ${generarTablaSectores(mejoresSectores)}
                    </div>
                    <div class="sector-table">
                        <h3>Sectores con menor nivel de satisfacción</h3>
                        ${generarTablaSectores(peoresSectores)}
                    </div>
                </div>
                <div class="summary-cards">
                    <div class="summary-card">
                       <span class="icon">👍</span>
                       <p>El ${dia.toLowerCase()} recibimos <strong>${data.porDia[dia].muy_positivas + data.porDia[dia].positivas}</strong> calificaciones positivas y <strong>${data.porDia[dia].muy_negativas + data.porDia[dia].negativas}</strong> negativas.</p>
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
            </div>
        </div>
        `;
    }

    // El resto de las funciones (generarInforme, renderGraficos, renderNubes, generarTablaSectores)
    // pueden permanecer exactamente iguales a como te las di en la primera respuesta.
    // Solo pégalas aquí debajo.

    function generarInforme(data) {
        const fechas = data.fechas[0] ? data.fechas[0].split('/')[0] + '-' + data.fechas[data.fechas.length-1].split('/')[0] : 'del Fin de Semana';
        
        reporteContainer.innerHTML = `
            <div class="report-page">
                <img src="https://i.imgur.com/xQf2P1H.png" class="logo" alt="Logo Hipódromo">
                <h1>INFORME<br>FIN DE SEMANA<br>${fechas}</h1>
            </div>
            <div class="report-page">
                <img src="https://i.imgur.com/xQf2P1H.png" class="logo" alt="Logo Hipódromo">
                <h2>SATISFACCIÓN POR DÍA</h2>
                <div class="chart-container"><canvas id="satisfaccionPorDiaChart"></canvas></div>
            </div>
            <div class="report-page">
                 <img src="https://i.imgur.com/xQf2P1H.png" class="logo" alt="Logo Hipódromo">
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
                <img src="https://i.imgur.com/xQf2P1H.png" class="logo" alt="Logo Hipódromo">
                <h2>SATISFACCIÓN POR HORA</h2>
                <div class="chart-container"><canvas id="satisfaccionPorHoraChart"></canvas></div>
            </div>
            ${Object.keys(data.porDia).sort((a, b) => ['Viernes', 'Sábado', 'Domingo'].indexOf(a) - ['Viernes', 'Sábado', 'Domingo'].indexOf(b)).map(dia => generarPaginaDia(dia, data)).join('')}
            <div class="report-page">
                 <img src="https://i.imgur.com/xQf2P1H.png" class="logo" alt="Logo Hipódromo">
                 <h1 style="font-size: 36px; margin-top: 300px;">Muchas gracias</h1>
            </div>
        `;
        renderGraficos(data);
        renderNubes(data.nubes);
    }
    
    function renderNubes(nubesData) {
        const positiveWords = Object.entries(nubesData.positiva).map(([text, weight]) => [text, weight]).sort((a, b) => b[1] - a[1]);
        const negativeWords = Object.entries(nubesData.negativa).map(([text, weight]) => [text, weight]).sort((a, b) => b[1] - a[1]);
        const options = { list: [], gridSize: 10, weightFactor: 6, fontFamily: 'system-ui, sans-serif', minSize: 12, shuffle: false, rotateRatio: 0.3, shape: 'circle', backgroundColor: '#ffffff' };
        WordCloud(document.getElementById('wordCloudCanvasPositive'), { ...options, list: positiveWords.slice(0, 60), color: (word, weight) => weight > 5 ? COLORS.muy_positiva : COLORS.positiva });
        WordCloud(document.getElementById('wordCloudCanvasNegative'), { ...options, list: negativeWords.slice(0, 60), color: (word, weight) => weight > 2 ? COLORS.muy_negativa : COLORS.negativa });
    }

    function renderGraficos(data) {
        const diasOrdenados = Object.keys(data.porDia).sort((a, b) => ['Viernes', 'Sábado', 'Domingo'].indexOf(a) - ['Viernes', 'Sábado', 'Domingo'].indexOf(b));
        const ctxDia = document.getElementById('satisfaccionPorDiaChart').getContext('2d');
        new Chart(ctxDia, {
            type: 'bar',
            data: {
                labels: diasOrdenados,
                datasets: [
                    { type: 'line', label: 'NPS', data: diasOrdenados.map(d => data.porDia[d].nps), borderColor: COLORS.nps_line, yAxisID: 'y1', tension: 0.1 },
                    { label: 'Muy Positivas', data: diasOrdenados.map(d => data.porDia[d].muy_positivas), backgroundColor: COLORS.muy_positiva, stack: 'Stack 0' },
                    { label: 'Positivas', data: diasOrdenados.map(d => data.porDia[d].positivas), backgroundColor: COLORS.positiva, stack: 'Stack 0' },
                    { label: 'Negativas', data: diasOrdenados.map(d => data.porDia[d].negativas), backgroundColor: COLORS.negativa, stack: 'Stack 0' },
                    { label: 'Muy Negativas', data: diasOrdenados.map(d => data.porDia[d].muy_negativas), backgroundColor: COLORS.muy_negativa, stack: 'Stack 0' },
                ]
            },
            options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, position: 'left', title: { display: true, text: 'Cantidad de Respuestas' } }, y1: { position: 'right', beginAtZero: false, title: { display: true, text: 'NPS Score (-100 a 100)' }, grid: { drawOnChartArea: false } } } }
        });

        const horas = Array.from({length: 24}, (_, i) => i);
        const ctxHora = document.getElementById('satisfaccionPorHoraChart').getContext('2d');
        new Chart(ctxHora, {
            type: 'bar',
            data: {
                labels: horas.map(h => `${h}:00`),
                datasets: [
                    { type: 'line', label: 'NPS', data: horas.map(h => data.porHora[h].nps), borderColor: COLORS.nps_line, yAxisID: 'y1', tension: 0.4 },
                    { label: 'Muy Positivas', data: horas.map(h => data.porHora[h].muy_positivas), backgroundColor: COLORS.muy_positiva, stack: 'Stack 0' },
                    { label: 'Positivas', data: horas.map(h => data.porHora[h].positivas), backgroundColor: COLORS.positiva, stack: 'Stack 0' },
                    { label: 'Negativas', data: horas.map(h => data.porHora[h].negativas), backgroundColor: COLORS.negativa, stack: 'Stack 0' },
                    { label: 'Muy Negativas', data: horas.map(h => data.porHora[h].muy_negativas), backgroundColor: COLORS.muy_negativa, stack: 'Stack 0' },
                ]
            },
            options: { responsive: true, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, position: 'left', title: { display: true, text: 'Cantidad de Respuestas' } }, y1: { position: 'right', min: -100, max: 100, title: { display: true, text: 'NPS Score' }, grid: { drawOnChartArea: false } } } }
        });
    }

    function generarTablaSectores(sectores) {
        return `
        <table>
            <thead><tr><th>Sector - Ubicación</th><th>Respuestas</th><th>NPS</th><th>NPS Chart</th></tr></thead>
            <tbody>
                ${sectores.map(([key, stats]) => `
                    <tr>
                        <td>${key}</td>
                        <td>${stats.total}</td>
                        <td>${stats.nps.toFixed(2)}</td>
                        <td>
                            <div class="nps-bar-container"><div class="nps-bar" style="width: ${Math.max(0, (stats.nps + 100) / 2)}%;"></div></div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
    }
});