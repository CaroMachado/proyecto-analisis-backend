# analisis.py
import pandas as pd
import io
import base64
from wordcloud import WordCloud
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
from collections import defaultdict
import re
import numpy as np

# --- CONFIGURACIÓN DE ESTILO Y COLORES ---
# Ordenado de peor a mejor para el gráfico apilado
colores_sentimiento = {
    "Muy Negativa": "#d62728", 
    "Negativa": "#ff7f0e",
    "Positiva": "#98df8a",
    "Muy Positiva": "#2ca02c",
}
# Lista con el orden para asegurar que el gráfico se dibuje correctamente
orden_calificaciones = ["Muy Negativa", "Negativa", "Positiva", "Muy Positiva"]

plt.style.use('seaborn-v0_8-whitegrid')

# ==============================================================================
# SECCIÓN 1: FUNCIONES DE AYUDA (Helpers)
# ==============================================================================

def calcular_indice_satisfaccion(df_source):
    """
    Calcula el índice de satisfacción ponderado de 0 a 100 según la fórmula proporcionada.
    Puntuaciones: Muy Positiva=3, Positiva=2, Negativa=1, Muy Negativa=0.
    """
    if df_source.empty:
        return 0.0
    
    mapeo_puntuacion = {
        "Muy Positiva": 3,
        "Positiva": 2,
        "Negativa": 1,
        "Muy Negativa": 0
    }
    
    df_source['puntuacion'] = df_source['calificacion_descripcion'].map(mapeo_puntuacion)
    
    suma_puntuaciones = df_source['puntuacion'].sum()
    total_respuestas = len(df_source)
    
    if total_respuestas == 0:
        return 0.0
        
    # Máximo puntaje posible es total_respuestas * 3
    indice = (suma_puntuaciones / (total_respuestas * 3)) * 100
    
    return round(indice, 1)

