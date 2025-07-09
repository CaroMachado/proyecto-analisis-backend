# analisis.py
import pandas as pd
import io
import base64
from wordcloud import WordCloud
import matplotlib.pyplot as plt
import matplotlib.dates as mdates
import seaborn as sns
from collections import defaultdict
import numpy as np

# --- CONFIGURACIÓN DE ESTILO Y COLORES ---
# Colores consistentes para todo el informe
colores_sentimiento = {
    "Muy Positiva": "#2ca02c",  # Verde fuerte
    "Positiva": "#98df8a",      # Verde claro
    "Negativa": "#ff7f0e",      # Naranja
    "Muy Negativa": "#d62728",  # Rojo
}
plt.style.use('seaborn-v0_8-whitegrid')

# --- FUNCIONES AUXILIARES ---

def calcular_satisfaccion(df_summary):
    """Calcula el índice de satisfacción general según la fórmula dada."""
    try:
        total = df_summary['Respuestas'].iloc[0]
        muy_pos = df_summary['Muy Positivas'].iloc[0]
        pos = df_summary['Positivas'].iloc[0]
        neg = df_summary['Negativas'].iloc[0]
        muy_neg = df_summary['Muy Negativas'].iloc[0]
        
        # Fórmula: (Muy Positivas % + Positivas %) - (Muy Negativas % + Negativas %)
        # He ajustado tu fórmula a la estándar de NPS/CSAT que parece que buscas.
        # Si quieres la original: (muy_pos / total) - ((muy_neg + neg) / total)
        satisfaccion = ((muy_pos + pos) / total) - ((muy_neg + neg) / total)
        return round(satisfaccion * 100, 2)
    except Exception:
        return None

def calcular_satisfaccion_sector(df_sector):
    """Calcula el índice de satisfacción para un DataFrame de un sector específico."""
    if df_sector.empty:
        return 0
    
    counts = df_sector['calificacion_desc'].value_counts()
    total = len(df_sector)
    muy_pos = counts.get("Muy Positiva", 0)
    pos = counts.get("Positiva", 0)
    neg = counts.get("Negativa", 0)
    muy_neg = counts.get("Muy Negativa", 0)
    
    satisfaccion = ((muy_pos + pos) / total) - ((muy_neg + neg) / total)
    return round(satisfaccion * 100, 2)


