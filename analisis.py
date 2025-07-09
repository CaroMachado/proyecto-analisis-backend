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
colores_sentimiento = {
    "Muy Positiva": "#2ca02c",
    "Positiva": "#98df8a",
    "Negativa": "#ff7f0e",
    "Muy Negativa": "#d62728",
}
plt.style.use('seaborn-v0_8-whitegrid')

# --- FUNCIONES AUXILIARES DE CÁLCULO ---

def calcular_satisfaccion_desde_df(df_source):
    """
    <-- CAMBIO CLAVE: Calcula el índice de satisfacción general o por sector 
    directamente desde un DataFrame, contando las calificaciones.
    """
    if df_source.empty:
        return 0.0

    counts = df_source['calificacion_descripcion'].value_counts()
    total = len(df_source)
    
    muy_pos = counts.get("Muy Positiva", 0)
    pos = counts.get("Positiva", 0)
    neg = counts.get("Negativa", 0)
    muy_neg = counts.get("Muy Negativa", 0)
    
    # Fórmula de Satisfacción: (% Positivas + % Muy Positivas) - (% Negativas + % Muy Negativas)
    if total == 0:
        return 0.0
        
    satisfaccion = ((muy_pos + pos) / total) - ((muy_neg + neg) / total)
    return round(satisfaccion * 100, 2)


def fig_to_base64(fig):
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig)
    return base64.b64encode(buf.getvalue()).decode('utf-8')

# --- El resto de funciones (gráficos, nube de palabras) se mantienen igual ---
# ... (generar_grafico_valoraciones_diarias, generar_grafico_horas_conflictivas, etc. de mi respuesta anterior) ...
def generar_grafico_valoraciones_diarias(df):
    """Genera un gráfico de barras apiladas con las valoraciones por día y una línea de satisfacción."""
    df_chart = df.copy()
    # Asegúrate de que la columna 'fecha' se convierta a datetime correctamente
    df_chart['fecha'] = pd.to_datetime(df_chart['fecha'], dayfirst=True)
    
    daily_counts = df_chart.groupby(df_chart['fecha'].dt.date)['calificacion_desc'].value_counts().unstack(fill_value=0)
    
    for col in colores_sentimiento.keys():
        if col not in daily_counts.columns:
            daily_counts[col] = 0
            
    daily_counts = daily_counts[list(colores_sentimiento.keys())]

    # <-- CAMBIO CLAVE: Usa la nueva función de cálculo
    daily_satisfaction = df_chart.groupby(df_chart['fecha'].dt.date).apply(calcular_satisfaccion_desde_df)

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
    
    for _, row in df.iterrows():
        comment = str(row['Comentarios']).lower()
        sentiment = row['calificacion_desc']
        if pd.notna(comment):
            words = comment.split()
            for word in words:
                word_sentiment_map[word].append(sentiment)

    color_map = {}
    for word, sentiments in word_sentiment_map.items():
        if not sentiments: continue
        dominant_sentiment = max(set(sentiments), key=sentiments.count)
        color_map[word] = colores_sentimiento.get(dominant_sentiment, "#333333")

    texto_completo = " ".join(str(t) for t in df['Comentarios'] if pd.notna(t))
    if not texto_completo.strip():
        return None
        
    wc = WordCloud(width=800, height=400, background_color='white', max_words=100, collocations=False)
    wc.generate(texto_completo)
    
    wc.recolor(color_func=lambda word, **kwargs: color_func_sentimiento(word, color_map=color_map, **kwargs))

    img = io.BytesIO()
    wc.to_image().save(img, format='PNG')
    return base64.b64encode(img.getvalue()).decode()
    
# --- FUNCIÓN PRINCIPAL DE PROCESAMIENTO ---

def procesar_datos(archivo_excel):
    try:
        # <-- CAMBIO CLAVE: Ahora solo lee la primera hoja. No más 'Resumen'.
        df_main = pd.read_excel(archivo_excel, sheet_name=0) 
    except Exception as e:
        raise ValueError(f"Error al leer el archivo Excel. Asegúrate de que tenga el formato correcto. Error: {e}")

    # --- LIMPIEZA Y PREPARACIÓN DE DATOS ---
    df = df_main.copy()
    df['fecha'] = pd.to_datetime(df['fecha'], dayfirst=True).dt.date
    
    df['sector_final'] = df.apply(lambda row: 'VIP' if 'VIP' in str(row['sala']) else str(row['sector']).strip(), axis=1)
    
    # --- ANÁLISIS GENERAL ---
    fecha_inicio = df['fecha'].min().strftime('%d/%m/%Y')
    fecha_fin = df['fecha'].max().strftime('%d/%m/%Y')
    periodo = fecha_inicio if fecha_inicio == fecha_fin else f"Del {fecha_inicio} al {fecha_fin}"

    total_valoraciones = len(df)
    total_comentarios = df['Comentarios'].notna().sum()
    
    # <-- CAMBIO CLAVE: Calcular satisfacción general desde el DF principal
    satisfaccion_general = calcular_satisfaccion_desde_df(df)

    # --- ANÁLISIS POR SECTOR ---
    sectores = df['sector_final'].unique()
    analisis_sectores = {}

    for sector in sectores:
        df_sector = df[df['sector_final'] == sector]
        
        # Oportunidades de mejora
        mejoras = df_sector[df_sector['puntos_criticos'].notna() & (df_sector['puntos_criticos'] != "Otros")]
        oportunidades = []
        if not mejoras.empty:
            for tema, grupo in mejoras.groupby('puntos_criticos'):
                ejemplos = grupo['Comentarios'].dropna().head(3).tolist()
                oportunidades.append({"tema": tema, "cantidad": len(grupo), "ejemplos": ejemplos})

        # Puntos destacados
        positivos = df_sector[df_sector['destacados'].notna() & (df_sector['destacados'] != "Otros")]
        destacados = []
        if not positivos.empty:
            for tema, grupo in positivos.groupby('destacados'):
                ejemplos = grupo['Comentarios'].dropna().head(3).tolist()
                destacados.append({"tema": tema, "cantidad": len(grupo), "ejemplos": ejemplos})
        
        analisis_sectores[sector] = {
            "total_valoraciones": len(df_sector),
            "total_comentarios": df_sector['Comentarios'].notna().sum(),
            # <-- CAMBIO CLAVE: Usa la nueva función para cada sector
            "satisfaccion": calcular_satisfaccion_desde_df(df_sector),
            "oportunidades_mejora": sorted(oportunidades, key=lambda x: x['cantidad'], reverse=True),
            "puntos_destacados": sorted(destacados, key=lambda x: x['cantidad'], reverse=True),
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