def fig_to_base64(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def generar_grafico_valoraciones_diarias(df):
    df_chart = df.copy()
    # Aseguramos que la fecha se interprete correctamente, si no, no se procesa.
    df_chart['fecha_dt'] = pd.to_datetime(df_chart['fecha'], errors='coerce').dt.date

    # Agrupamos por fecha y contamos las calificaciones
    daily_counts = df_chart.groupby('fecha_dt')['calificacion_descripcion'].value_counts().unstack(fill_value=0)
    
    # Aseguramos que todas las columnas de calificación existan y estén en el orden correcto
    for col in orden_calificaciones:
        if col not in daily_counts.columns:
            daily_counts[col] = 0
    daily_counts = daily_counts[orden_calificaciones] # <-- CAMBIO CLAVE: Ordena las columnas para el gráfico

    # Calculamos el índice de satisfacción diario
    daily_satisfaction = df_chart.groupby('fecha_dt').apply(calcular_indice_satisfaccion)

    fig, ax1 = plt.subplots(figsize=(12, 7))

    # Graficamos las barras apiladas con el orden y colores correctos
    daily_counts.plot(kind='bar', stacked=True, color=[colores_sentimiento[col] for col in orden_calificaciones], ax=ax1, width=0.6)
    
    ax1.set_title('Valoraciones y Satisfacción por Día', fontsize=16)
    ax1.set_ylabel('Cantidad de Valoraciones', fontsize=12)
    ax1.set_xlabel('Fecha', fontsize=12)
    ax1.legend(title='Calificación')
    
    # Formateo del eje X para que muestre las fechas correctamente
    # CAMBIO CLAVE: Usamos el índice del DataFrame que contiene las fechas reales
    ax1.set_xticklabels([d.strftime('%d-%m-%Y') for d in daily_counts.index], rotation=45, ha="right")

    # Eje secundario para el índice de satisfacción
    ax2 = ax1.twinx()
    # CAMBIO CLAVE: Usamos el índice real (fechas) para el eje X, no posiciones numéricas
    ax2.plot(daily_satisfaction.index.astype(str), daily_satisfaction.values, marker='o', color='purple', linestyle='-', label='Índice de Satisfacción')
    ax2.set_ylabel('Índice de Satisfacción (0-100)', fontsize=12, color='purple')
    ax2.tick_params(axis='y', labelcolor='purple')
    ax2.set_ylim(0, 105) # El índice va de 0 a 100

    fig.tight_layout()
    return fig_to_base64(fig)

def generar_grafico_horas_conflictivas(df):
    df_neg = df[df['calificacion_descripcion'].isin(['Negativa', 'Muy Negativa'])].copy()
    if df_neg.empty: return None
    df_neg['hora_int'] = pd.to_datetime(df_neg['hora'], format='%H:%M:%S', errors='coerce').dt.hour
    # Usamos el grupo general para el gráfico
    conflictos = df_neg.groupby(['hora_int', 'grupo_sector']).size().unstack(fill_value=0)
    if conflictos.empty: return None
    fig, ax = plt.subplots(figsize=(12, 7))
    conflictos.plot(kind='bar', stacked=True, ax=ax, colormap='viridis')
    ax.set_title('Horas Conflictivas por Grupo de Sector (Comentarios Negativos)', fontsize=16)
    ax.set_xlabel('Hora del Día', fontsize=12)
    ax.set_ylabel('Nº de Comentarios Negativos/Muy Negativos', fontsize=12)
    ax.legend(title='Grupo')
    return fig_to_base64(fig)

def generar_nube_palabras_coloreada(df):
    # (Esta función no se modifica)
    def color_func_sentimiento(word, **kwargs):
        return kwargs['color_map'].get(word.lower(), "#333333")
    word_sentiment_map = defaultdict(list)
    for _, row in df.iterrows():
        comment = str(row['comentarios']).lower()
        sentiment = row['calificacion_descripcion']
        if pd.notna(comment) and sentiment is not None:
            for word in comment.split():
                word_sentiment_map[word].append(sentiment)
    color_map = {}
    for word, sentiments in word_sentiment_map.items():
        if not sentiments: continue
        dominant_sentiment = max(set(sentiments), key=sentiments.count)
        color_map[word] = colores_sentimiento.get(dominant_sentiment, "#333333")
    stopwords = set(["de", "la", "el", "en", "y", "que", "un", "una", "los", "las", "es", "muy", "por", "con", "se", "no", "del", "al", "me", "le", "lo", "su", "mi"])
    texto_completo = " ".join(str(t) for t in df['comentarios'] if pd.notna(t))
    if not texto_completo.strip(): return None
    wc = WordCloud(stopwords=stopwords, width=800, height=400, background_color='white', max_words=100, collocations=False).generate(texto_completo)
    wc.recolor(color_func=lambda word, **kwargs: color_func_sentimiento(word, color_map=color_map, **kwargs))
    img_buffer = io.BytesIO()
    wc.to_image().save(img_buffer, format='PNG')
    return base64.b64encode(img_buffer.getvalue()).decode('utf-8')

def get_detailed_analysis(df_grupo, include_sub_details=False):
    if df_grupo.empty: return None
    
    # Análisis de comentarios
    mejoras = df_grupo[df_grupo['puntos_criticos'].notna() & (df_grupo['puntos_criticos'] != "Otros")]
    oportunidades = []
    if not mejoras.empty:
        for tema, grupo in mejoras.groupby('puntos_criticos'):
            ejemplos = grupo['comentarios'].dropna().head(3).tolist()
            oportunidades.append({"tema": str(tema), "cantidad": int(len(grupo)), "ejemplos": ejemplos})
    
    positivos = df_grupo[df_grupo['destacados'].notna() & (df_grupo['destacados'] != "Otros")]
    destacados = []
    if not positivos.empty:
        for tema, grupo in positivos.groupby('destacados'):
            ejemplos = grupo['comentarios'].dropna().head(3).tolist()
            destacados.append({"tema": str(tema), "cantidad": int(len(grupo)), "ejemplos": ejemplos})
    
    # CAMBIO CLAVE: Lógica para la tabla de sub-detalles
    sub_detalles = []
    if include_sub_details:
        # Agrupamos por el sector original para crear la tabla de desglose
        for sector_original, sub_grupo in df_grupo.groupby('sector_final'):
            if not sub_grupo.empty:
                sub_detalles.append({
                    "nombre": sector_original,
                    "satisfaccion": calcular_indice_satisfaccion(sub_grupo),
                    "total_valoraciones": int(len(sub_grupo)),
                    "total_comentarios": int(sub_grupo['comentarios'].notna().sum())
                })
        sub_detalles = sorted(sub_detalles, key=lambda x: x['total_valoraciones'], reverse=True)

    return {
        "total_valoraciones": int(len(df_grupo)),
        "total_comentarios": int(df_grupo['comentarios'].notna().sum()),
        "satisfaccion": calcular_indice_satisfaccion(df_grupo),
        "oportunidades_mejora": sorted(oportunidades, key=lambda x: x['cantidad'], reverse=True),
        "puntos_destacados": sorted(destacados, key=lambda x: x['cantidad'], reverse=True),
        "sub_detalles": sub_detalles # Se añade la nueva clave
    }

# ==============================================================================
# SECCIÓN 2: FUNCIÓN PRINCIPAL ORQUESTADORA
# ==============================================================================

def procesar_datos(archivo_excel):
    try:
        df = pd.read_excel(archivo_excel, sheet_name=0)
    except Exception as e:
        raise ValueError(f"No se pudo leer el archivo Excel. Asegúrate de que es un archivo .xlsx válido. Error: {e}")

    original_cols = df.columns.tolist()
    df.columns = [re.sub(r'\s+', '_', col.strip()).lower() for col in df.columns]

    columnas_necesarias = ['fecha', 'hora', 'sala', 'sector', 'ubicacion', 'comentarios', 'calificacion_descripcion', 'puntos_criticos', 'destacados']
    columnas_faltantes = [col for col in columnas_necesarias if col not in df.columns]
    if columnas_faltantes:
        raise ValueError(f"Faltan columnas: {', '.join(columnas_faltantes)}. Columnas encontradas: {', '.join(df.columns)}")

    df['fecha'] = pd.to_datetime(df['fecha'], errors='coerce')
    df['sector_final'] = df.apply(lambda row: 'VIP' if 'VIP' in str(row['sala']) else str(row['sector']).strip(), axis=1)

    # --- CAMBIO CLAVE: Agrupación de Sectores ---
    def asignar_grupo(sector):
        sector_lower = sector.lower()
        if 'atención al cliente' in sector_lower: return 'Atención al Cliente'
        if 'caja' in sector_lower: return 'Cajas'
        if 'baño' in sector_lower: return 'Baños'
        if 'restoran' in sector_lower: return 'Restoranes'
        if 'autoservicio' in sector_lower: return 'Autoservicios'
        if 'traslados' in sector_lower: return 'Traslados'
        if 'vip' in sector_lower: return 'Sectores VIP'
        return 'Otros'
        
    df['grupo_sector'] = df['sector_final'].apply(asignar_grupo)
    
    fecha_inicio = df['fecha'].min().strftime('%d/%m/%Y')
    fecha_fin = df['fecha'].max().strftime('%d/%m/%Y')
    periodo = fecha_inicio if fecha_inicio == fecha_fin else f"Del {fecha_inicio} al {fecha_fin}"

    analisis_general = {
        "total_valoraciones": int(len(df)),
        "total_comentarios": int(df['comentarios'].notna().sum()),
        "satisfaccion_general": calcular_indice_satisfaccion(df),
        "grafico_diario_b64": generar_grafico_valoraciones_diarias(df),
        "grafico_conflictos_b64": generar_grafico_horas_conflictivas(df),
        "nube_palabras_b64": generar_nube_palabras_coloreada(df)
    }
    
    # --- CAMBIO CLAVE: Análisis por Grupos con sub-detalles ---
    analisis_grupos = {}
    # Orden de aparición de los grupos
    orden_grupos = ['Atención al Cliente', 'Cajas', 'Baños', 'Restoranes', 'Autoservicios', 'Traslados', 'Sectores VIP', 'Otros']
    
    for grupo_nombre in orden_grupos:
        df_grupo = df[df['grupo_sector'] == grupo_nombre]
        if not df_grupo.empty:
            # Para Atención al Cliente, generamos el general y los específicos
            if grupo_nombre == 'Atención al Cliente':
                 analisis_grupos['Atención al Cliente (General)'] = get_detailed_analysis(df_grupo, include_sub_details=True)
                 for sector_especifico in df_grupo['sector_final'].unique():
                      df_sector_especifico = df_grupo[df_grupo['sector_final'] == sector_especifico]
                      analisis_grupos[sector_especifico] = get_detailed_analysis(df_sector_especifico, include_sub_details=False)
            else:
                # Para los demás, solo el general con su tabla de desglose
                titulo = f'{grupo_nombre} (General)'
                analisis_grupos[titulo] = get_detailed_analysis(df_grupo, include_sub_details=True)

    # Análisis por Ubicación específica (sin cambios)
    analisis_ubicaciones = {}
    for u in df['ubicacion'].dropna().unique():
        analisis_ubicaciones[u] = get_detailed_analysis(df[df['ubicacion'] == u])
    
    return {
        "informe_periodo": periodo,
        "analisis_general": analisis_general,
        "analisis_sectores": analisis_grupos, # Se envía el nuevo diccionario de grupos
        "analisis_ubicaciones": dict(sorted(analisis_ubicaciones.items(), key=lambda item: item[1]['total_valoraciones'], reverse=True))
    }
