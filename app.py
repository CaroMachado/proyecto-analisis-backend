# app.py
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd
import os
from analisis import procesar_datos
# from generar_pdf_mejorado import crear_pdf_completo # Importaríamos el nuevo generador de PDF

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
        # La función procesar_datos ahora recibe el objeto de archivo directamente
        resultados = procesar_datos(archivo)
        return jsonify(resultados)
    except Exception as e:
        # Devolver un error más informativo al frontend
        return jsonify({'error': f'Error al procesar el archivo: {str(e)}'}), 500

# Endpoint para PDF (requiere un generador de PDF avanzado como se describe)
@app.route('/descargar_pdf', methods=['POST'])
def descargar_pdf():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos para generar el PDF.'}), 400
            
        # Esta función tendría que ser reescrita para manejar la nueva estructura de datos
        # pdf_path = crear_pdf_completo(data) # Esta función no está implementada aquí
        
        # De momento, devolvemos un error indicando que no está lista
        return jsonify({'error': 'La generación de PDF avanzado aún no está implementada.'}), 501
        
        # return send_file(pdf_path, as_attachment=True)
    except Exception as e:
        return jsonify({'error': f'Error al generar el PDF: {str(e)}'}), 500

if __name__ == '__main__':
    # Usar el puerto que Render asigna, con un default para desarrollo local
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
