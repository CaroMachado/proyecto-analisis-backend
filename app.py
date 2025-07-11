# app.py
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os
import uuid
import tempfile
import logging
from threading import Thread

# Importamos las funciones de los otros archivos
from analisis import procesar_datos
from generar_pdf import crear_pdf_completo

# --- Configuración ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
app = Flask(__name__)

# Configura CORS. La lista de orígenes ya es correcta.
CORS(app, resources={r"/*": {"origins": ["https://devwebcm.com", "http://127.0.0.1:5500", "http://localhost:5500"]}})

# --- Almacenamiento en memoria para las tareas ---
TAREAS = {}

# --- NUEVA RUTA DE HEALTH CHECK ---
@app.route('/')
def health_check():
    """
    Ruta simple para verificar que la aplicación está viva.
    Si el modelo está cargado, lo indica.
    """
    from analisis import MODELO_CARGADO
    status = "OK"
    if MODELO_CARGADO:
        status += " - Modelo de IA cargado."
    else:
        status += " - Modelo de IA NO cargado."
    return jsonify({"status": status})

# --- Función que se ejecuta en el hilo secundario ---
def procesar_en_segundo_plano(task_id, temp_file_path):
    app.logger.info(f"Iniciando análisis para la tarea {task_id}.")
    try:
        resultados = procesar_datos(temp_file_path)
        TAREAS[task_id] = {'state': 'SUCCESS', 'data': resultados}
        app.logger.info(f"Análisis para la tarea {task_id} completado con éxito.")
    except Exception as e:
        app.logger.error(f"Error en el hilo de análisis para la tarea {task_id}: {e}", exc_info=True)
        TAREAS[task_id] = {'state': 'FAILURE', 'status': f"Ocurrió un error durante el procesamiento: {str(e)}"}
    finally:
        try:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                app.logger.info(f"Archivo temporal {temp_file_path} eliminado.")
        except Exception as e:
            app.logger.error(f"No se pudo eliminar el archivo temporal {temp_file_path}: {e}")

# --- RUTAS DE LA API ---

@app.route('/subir', methods=['POST'])
def subir_archivo():
    if 'archivo' not in request.files:
        return jsonify({'error': 'No se envió ningún archivo.'}), 400
    
    file = request.files['archivo']
    if file.filename == '':
        return jsonify({'error': 'No se seleccionó ningún archivo.'}), 400

    fd, temp_path = tempfile.mkstemp(suffix='.xlsx')
    os.close(fd)
    file.save(temp_path)
    app.logger.info(f"Archivo recibido y guardado temporalmente en: {temp_path}")

    task_id = str(uuid.uuid4())
    TAREAS[task_id] = {'state': 'PENDING', 'status': 'El análisis ha comenzado. Esto puede tardar varios minutos...'}

    thread = Thread(target=procesar_en_segundo_plano, args=(task_id, temp_path))
    thread.daemon = True
    thread.start()
    
    return jsonify({'task_id': task_id}), 202

@app.route('/status/<task_id>', methods=['GET'])
def get_status(task_id):
    task_info = TAREAS.get(task_id)
    if not task_info:
        return jsonify({'state': 'NOT_FOUND', 'status': 'Tarea no encontrada. Por favor, intente de nuevo.'}), 404
    return jsonify(task_info)

@app.route('/descargar_pdf', methods=['POST'])
def descargar_pdf():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos para generar el PDF.'}), 400
        
        task_id = data.get('task_id')
        pdf_buffer = crear_pdf_completo(data)
        
        if task_id and task_id in TAREAS:
            try:
                del TAREAS[task_id]
                app.logger.info(f"Tarea {task_id} eliminada de la memoria.")
            except KeyError:
                pass

        return send_file(
            pdf_buffer,
            as_attachment=True,
            download_name='informe_analisis_clientes.pdf',
            mimetype='application/pdf'
        )
    except Exception as e:
        app.logger.error(f"Error al generar PDF: {e}", exc_info=True)
        return jsonify({'error': f'Error interno al generar el PDF: {str(e)}'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=False)
