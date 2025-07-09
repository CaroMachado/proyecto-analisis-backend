from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd
import os

from analisis import procesar_datos
from generar_pdf import crear_pdf

app = Flask(__name__)
CORS(app)

@app.route('/subir', methods=['POST'])
def subir():
    if 'archivo' not in request.files:
        return jsonify({'error': 'No se envió el archivo'}), 400
    
    archivo = request.files['archivo']
    
    try:
        df = pd.read_excel(archivo)
        resultados = procesar_datos(df)
        return jsonify(resultados)
    except Exception as e:
        return jsonify({'error': f'Error procesando el archivo: {str(e)}'}), 500

@app.route('/descargar_pdf', methods=['POST'])
def descargar_pdf():
    try:
        data = request.get_json()
        crear_pdf(data)

        if not os.path.exists('informe.pdf'):
            return jsonify({'error': 'El PDF no se generó correctamente'}), 500

        return send_file('informe.pdf', as_attachment=True)
    except Exception as e:
        return jsonify({'error': f'Error generando o enviando el PDF: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
