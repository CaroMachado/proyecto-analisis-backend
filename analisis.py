# analisis.py
import pandas as pd
import io
import base64
from wordcloud import WordCloud
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import seaborn as sns
from collections import defaultdict
import re

# --- CONFIGURACIÓN DE ESTILO Y COLORES ---
colores_sentimiento = {
    "Muy Positiva": "#2ca02c", "Positiva": "#98df8a",
    "Negativa": "#ff7f0e", "Muy Negativa": "#d62728",
}
plt.style.use('seaborn-v0_8-whitegrid')

# --- FUNCIONES DE ANÁLISIS ---

def calcular_satisfaccion(df_source, col_calif_desc):
    """Calcula el índice de satisfacción para cualquier DataFrame dado."""
    if df_source.empty: return 0.0
    counts = df_source[col_calif_desc].value_counts()
    total = len(df_source)
    if total == 0: return 0.0
    
    muy_pos = counts.get("Muy Positiva", 0); pos = counts.get("Positiva", 0)
    neg = counts.get("Negativa", 0); muy_neg = counts.get("Muy Negativa", 0)
    
    satisfaccion = ((muy_pos + pos) / total) - ((muy_neg + neg) / total)
    return round(satisfaccion * 100, 2)

# --- FUNCIONES DE VISUALIZACIÓN ---

