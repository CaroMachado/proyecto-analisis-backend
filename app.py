from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
from analisis import procesar_datos
from generar_pdf import crear_pdf_completo
import logging

app = Flask(__name__)

# --- CORRECCIÓN CLAVE: Configuración de CORS explícita y segura ---
# Esto le dice a tu backend: "Permite solicitudes ÚNICAMENTE desde https://devwebcm.com"
# Es la forma correcta de hacerlo en producción.
CORS(app, resources={r"/*": {"origins": "https://devwebcm.com"}})

# Configuración de logging para ver errores en Render con más detalle
logging.basicConfig(level=logging.INFO)

# --- NUEVO: Añadir una ruta raíz para probar si el servidor está vivo ---
@app.route('/')
def index():
    return jsonify({"message": "¡El servidor de análisis está en línea!"})

@app.route('/subir', methods=['POST'])
def subir_archivo():
    if 'archivo' not in request.files:
        app.logger.warning("Intento de subida sin archivo.")
        return jsonify({'error': 'No se envió ningún archivo.'}), 400
    
    archivo = request.files['archivo']
    if archivo.filename == '':
        app.logger.warning("Intento de subida con nombre de archivo vacío.")
        return jsonify({'error': 'No se seleccionó ningún archivo.'}), 400

    try:
        app.logger.info(f"Procesando archivo: {archivo.filename}")
        resultados = procesar_datos(archivo)
        app.logger.info("Archivo procesado exitosamente.")
        return jsonify(resultados)
    except Exception as e:
        app.logger.error(f"Error fatal al procesar el archivo: {e}", exc_info=True)
        return jsonify({'error': f'Error al procesar el archivo: {str(e)}'}), 500

@app.route('/descargar_pdf', methods=['POST'])
def descargar_pdf():
    try:
        data = request.get_json()
        if not data:
            app.logger.warning("Intento de descarga de PDF sin datos.")
            return jsonify({'error': 'No se recibieron datos para generar el PDF.'}), 400
            
        app.logger.info("Generando PDF...")
        pdf_buffer = crear_pdf_completo(data)
        app.logger.info("PDF generado exitosamente.")
        
        return send_file(
            pdf_buffer,
            as_attachment=True,
            download_name='informe_satisfaccion_clientes.pdf',
            mimetype='application/pdf'
        )
    except Exception as e:
        app.logger.error(f"Error fatal al generar el PDF: {e}", exc_info=True)
        return jsonify({'error': f'Error al generar el PDF: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=False, host='0.0.0.0', port=port) # debug=False es mejor para producción
