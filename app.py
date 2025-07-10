from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import uuid
from threading import Thread # Usaremos hilos nativos de Python
from analisis import procesar_datos
from generar_pdf import crear_pdf_completo
import logging
import tempfile
import time

# Configuración de Logging
logging.basicConfig(level=logging.INFO)

# --- Configuración de la App Flask ---
app = Flask(__name__)

# --- Configuración de CORS ---
CORS(app, resources={r"/*": {"origins": "https://devwebcm.com"}})

# --- Diccionario para almacenar los resultados de las tareas ---
# Este es nuestro "almacén" en memoria para los resultados.
TAREAS = {}

# --- Función que se ejecutará en segundo plano en un hilo ---
def procesar_en_segundo_plano(task_id, temp_file_path):
    """Esta función se ejecuta en un hilo separado dentro del mismo Web Service."""
    app.logger.info(f"Iniciando análisis para la tarea {task_id} en un hilo secundario.")
    try:
        # Aquí sucede el trabajo pesado
        resultados = procesar_datos(temp_file_path)
        
        # Guardamos el resultado en nuestro diccionario global
        TAREAS[task_id] = {'state': 'SUCCESS', 'data': resultados}
        app.logger.info(f"Análisis para la tarea {task_id} completado con éxito.")

    except Exception as e:
        app.logger.error(f"Error en el hilo de análisis para la tarea {task_id}: {e}", exc_info=True)
        # Guardamos el error
        TAREAS[task_id] = {'state': 'FAILURE', 'status': str(e)}
    finally:
        # Eliminamos el archivo temporal
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

# --- RUTAS DE LA API ---
@app.route('/subir', methods=['POST'])
def subir_archivo():
    if 'archivo' not in request.files:
        return jsonify({'error': 'No se envió ningún archivo.'}), 400
    file = request.files['archivo']
    if file.filename == '':
        return jsonify({'error': 'No se seleccionó ningún archivo.'}), 400

    # Guardar el archivo en una ubicación temporal
    fd, temp_path = tempfile.mkstemp(suffix='.xlsx')
    file.save(temp_path)
    os.close(fd)

    # Crear un ID único para esta tarea
    task_id = str(uuid.uuid4())
    
    # Marcar la tarea como "pendiente"
    TAREAS[task_id] = {'state': 'PENDING', 'status': 'Tarea en cola...'}

    # Iniciar el hilo de trabajo en segundo plano
    thread = Thread(target=procesar_en_segundo_plano, args=(task_id, temp_path))
    thread.daemon = True  # Permite que la app principal se cierre aunque el hilo siga corriendo
    thread.start()
    
    # Responder inmediatamente con el ID de la tarea
    return jsonify({'task_id': task_id}), 202

@app.route('/status/<task_id>')
def get_status(task_id):
    """El frontend llama a esta ruta para preguntar por el estado de la tarea."""
    task_info = TAREAS.get(task_id, {})
    
    if not task_info:
        return jsonify({'state': 'NOT_FOUND', 'status': 'Tarea no encontrada.'}), 404
        
    return jsonify(task_info)

# La ruta del PDF no necesita cambios
@app.route('/descargar_pdf', methods=['POST'])
def descargar_pdf():
    # ... (código sin cambios)
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos para generar el PDF.'}), 400
        pdf_buffer = crear_pdf_completo(data)
        return send_file(pdf_buffer, as_attachment=True, download_name='informe.pdf', mimetype='application/pdf')
    except Exception as e:
        return jsonify({'error': f'Error al generar PDF: {str(e)}'}), 500

if __name__ == '__main__':
    app.run(debug=True)