def fig_to_base64(fig):
    """Convierte una figura de Matplotlib a una cadena base64."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def generar_grafico_valoraciones_diarias(df, col_fecha, col_calif_desc):
    """Genera un gráfico de barras apiladas con las valoraciones por día y una línea de satisfacción."""
    df_chart = df.copy()
    df_chart[col_fecha] = pd.to_datetime(df_chart[col_fecha], dayfirst=True)
    
    daily_counts = df_chart.groupby(df_chart[col_fecha].dt.date)[col_calif_desc].value_counts().unstack(fill_value=0)
    
    for col in colores_sentimiento.keys():
        if col not in daily_counts.columns: daily_counts[col] = 0
            
    daily_counts = daily_counts[list(colores_sentimiento.keys())]

    daily_satisfaction = df_chart.groupby(df_chart[col_fecha].dt.date).apply(calcular_satisfaccion, col_calif_desc=col_calif_desc)

    fig, ax1 = plt.subplots(figsize=(12, 7))
    daily_counts.plot(kind='bar', stacked=True, color=[colores_sentimiento[col] for col in daily_counts.columns], ax=ax1, width=0.6)
    
    ax1.set_title('Valoraciones y Satisfacción por Día', fontsize=16)
    ax1.set_ylabel('Cantidad de Valoraciones', fontsize=12)
    ax1.set_xlabel('Fecha', fontsize=12)
    ax1.tick_params(axis='x', rotation=45)
    ax1.legend(title='Calificación')
    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%d-%m-%Y'))

    ax2 = ax1.twinx()
    ax2.plot(ax1.get_xticks(), daily_satisfaction.values, marker='o', color='purple', linestyle='--', label='Satisfacción (%)')
    ax2.set_ylabel('Índice de Satisfacción (%)', fontsize=12, color='purple')
    ax2.tick_params(axis='y', labelcolor='purple')
    ax2.set_ylim(-105, 105)
    
    fig.tight_layout()
    return fig_to_base64(fig)


def generar_grafico_horas_conflictivas(df, col_calif_desc, col_hora):
    """Genera un gráfico de barras de horas con más comentarios negativos por sector."""
    df_neg = df[df[col_calif_desc].isin(['Negativa', 'Muy Negativa'])].copy()
    if df_neg.empty: return None
        
    df_neg['hora_int'] = pd.to_datetime(df_neg[col_hora], format='%H:%M:%S', errors='coerce').dt.hour
    
    conflictos = df_neg.groupby(['hora_int', 'sector_final']).size().unstack(fill_value=0)
    
    if conflictos.empty: return None

    fig, ax = plt.subplots(figsize=(12, 7))
    conflictos.plot(kind='bar', stacked=True, ax=ax, colormap='viridis')
    ax.set_title('Horas Conflictivas por Sector (Comentarios Negativos)', fontsize=16)
    ax.set_xlabel('Hora del Día', fontsize=12)
    ax.set_ylabel('Nº de Comentarios Negativos/Muy Negativos', fontsize=12)
    ax.legend(title='Sector')
    
    return fig_to_base64(fig)

def color_func_sentimiento(word, **kwargs):
    """Función para colorear la nube de palabras según el sentimiento."""
    return kwargs['color_map'].get(word.lower(), "#333333")

    # ... (código previo de la función) ...
    wc = WordCloud(stopwords=stopwords, width=800, height=400, background_color='white', max_words=100, collocations=False).generate(texto_completo)
    wc.recolor(color_func=lambda word, **kwargs: color_func_sentimiento(word, color_map=color_map, **kwargs))
    
    # ESTA ES LA LÍNEA CORRECTA
    img_buffer = io.BytesIO()
    wc.to_image().save(img_buffer, format='PNG')
    return base64.b64encode(img_buffer.getvalue()).decode('utf-8')
    # Lista de palabras a excluir (stopwords)
    stopwords = set(["de", "la", "el", "en", "y", "que", "un", "una", "los", "las", "es", "muy", "por", "con", "se", "no", "del", "al", "me", "le", "lo", "su", "mi"])
    texto_completo = " ".join(str(t) for t in df[col_comentarios] if pd.notna(t))
    if not texto_completo.strip(): return None
        
    wc = WordCloud(stopwords=stopwords, width=800, height=400, background_color='white', max_words=100, collocations=False)
    wc.generate(texto_completo)
    
    wc.recolor(color_func=lambda word, **kwargs: color_func_sentimiento(word, color_map=color_map, **kwargs))

    return fig_to_base64(wc.to_image())

# --- FUNCIÓN PRINCIPAL DE PROCESAMIENTO ---

def procesar_datos(archivo_excel):
    try:
        df = pd.read_excel(archivo_excel, sheet_name=0)
    except Exception as e:
        raise ValueError(f"No se pudo leer el archivo Excel. Asegúrate de que es un archivo .xlsx válido. Error: {e}")

    # ===== PASO 1: LIMPIEZA Y ESTANDARIZACIÓN DE NOMBRES DE COLUMNAS (A PRUEBA DE ERRORES) =====
    # Esto elimina el error de 'calificacion_descripcion' para siempre.
    original_cols = df.columns
    df.columns = [re.sub(r'\s+', '_', col).lower().strip() for col in df.columns]
    
    # Mapeo de nombres de columna esperados (en formato limpio) a los nombres que usaremos
    mapa_columnas = {
        'fecha': 'fecha',
        'hora': 'hora',
        'sala': 'sala',
        'sector': 'sector',
        'ubicacion': 'ubicacion',
        'comentarios': 'comentarios',
        'calificacion': 'calificacion_num',
        'calificacion_descripcion': 'calificacion_desc',
        'puntos_criticos': 'puntos_criticos',
        'destacados': 'destacados'
    }
    
    # Renombrar columnas según el mapa
    df.rename(columns=mapa_columnas, inplace=True)
    
    # Verificar si todas las columnas necesarias existen después de la limpieza
    columnas_necesarias = list(mapa_columnas.values())
    columnas_faltantes = [col for col in columnas_necesarias if col not in df.columns]
    if columnas_faltantes:
        raise ValueError(f"El archivo Excel no contiene las columnas necesarias. Faltan: {', '.join(columnas_faltantes)}. Columnas encontradas (limpias): {', '.join(df.columns)}. Columnas originales: {', '.join(original_cols)}")

    # ===== PASO 2: PREPARACIÓN DE DATOS =====
    df['fecha'] = pd.to_datetime(df['fecha'], errors='coerce')
    df['sector_final'] = df.apply(lambda row: 'VIP' if 'VIP' in str(row['sala']) else str(row['sector']).strip(), axis=1)

    # ===== PASO 3: ANÁLISIS GENERAL =====
    fecha_inicio = df['fecha'].min().strftime('%d/%m/%Y')
    fecha_fin = df['fecha'].max().strftime('%d/%m/%Y')
    periodo = fecha_inicio if fecha_inicio == fecha_fin else f"Del {fecha_inicio} al {fecha_fin}"

    analisis_general = {
        "total_valoraciones": len(df),
        "total_comentarios": df['comentarios'].notna().sum(),
        "satisfaccion_general": calcular_satisfaccion(df, 'calificacion_desc'),
        "grafico_diario_b64": generar_grafico_valoraciones_diarias(df, 'fecha', 'calificacion_desc'),
        "grafico_conflictos_b64": generar_grafico_horas_conflictivas(df, 'calificacion_desc', 'hora'),
        "nube_palabras_b64": generar_nube_palabras_coloreada(df, 'comentarios', 'calificacion_desc')
    }
    
    # ===== PASO 4: ANÁLISIS DETALLADO (POR SECTOR Y POR UBICACIÓN) =====
    
    def get_detailed_analysis(df_grupo, col_comentarios, col_criticos, col_destacados, col_calif_desc):
        """Función reutilizable para analizar un grupo (sector o ubicación)."""
        if df_grupo.empty:
            return None
        
        # Oportunidades de mejora
        mejoras = df_grupo[df_grupo[col_criticos].notna() & (df_grupo[col_criticos] != "Otros")]
        oportunidades = []
        if not mejoras.empty:
            for tema, grupo in mejoras.groupby(col_criticos):
                ejemplos = grupo[col_comentarios].dropna().head(3).tolist()
                oportunidades.append({"tema": str(tema), "cantidad": len(grupo), "ejemplos": ejemplos})
        
        # Puntos destacados
        positivos = df_grupo[df_grupo[col_destacados].notna() & (df_grupo[col_destacados] != "Otros")]
        destacados = []
        if not positivos.empty:
            for tema, grupo in positivos.groupby(col_destacados):
                ejemplos = grupo[col_comentarios].dropna().head(3).tolist()
                destacados.append({"tema": str(tema), "cantidad": len(grupo), "ejemplos": ejemplos})
        
        return {
            "total_valoraciones": len(df_grupo),
            "total_comentarios": df_grupo[col_comentarios].notna().sum(),
            "satisfaccion": calcular_satisfaccion(df_grupo, col_calif_desc),
            "oportunidades_mejora": sorted(oportunidades, key=lambda x: x['cantidad'], reverse=True),
            "puntos_destacados": sorted(destacados, key=lambda x: x['cantidad'], reverse=True),
        }

    # Análisis por Sector
    analisis_sectores = {}
    for sector in df['sector_final'].unique():
        df_sector = df[df['sector_final'] == sector]
        analisis_sectores[sector] = get_detailed_analysis(df_sector, 'comentarios', 'puntos_criticos', 'destacados', 'calificacion_desc')
    
    # Análisis por Ubicación (Ej: Cajas, Baños específicos, etc.)
    analisis_ubicaciones = {}
    for ubicacion in df['ubicacion'].unique():
        if pd.notna(ubicacion):
            df_ubicacion = df[df['ubicacion'] == ubicacion]
            analisis_ubicaciones[ubicacion] = get_detailed_analysis(df_ubicacion, 'comentarios', 'puntos_criticos', 'destacados', 'calificacion_desc')
    
    # ===== PASO 5: COMPILACIÓN FINAL DE RESULTADOS =====
    resultados = {
        "informe_periodo": periodo,
        "analisis_general": analisis_general,
        "analisis_sectores": dict(sorted(analisis_sectores.items())),
        "analisis_ubicaciones": dict(sorted(analisis_ubicaciones.items(), key=lambda item: item[1]['total_valoraciones'], reverse=True))
    }
    
    return resultados
