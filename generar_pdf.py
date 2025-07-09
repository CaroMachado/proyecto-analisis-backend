from fpdf import FPDF

def crear_pdf(data):
    pdf = FPDF()
    pdf.add_page()
    pdf.set_font("Arial", size=12)
    pdf.cell(200, 10, "Informe de Satisfacción y Comentarios", ln=True, align="C")
    pdf.ln(10)
    pdf.cell(200, 10, f"Total de comentarios: {data['total_comentarios']}", ln=True)
    for sector, calif in data["satisfaccion"].items():
        pdf.cell(200, 10, f"{sector}: {calif}", ln=True)
    pdf.output("informe.pdf")
