from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
from analisis import procesar_datos
from generar_pdf import crear_pdf_completo

app = Flask(__name__)
CORS(app)

@app.route('/subir', methods=['POST'])
def subir_archivo():
    if 'archivo' not in request.files:
        return jsonify({'error': 'No se envió ningún archivo.'}), 400
    
    archivo = request.files['archivo']
    if archivo.filename == '':
        return jsonify({'error': 'No se seleccionó ningún archivo.'}), 400

    try:
        resultados = procesar_datos(archivo)
        return jsonify(resultados)
    except Exception as e:
        app.logger.error(f"Error al procesar el archivo: {e}", exc_info=True)
        return jsonify({'error': f'Error al procesar el archivo: {str(e)}'}), 500

@app.route('/descargar_pdf', methods=['POST'])
def descargar_pdf():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos para generar el PDF.'}), 400
            
        pdf_buffer = crear_pdf_completo(data)
        
        return send_file(
            pdf_buffer,
            as_attachment=True,
            download_name='informe_satisfaccion_clientes.pdf',
            mimetype='application/pdf'
        )
    except Exception as e:
        app.logger.error(f"Error al generar el PDF: {e}", exc_info=True)
        return jsonify({'error': f'Error al generar el PDF: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
