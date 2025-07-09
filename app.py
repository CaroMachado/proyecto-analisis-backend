from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import pandas as pd
from analisis import procesar_datos
from generar_pdf import crear_pdf

app = Flask(__name__)
CORS(app)

@app.route('/subir', methods=['POST'])
def subir():
    archivo = request.files['archivo']
    df = pd.read_excel(archivo)
    resultados = procesar_datos(df)
    return jsonify(resultados)

@app.route('/descargar_pdf', methods=['POST'])
def descargar_pdf():
    data = request.json
    crear_pdf(data)
    return send_file('informe.pdf', as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
