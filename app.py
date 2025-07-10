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

# Configura CORS para permitir solicitudes desde tu dominio de frontend.
# Si estás probando localmente, puedes usar "*" temporalmente, pero es menos seguro.
CORS(app, resources={r"/*": {"origins": ["https://devwebcm.com", "http://127.0.0.1:5500"]}})


# --- Almacenamiento en memoria para las tareas ---
# En una aplicación real más grande, usarías Redis o una base de datos.
# Para este caso, un diccionario es suficiente.
TAREAS = {}

# --- Función que se ejecuta en el hilo secundario ---
def procesar_en_segundo_plano(task_id, temp_file_path):
    """
    Función que realiza el trabajo pesado sin bloquear el servidor.
    """
    app.logger.info(f"Iniciando análisis para la tarea {task_id}.")
    try:
        # 1. Ejecutar el análisis de datos
        resultados = procesar_datos(temp_file_path)
        
        # 2. Guardar el resultado final en el diccionario de tareas
        TAREAS[task_id] = {'state': 'SUCCESS', 'data': resultados}
        app.logger.info(f"Análisis para la tarea {task_id} completado con éxito.")

    except Exception as e:
        app.logger.error(f"Error en el hilo de análisis para la tarea {task_id}: {e}", exc_info=True)
        # Guardar el error para que el frontend pueda verlo
        TAREAS[task_id] = {'state': 'FAILURE', 'status': f"Ocurrió un error durante el procesamiento: {str(e)}"}
    finally:
        # 3. Limpiar el archivo temporal, sin importar si hubo éxito o error
        try:
            if os.path.exists(temp_file_path):
                os.remove(temp_file_path)
                app.logger.info(f"Archivo temporal {temp_file_path} eliminado.")
        except Exception as e:
            app.logger.error(f"No se pudo eliminar el archivo temporal {temp_file_path}: {e}")

# --- RUTAS DE LA API ---

@app.route('/subir', methods=['POST'])
def subir_archivo():
    """
    Ruta para iniciar el proceso. Recibe el archivo y comienza la tarea en segundo plano.
    """
    if 'archivo' not in request.files:
        return jsonify({'error': 'No se envió ningún archivo.'}), 400
    
    file = request.files['archivo']
    if file.filename == '':
        return jsonify({'error': 'No se seleccionó ningún archivo.'}), 400

    # Guardar el archivo en una ubicación temporal segura
    # mkstemp devuelve un descriptor de archivo y una ruta. Cerramos el descriptor y usamos la ruta.
    fd, temp_path = tempfile.mkstemp(suffix='.xlsx')
    os.close(fd)
    file.save(temp_path)
    app.logger.info(f"Archivo recibido y guardado temporalmente en: {temp_path}")

    # Crear un ID único para esta tarea
    task_id = str(uuid.uuid4())
    
    # Marcar la tarea como "pendiente"
    TAREAS[task_id] = {'state': 'PENDING', 'status': 'El análisis ha comenzado. Esto puede tardar varios minutos...'}

    # Iniciar el hilo de trabajo en segundo plano
    thread = Thread(target=procesar_en_segundo_plano, args=(task_id, temp_path))
    thread.daemon = True  # Permite que la app principal se cierre aunque el hilo no haya terminado
    thread.start()
    
    # Responder inmediatamente al frontend con el ID de la tarea
    return jsonify({'task_id': task_id}), 202 # 202 Accepted indica que la solicitud fue aceptada para procesar

@app.route('/status/<task_id>', methods=['GET'])
def get_status(task_id):
    """
    El frontend llama a esta ruta periódicamente para preguntar por el estado de la tarea.
    """
    task_info = TAREAS.get(task_id)
    
    if not task_info:
        return jsonify({'state': 'NOT_FOUND', 'status': 'Tarea no encontrada. Por favor, intente de nuevo.'}), 404
        
    return jsonify(task_info)

@app.route('/descargar_pdf', methods=['POST'])
def descargar_pdf():
    """
    Genera y envía el archivo PDF. Esto es rápido, por lo que puede ser síncrono.
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No se recibieron datos para generar el PDF.'}), 400
        
        pdf_buffer = crear_pdf_completo(data)
        
        # Eliminar los datos de la tarea de la memoria una vez descargado el PDF para liberar espacio
        # Esto es opcional, pero es una buena práctica
        # task_id = data.get('task_id') # Necesitarías añadir task_id a los datos del PDF
        # if task_id and task_id in TAREAS:
        #     del TAREAS[task_id]

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
    # El puerto lo gestiona Render, pero es útil para pruebas locales
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