def fig_to_base64(fig):
    """Convierte una figura de Matplotlib a una cadena base64."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

# --- FUNCIONES DE GENERACIÓN DE GRÁFICOS Y NUBE ---

def generar_grafico_valoraciones_diarias(df):
    """Genera un gráfico de barras apiladas con las valoraciones por día y una línea de satisfacción."""
    df_chart = df.copy()
    df_chart['fecha'] = pd.to_datetime(df_chart['fecha'], dayfirst=True)
    
    # Agrupar por fecha y contar tipos de calificación
    daily_counts = df_chart.groupby('fecha')['calificacion_desc'].value_counts().unstack(fill_value=0)
    
    # Asegurar que todas las columnas de sentimiento existan
    for col in colores_sentimiento.keys():
        if col not in daily_counts.columns:
            daily_counts[col] = 0
            
    daily_counts = daily_counts[list(colores_sentimiento.keys())] # Ordenar

    # Calcular satisfacción diaria
    daily_satisfaction = df_chart.groupby('fecha').apply(calcular_satisfaccion_sector)

    fig, ax1 = plt.subplots(figsize=(12, 7))
    
    # Gráfico de barras apiladas
    daily_counts.plot(kind='bar', stacked=True, color=[colores_sentimiento[col] for col in daily_counts.columns], ax=ax1, width=0.6)
    
    ax1.set_title('Valoraciones y Satisfacción por Día', fontsize=16)
    ax1.set_ylabel('Cantidad de Valoraciones', fontsize=12)
    ax1.set_xlabel('Fecha', fontsize=12)
    ax1.tick_params(axis='x', rotation=45)
    ax1.legend(title='Calificación')

    # Eje secundario para la línea de satisfacción
    ax2 = ax1.twinx()
    ax2.plot(ax1.get_xticks(), daily_satisfaction, marker='o', color='purple', linestyle='--', label='Satisfacción (%)')
    ax2.set_ylabel('Índice de Satisfacción (%)', fontsize=12, color='purple')
    ax2.tick_params(axis='y', labelcolor='purple')
    ax2.set_ylim(-105, 105) # Rango de satisfacción de -100 a 100
    
    fig.tight_layout()
    return fig_to_base64(fig)


def generar_grafico_horas_conflictivas(df):
    """Genera un gráfico de barras de horas con más comentarios negativos por sector."""
    df_neg = df[df['calificacion_desc'].isin(['Negativa', 'Muy Negativa'])].copy()
    if df_neg.empty:
        return None
        
    df_neg['hora_int'] = pd.to_datetime(df_neg['hora'], format='%H:%M:%S', errors='coerce').dt.hour
    
    conflictos = df_neg.groupby(['hora_int', 'sector_final']).size().unstack(fill_value=0)
    
    if conflictos.empty:
        return None

    fig, ax = plt.subplots(figsize=(12, 7))
    conflictos.plot(kind='bar', stacked=True, ax=ax, colormap='viridis')
    ax.set_title('Horas Conflictivas por Sector', fontsize=16)
    ax.set_xlabel('Hora del Día', fontsize=12)
    ax.set_ylabel('Nº de Comentarios Negativos/Muy Negativos', fontsize=12)
    ax.legend(title='Sector')
    
    return fig_to_base64(fig)

def color_func_sentimiento(word, font_size, position, orientation, random_state=None, **kwargs):
    """Función de color para la nube de palabras. Colorea cada palabra según su sentimiento asociado."""
    color = kwargs['color_map'].get(word.lower(), "#333333") # Default a gris oscuro
    return color

def generar_nube_palabras_coloreada(df):
    """Genera una nube de palabras donde el color de cada palabra se basa en el sentimiento de los comentarios donde aparece."""
    word_sentiment_map = defaultdict(list)
    
    # Mapear cada palabra a los sentimientos de los comentarios en los que aparece
    for _, row in df.iterrows():
        comment = str(row['Comentarios']).lower()
        sentiment = row['calificacion_desc']
        if pd.notna(comment):
            words = comment.split()
            for word in words:
                word_sentiment_map[word].append(sentiment)

    # Determinar el color dominante para cada palabra
    color_map = {}
    for word, sentiments in word_sentiment_map.items():
        # Lógica simple: el sentimiento más frecuente determina el color
        if not sentiments: continue
        dominant_sentiment = max(set(sentiments), key=sentiments.count)
        color_map[word] = colores_sentimiento.get(dominant_sentiment, "#333333")

    texto_completo = " ".join(str(t) for t in df['Comentarios'] if pd.notna(t))
    if not texto_completo.strip():
        return None
        
    wc = WordCloud(width=800, height=400, background_color='white', max_words=100, collocations=False)
    wc.generate(texto_completo)
    
    # Aplicar la función de color
    wc.recolor(color_func=lambda word, **kwargs: color_func_sentimiento(word, color_map=color_map, **kwargs))

    img = io.BytesIO()
    wc.to_image().save(img, format='PNG')
    return base64.b64encode(img.getvalue()).decode()
    
# --- FUNCIÓN PRINCIPAL DE PROCESAMIENTO ---

def procesar_datos(archivo_excel):
    """
    Función principal que orquesta todo el análisis del archivo Excel.
    """
    try:
        df_main = pd.read_excel(archivo_excel, sheet_name=0) # Primera hoja para datos
        df_summary = pd.read_excel(archivo_excel, sheet_name='Resumen') # Hoja 'Resumen' para satisfacción
    except Exception as e:
        raise ValueError(f"Error al leer el archivo Excel. Asegúrate que tenga al menos una hoja con los datos y una hoja llamada 'Resumen'. Error: {e}")

    # --- LIMPIEZA Y PREPARACIÓN DE DATOS ---
    df = df_main.copy()
    df['fecha'] = pd.to_datetime(df['fecha'], dayfirst=True).dt.date
    
    # Crear la columna 'sector_final' para agrupar 'VIP'
    df['sector_final'] = df.apply(lambda row: 'VIP' if 'VIP' in str(row['sala']) else str(row['sector']).strip(), axis=1)
    
    # --- ANÁLISIS GENERAL ---
    fecha_inicio = df['fecha'].min().strftime('%d/%m/%Y')
    fecha_fin = df['fecha'].max().strftime('%d/%m/%Y')
    periodo = fecha_inicio if fecha_inicio == fecha_fin else f"Del {fecha_inicio} al {fecha_fin}"

    total_valoraciones = len(df)
    total_comentarios = df['Comentarios'].notna().sum()
    satisfaccion_general = calcular_satisfaccion(df_summary)

    # --- ANÁLISIS POR SECTOR ---
    sectores = df['sector_final'].unique()
    analisis_sectores = {}

    for sector in sectores:
        df_sector = df[df['sector_final'] == sector]
        
        # Oportunidades de mejora (basado en 'puntos_criticos')
        mejoras = df_sector[df_sector['puntos_criticos'].notna() & (df_sector['puntos_criticos'] != "Otros")]
        oportunidades = []
        if not mejoras.empty:
            for tema, grupo in mejoras.groupby('puntos_criticos'):
                ejemplos = grupo['Comentarios'].dropna().head(3).tolist()
                oportunidades.append({
                    "tema": tema,
                    "cantidad": len(grupo),
                    "ejemplos": ejemplos
                })

        # Puntos destacados (basado en 'destacados')
        positivos = df_sector[df_sector['destacados'].notna() & (df_sector['destacados'] != "Otros")]
        destacados = []
        if not positivos.empty:
            for tema, grupo in positivos.groupby('destacados'):
                ejemplos = grupo['Comentarios'].dropna().head(3).tolist()
                destacados.append({
                    "tema": tema,
                    "cantidad": len(grupo),
                    "ejemplos": ejemplos
                })
        
        # Horas conflictivas del sector
        df_neg_sector = df_sector[df_sector['calificacion_desc'].isin(['Negativa', 'Muy Negativa'])].copy()
        df_neg_sector['hora_int'] = pd.to_datetime(df_neg_sector['hora'], format='%H:%M:%S', errors='coerce').dt.hour
        horas_conflicto_sector = df_neg_sector['hora_int'].value_counts().to_dict()

        analisis_sectores[sector] = {
            "total_valoraciones": len(df_sector),
            "total_comentarios": df_sector['Comentarios'].notna().sum(),
            "satisfaccion": calcular_satisfaccion_sector(df_sector),
            "oportunidades_mejora": sorted(oportunidades, key=lambda x: x['cantidad'], reverse=True),
            "puntos_destacados": sorted(destacados, key=lambda x: x['cantidad'], reverse=True),
            "horas_conflictivas": dict(sorted(horas_conflicto_sector.items()))
        }
    
    # --- GENERACIÓN DE VISUALES ---
    grafico_diario = generar_grafico_valoraciones_diarias(df)
    grafico_conflictos = generar_grafico_horas_conflictivas(df)
    nube_palabras = generar_nube_palabras_coloreada(df)

    # --- COMPILACIÓN DE RESULTADOS ---
    resultados = {
        "informe_periodo": periodo,
        "analisis_general": {
            "total_valoraciones": total_valoraciones,
            "total_comentarios": total_comentarios,
            "satisfaccion_general": satisfaccion_general,
            "nube_palabras_b64": nube_palabras,
            "grafico_diario_b64": grafico_diario,
            "grafico_conflictos_b64": grafico_conflictos,
        },
        "analisis_sectores": dict(sorted(analisis_sectores.items()))
    }
    
    return resultados
