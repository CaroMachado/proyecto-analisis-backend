from fpdf import FPDF
import base64
import io
from datetime import datetime

class PDF(FPDF):
    def header(self):
        self.set_font('Arial', 'B', 15)
        self.cell(0, 10, 'Panel de Análisis de Experiencia del Cliente', 0, 1, 'C')
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('Arial', 'I', 8)
        self.cell(0, 10, f'Página {self.page_no()}', 0, 0, 'C')

    def chapter_title(self, title):
        self.set_font('Arial', 'B', 14)
        self.set_fill_color(220, 220, 220)
        self.cell(0, 10, title, 0, 1, 'L', True)
        self.ln(4)

    def chapter_body(self, body):
        self.set_font('Arial', '', 11)
        self.multi_cell(0, 5, body)
        self.ln()
    
    def kpi_box(self, label, value):
        self.set_font('Arial', 'B', 20)
        self.cell(60, 10, str(value), align='C')
        self.set_font('Arial', '', 10)
        self.cell(60, 20, label, align='C')

    def add_image_from_base64(self, b64_string, x, y, w):
        try:
            image_data = base64.b64decode(b64_string)
            img = io.BytesIO(image_data)
            self.image(img, x=x, y=y, w=w, type='PNG')
        except Exception as e:
            self.set_font('Arial', 'I', 10)
            self.cell(0, 10, f'(Error al cargar imagen: {e})', 0, 1)

def crear_pdf_completo(data):
    pdf = PDF('P', 'mm', 'A4')
    pdf.add_page()
    
    # Título y Periodo
    pdf.set_font('Arial', 'B', 16)
    pdf.cell(0, 10, f"Informe de Satisfacción ({data['informe_periodo']})", 0, 1, 'C')
    pdf.ln(10)

    # KPIs Generales
    pdf.chapter_title('1. Resumen General')
    kpis = data['analisis_general']
    
    pdf.set_font('Arial', '', 11)
    pdf.cell(95, 20, f"Índice de Satisfacción (-100 a 100)\n{kpis['satisfaccion_general']}", border=1, align='C')
    pdf.cell(95, 20, f"Total Valoraciones\n{kpis['total_valoraciones']}", border=1, align='C')
    pdf.ln(20)
    
    # Nubes de Palabras
    pdf.chapter_title('2. Temas Clave en Comentarios')
    pdf.set_font('Arial', 'B', 12)
    pdf.cell(95, 8, 'Oportunidades de Mejora', 0, 0, 'C')
    pdf.cell(95, 8, 'Temas Positivos', 0, 1, 'C')
    
    y_pos_nube = pdf.get_y()
    if kpis.get('nube_palabras_negativa_b64'):
        pdf.add_image_from_base64(kpis['nube_palabras_negativa_b64'], x=10, y=y_pos_nube, w=90)
    if kpis.get('nube_palabras_positiva_b64'):
        pdf.add_image_from_base64(kpis['nube_palabras_positiva_b64'], x=105, y=y_pos_nube, w=90)
    pdf.ln(55)

    # Gráfico Diario
    pdf.chapter_title('3. Evolución Diaria de Valoraciones')
    if kpis.get('grafico_diario_b64'):
        pdf.add_image_from_base64(kpis['grafico_diario_b64'], x=pdf.get_x() + 15, y=pdf.get_y(), w=160)
        pdf.ln(100)

    # Tabla Resumen por Grupos
    pdf.chapter_title('4. Resumen por Grupos Principales')
    pdf.set_font('Arial', 'B', 10)
    pdf.cell(80, 8, 'Grupo', 1)
    pdf.cell(55, 8, 'Cantidad de Valoraciones', 1, 0, 'C')
    pdf.cell(55, 8, 'Índice de Satisfacción', 1, 1, 'C')
    pdf.set_font('Arial', '', 10)
    for item in data.get('resumen_por_grupos', []):
        pdf.cell(80, 8, item['sector'], 1)
        pdf.cell(55, 8, str(item['cantidad_valoraciones']), 1, 0, 'C')
        pdf.cell(55, 8, str(item['satisfaccion']), 1, 1, 'C')
    pdf.ln(5)

    # Resumen IA
    pdf.chapter_title('5. Análisis General de la Situación')
    analisis_texto = data.get('analisis_ia_resumen', 'No hay datos suficientes para un resumen.')
    pdf.set_font('Arial', '', 11)
    pdf.multi_cell(0, 5, analisis_texto.replace('**', ''))
    pdf.ln(5)

    # Análisis Detallado por Sector
    pdf.add_page()
    pdf.chapter_title('6. Análisis Detallado por Sector')
    for grupo in data.get('analisis_detallado_ordenado', []):
        pdf.set_font('Arial', 'B', 13)
        pdf.set_fill_color(230, 230, 250)
        pdf.cell(0, 10, f"Grupo: {grupo['grupo_titulo']}", 0, 1, 'L', True)
        pdf.ln(2)

        for sector in grupo.get('detalles_sector', []):
            pdf.set_font('Arial', 'B', 11)
            pdf.cell(0, 8, sector['titulo'], 0, 1)
            
            pdf.set_font('Arial', '', 10)
            kpi_line = f"Satisfacción: {sector['satisfaccion']} | Valoraciones: {sector['total_valoraciones']} | Comentarios: {sector['total_comentarios']}"
            pdf.cell(0, 6, kpi_line, 0, 1)
            
            if sector.get('oportunidades_mejora'):
                pdf.set_font('Arial', 'B', 10)
                pdf.cell(0, 6, "Oportunidades de Mejora:", 0, 1)
                pdf.set_font('Arial', 'I', 9)
                for item in sector['oportunidades_mejora']:
                    pdf.multi_cell(0, 4, f"- {item['tema']} ({item['cantidad']} menciones): \"{item['ejemplos'][0] if item['ejemplos'] else ''}...\"")
            
            if sector.get('puntos_destacados'):
                pdf.set_font('Arial', 'B', 10)
                pdf.cell(0, 6, "Puntos Destacados:", 0, 1)
                pdf.set_font('Arial', 'I', 9)
                for item in sector['puntos_destacados']:
                    pdf.multi_cell(0, 4, f"- {item['tema']} ({item['cantidad']} menciones): \"{item['ejemplos'][0] if item['ejemplos'] else ''}...\"")
            pdf.ln(4)

    pdf_output = pdf.output(dest='S').encode('latin-1')
    return io.BytesIO(pdf_output)
