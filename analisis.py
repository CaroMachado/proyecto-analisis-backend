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

# --- FUNCIONES DE ANÁLISIS Y VISUALIZACIÓN ---

def calcular_satisfaccion(df_source):
    """Calcula el índice de satisfacción para cualquier DataFrame dado."""
    if df_source.empty: return 0.0
    counts = df_source['calificacion_descripcion'].value_counts()
    total = len(df_source)
    if total == 0: return 0.0
    muy_pos = counts.get("Muy Positiva", 0); pos = counts.get("Positiva", 0)
    neg = counts.get("Negativa", 0); muy_neg = counts.get("Muy Negativa", 0)
    satisfaccion = ((muy_pos + pos) / total) - ((muy_neg + neg) / total)
    return round(satisfaccion * 100, 2)

def fig_to_base64(fig):
    """Convierte una figura de Matplotlib a una cadena base64."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def generar_grafico_valoraciones_diarias(df):
    """Genera un gráfico de barras apiladas con las valoraciones por día."""
    df_chart = df.copy()
    df_chart['fecha'] = pd.to_datetime(df_chart['fecha'], dayfirst=True)
    daily_counts = df_chart.groupby(df_chart['fecha'].dt.date)['calificacion_descripcion'].value_counts().unstack(fill_value=0)
    for col in colores_sentimiento.keys():
        if col not in daily_counts.columns: daily_counts[col] = 0
    daily_counts = daily_counts[list(colores_sentimiento.keys())]
    daily_satisfaction = df_chart.groupby(df_chart['fecha'].dt.date).apply(calcular_satisfaccion)
    fig, ax1 = plt.subplots(figsize=(12, 7))
    daily_counts.plot(kind='bar', stacked=True, color=[colores_sentimiento[col] for col in daily_counts.columns], ax=ax1, width=0.6)
    ax1.set_title('Valoraciones y Satisfacción por Día', fontsize=16); ax1.set_ylabel('Cantidad de Valoraciones', fontsize=12); ax1.set_xlabel('Fecha', fontsize=12)
    ax1.tick_params(axis='x', rotation=45); ax1.legend(title='Calificación'); ax1.xaxis.set_major_formatter(mdates.DateFormatter('%d-%m-%Y'))
    ax2 = ax1.twinx()
    ax2.plot(ax1.get_xticks(), daily_satisfaction.values, marker='o', color='purple', linestyle='--', label='Satisfacción (%)')
    ax2.set_ylabel('Índice de Satisfacción (%)', fontsize=12, color='purple'); ax2.tick_params(axis='y', labelcolor='purple'); ax2.set_ylim(-105, 105)
    fig.tight_layout()
    return fig_to_base64(fig)

def generar_grafico_horas_conflictivas(df):
    """Genera un gráfico de barras de horas conflictivas."""
    df_neg = df[df['calificacion_descripcion'].isin(['Negativa', 'Muy Negativa'])].copy()
    if df_neg.empty: return None
    df_neg['hora_int'] = pd.to_datetime(df_neg['hora'], format='%H:%M:%S', errors='coerce').dt.hour
    conflictos = df_neg.groupby(['hora_int', 'sector_final']).size().unstack(fill_value=0)
    if conflictos.empty: return None
    fig, ax = plt.subplots(figsize=(12, 7))
    conflictos.plot(kind='bar', stacked=True, ax=ax, colormap='viridis')
    ax.set_title('Horas Conflictivas por Sector (Comentarios Negativos)', fontsize=16)
    ax.set_xlabel('Hora del Día', fontsize=12); ax.set_ylabel('Nº de Comentarios Negativos/Muy Negativos', fontsize=12); ax.legend(title='Sector')
    return fig_to_base64(fig)

def generar_nube_palabras_coloreada(df):
    """Genera una nube de palabras donde el color se basa en el sentimiento."""
    def color_func_sentimiento(word, **kwargs):
        return kwargs['color_map'].get(word.lower(), "#333333")

    word_sentiment_map = defaultdict(list)
    for _, row in df.iterrows():
        comment = str(row['comentarios']).lower()
        sentiment = row['calificacion_descripcion']
        if pd.notna(comment):
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
    
    # Conversión correcta de la imagen de WordCloud a base64
    img_buffer = io.BytesIO()
    wc.to_image().save(img_buffer, format='PNG')
    return base64.b64encode(img_buffer.getvalue()).decode('utf-8')


# --- FUNCIÓN PRINCIPAL DE PROCESAMIENTO ---
def procesar_datos(archivo_excel):
    try:
        df = pd.read_excel(archivo_excel, sheet_name=0)
    except Exception as e:
        raise ValueError(f"No se pudo leer el archivo Excel. Asegúrate de que es un archivo .xlsx válido. Error: {e}")

    original_cols = df.columns.tolist()
    df.columns = [re.sub(r'\s+', '_', col.strip()).lower() for col in df.columns]

    columnas_necesarias = [
        'fecha', 'hora', 'sala', 'sector', 'ubicacion',
        'comentarios', 'calificacion', 'calificacion_descripcion',
        'puntos_criticos', 'destacados'
    ]
    
    columnas_faltantes = [col for col in columnas_necesarias if col not in df.columns]
    if columnas_faltantes:
        raise ValueError(
            f"El archivo Excel no contiene las columnas necesarias. "
            f"Faltan: {', '.join(columnas_faltantes)}. "
            f"Columnas encontradas (después de limpiar): {', '.join(df.columns)}. "
            f"Columnas originales en el Excel: {', '.join(original_cols)}"
        )

    df['fecha'] = pd.to_datetime(df['fecha'], errors='coerce')
    df['sector_final'] = df.apply(lambda row: 'VIP' if 'VIP' in str(row['sala']) else str(row['sector']).strip(), axis=1)

    fecha_inicio = df['fecha'].min().strftime('%d/%m/%Y')
    fecha_fin = df['fecha'].max().strftime('%d/%m/%Y')
    periodo = fecha_inicio if fecha_inicio == fecha_fin else f"Del {fecha_inicio} al {fecha_fin}"

    analisis_general = {
        "total_valoraciones": len(df),
        "total_comentarios": df['comentarios'].notna().sum(),
        "satisfaccion_general": calcular_satisfaccion(df),
        "grafico_diario_b64": generar_grafico_valoraciones_diarias(df),
        "grafico_conflictos_b64": generar_grafico_horas_conflictivas(df),
        "nube_palabras_b64": generar_nube_palabras_coloreada(df)
    }
    
    def get_detailed_analysis(df_grupo):
        if df_grupo.empty: return None
        
        mejoras = df_grupo[df_grupo['puntos_criticos'].notna() & (df_grupo['puntos_criticos'] != "Otros")]
        oportunidades = []
        if not mejoras.empty:
            for tema, grupo in mejoras.groupby('puntos_criticos'):
                ejemplos = grupo['comentarios'].dropna().head(3).tolist()
                oportunidades.append({"tema": str(tema), "cantidad": len(grupo), "ejemplos": ejemplos})
        
        positivos = df_grupo[df_grupo['destacados'].notna() & (df_grupo['destacados'] != "Otros")]
        destacados = []
        if not positivos.empty:
            for tema, grupo in positivos.groupby('destacados'):
                ejemplos = grupo['comentarios'].dropna().head(3).tolist()
                destacados.append({"tema": str(tema), "cantidad": len(grupo), "ejemplos": ejemplos})
        
        return {
            "total_valoraciones": len(df_grupo),
            "total_comentarios": df_grupo['comentarios'].notna().sum(),
            "satisfaccion": calcular_satisfaccion(df_grupo),
            "oportunidades_mejora": sorted(oportunidades, key=lambda x: x['cantidad'], reverse=True),
            "puntos_destacados": sorted(destacados, key=lambda x: x['cantidad'], reverse=True),
        }

    analisis_sectores = {s: get_detailed_analysis(df[df['sector_final'] == s]) for s in df['sector_final'].unique()}
    
    analisis_ubicaciones = {}
    for u in df['ubicacion'].dropna().unique():
        analisis_ubicaciones[u] = get_detailed_analysis(df[df['ubicacion'] == u])
    
    return {
        "informe_periodo": periodo,
        "analisis_general": analisis_general,
        "analisis_sectores": dict(sorted(analisis_sectores.items())),
        "analisis_ubicaciones": dict(sorted(analisis_ubicaciones.items(), key=lambda item: item[1]['total_valoraciones'], reverse=True))
    }
