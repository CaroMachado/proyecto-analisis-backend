# analisis.py
import pandas as pd
import io
import base64
from wordcloud import WordCloud
import matplotlib.pyplot as plt
import re
from collections import defaultdict
import os

# --- Importar las librerías para ejecutar el modelo localmente ---
from transformers import pipeline
import torch

# --- CONFIGURACIÓN DE IA LOCAL ---
# Cargar el modelo de IA UNA SOLA VEZ cuando la aplicación se inicia.
# Esto puede tardar varios minutos en el primer arranque mientras descarga el modelo.
print("INFO: Cargando el modelo de análisis de sentimiento. Esto puede tardar...")
MODELO_CARGADO = False
sentiment_pipeline = None
try:
    sentiment_pipeline = pipeline(
        "sentiment-analysis",
        model="pysentimiento/robertuito-sentiment-analysis",
        device=-1  # Forzar uso de CPU
    )
    print("INFO: Modelo de análisis de sentimiento cargado exitosamente.")
    MODELO_CARGADO = True
except Exception as e:
    print(f"ERROR: No se pudo cargar el modelo de IA. El análisis se basará en la calificación original. Error: {e}")

# --- CONFIGURACIÓN DE ESTILO Y COLORES ---
colores_sentimiento = {
    "Muy Negativa": "#d62728", 
    "Negativa": "#ff7f0e",
    "Neutral": "#cccccc",
    "Positiva": "#98df8a",
    "Muy Positiva": "#2ca02c",
}
orden_calificaciones = ["Muy Negativa", "Negativa", "Neutral", "Positiva", "Muy Positiva"]
STOPWORDS_ES = set([
    "de", "la", "el", "en", "y", "que", "un", "una", "los", "las", "es", "muy", "por", "con", "se", "no", 
    "del", "al", "me", "le", "lo", "su", "mi", "para", "como", "mas", "más", "pero", "este", "esta",
    "todo", "todos", "toda", "todas", "fue", "era", "ha", "han", "ser", "estar", "si", "hay",
    "tiene", "tienen", "les", "nos", "son", "pero", "sin", "sobre", "entre", "cuando", "donde",
    "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"
])
plt.style.use('seaborn-v0_8-whitegrid')

# ==============================================================================
# SECCIÓN 1: FUNCIONES DE AYUDA (Helpers)
# ==============================================================================

def analizar_sentimiento_con_ia(texto):
    """Usa la 'pipeline' local para analizar el sentimiento."""
    if not MODELO_CARGADO or not texto or not isinstance(texto, str) or not texto.strip():
        return None  # Devolver None si no hay modelo o texto, para usar el fallback

    try:
        # Truncar texto para evitar errores con comentarios muy largos
        resultado = sentiment_pipeline(texto, truncation=True, max_length=512)[0]
        sentimiento = resultado['label']
        # Mapeo del modelo a nuestras categorías
        mapeo = {"POS": "Muy Positiva", "NEU": "Neutral", "NEG": "Muy Negativa"}
        return mapeo.get(sentimiento, "Neutral")
    except Exception as e:
        print(f"ERROR: durante el análisis de sentimiento local: {e}")
        return None # Fallback si hay un error en un texto específico

def calcular_indice_satisfaccion(df_source):
    if df_source.empty: return 0.0
    total_respuestas = len(df_source)
    if total_respuestas == 0: return 0.0
    counts = df_source['calificacion_ia'].value_counts()
    # Los promotores incluyen tanto Positiva como Muy Positiva
    promotores = counts.get("Muy Positiva", 0) + counts.get("Positiva", 0)
    # Los detractores incluyen tanto Negativa como Muy Negativa
    detractores = counts.get("Negativa", 0) + counts.get("Muy Negativa", 0)
    indice = ((promotores - detractores) / total_respuestas) * 100
    return round(indice, 1)

def generar_nube_palabras(texto, color):
    if not texto or not texto.strip(): return None
    try:
        wc = WordCloud(stopwords=STOPWORDS_ES, width=800, height=400, background_color='white', max_words=75, collocations=False, color_func=lambda *args, **kwargs: color).generate(texto)
        img_buffer = io.BytesIO()
        wc.to_image().save(img_buffer, format='PNG')
        return base64.b64encode(img_buffer.getvalue()).decode('utf-8')
    except ValueError: # Ocurre si el texto solo contiene stopwords
        return None

def generar_grafico_valoraciones_diarias(df):
    if df.empty: return None
    df_chart = df.copy()
    df_chart['fecha_dt'] = pd.to_datetime(df_chart['fecha'], errors='coerce').dt.date
    daily_counts = df_chart.groupby('fecha_dt')['calificacion_ia'].value_counts().unstack(fill_value=0)
    
    # Asegurarse de que todas las columnas de calificación existan para el gráfico
    for col in orden_calificaciones:
        if col not in daily_counts.columns:
            daily_counts[col] = 0
    daily_counts = daily_counts[orden_calificaciones]

    daily_satisfaction = df_chart.groupby('fecha_dt').apply(calcular_indice_satisfaccion)
    
    # Usar el API orientado a objetos de Matplotlib (más seguro para servidores)
    fig, ax1 = plt.subplots(figsize=(12, 7))
    daily_counts.plot(kind='bar', stacked=True, color=[colores_sentimiento.get(col, '#333333') for col in orden_calificaciones], ax=ax1, width=0.6)
    ax1.set_title('Valoraciones y Satisfacción por Día (Análisis IA)', fontsize=16)
    ax1.set_ylabel('Cantidad de Valoraciones', fontsize=12)
    ax1.set_xlabel('Fecha', fontsize=12)
    ax1.legend(title='Calificación (IA)', bbox_to_anchor=(1.05, 1), loc='upper left')
    ax1.set_xticklabels([d.strftime('%d-%m') for d in daily_counts.index], rotation=45, ha="right")
    
    ax2 = ax1.twinx()
    ax2.plot(range(len(daily_satisfaction)), daily_satisfaction.values, marker='o', color='purple', linestyle='-', label='Índice de Satisfacción')
    for i, txt in enumerate(daily_satisfaction.values):
        ax2.annotate(f"{txt:.1f}", (i, daily_satisfaction.values[i]), textcoords="offset points", xytext=(0,10), ha='center', color='purple', weight='bold')
    
    ax2.set_ylabel('Índice de Satisfacción (-100 a 100)', fontsize=12, color='purple')
    ax2.tick_params(axis='y', labelcolor='purple')
    y_min = min(-100, daily_satisfaction.min() - 10 if not daily_satisfaction.empty else 0)
    y_max = max(100, daily_satisfaction.max() + 10 if not daily_satisfaction.empty else 100)
    ax2.set_ylim(y_min, y_max)
    
    fig.tight_layout(rect=[0, 0, 0.9, 1]) # Ajustar para la leyenda
    buf = io.BytesIO()
    fig.savefig(buf, format='png', bbox_inches='tight')
    plt.close(fig) # MUY IMPORTANTE: Cerrar la figura para liberar memoria
    return base64.b64encode(buf.getvalue()).decode('utf-8')

def get_detailed_analysis(df_grupo):
    if df_grupo.empty: return None
    oportunidades = []
    mejoras = df_grupo[df_grupo['puntos_criticos'].notna() & (df_grupo['puntos_criticos'] != "Otros")]
    if not mejoras.empty:
        for tema, grupo in mejoras.groupby('puntos_criticos'):
            ejemplos = grupo['comentarios'].dropna().head(3).tolist()
            oportunidades.append({"tema": str(tema), "cantidad": int(len(grupo)), "ejemplos": ejemplos})

    destacados = []
    positivos = df_grupo[df_grupo['destacados'].notna() & (df_grupo['destacados'] != "Otros")]
    if not positivos.empty:
        for tema, grupo in positivos.groupby('destacados'):
            ejemplos = grupo['comentarios'].dropna().head(3).tolist()
            destacados.append({"tema": str(tema), "cantidad": int(len(grupo)), "ejemplos": ejemplos})

    return {
        "total_valoraciones": int(len(df_grupo)),
        "total_comentarios": int(df_grupo['comentarios'].notna().sum()),
        "satisfaccion": calcular_indice_satisfaccion(df_grupo),
        "oportunidades_mejora": sorted(oportunidades, key=lambda x: x['cantidad'], reverse=True),
        "puntos_destacados": sorted(destacados, key=lambda x: x['cantidad'], reverse=True),
    }

def generar_resumen_ia_simple(oportunidades, destacados):
    resumen = ""
    if oportunidades:
        top_oportunidades = sorted(oportunidades, key=lambda x: x['cantidad'], reverse=True)[:2]
        temas_mejora = " y ".join([f"**{op['tema']}** ({op['cantidad']} menciones)" for op in top_oportunidades])
        resumen += f"El análisis identifica oportunidades de mejora clave, principalmente en {temas_mejora}. "
    else:
        resumen += "No se detectaron tendencias negativas significativas en los comentarios, lo cual es un excelente indicador. "

    if destacados:
        top_destacados = sorted(destacados, key=lambda x: x['cantidad'], reverse=True)[:2]
        temas_positivos = " y ".join([f"**{d['tema']}** ({d['cantidad']} menciones)" for d in top_destacados])
        resumen += f"Por otro lado, los clientes valoran muy positivamente aspectos como {temas_positivos}."
    else:
        resumen += "No se encontraron temas positivos recurrentes en los comentarios."
    return resumen

# ==============================================================================
# SECCIÓN 2: FUNCIÓN PRINCIPAL ORQUESTADORA
# ==============================================================================

def procesar_datos(archivo_excel):
    try:
        df = pd.read_excel(archivo_excel, sheet_name=0)
    except Exception as e:
        raise ValueError(f"No se pudo leer el archivo Excel. Asegúrese de que es un archivo .xlsx válido. Error: {e}")

    # Limpieza de nombres de columna
    df.columns = [re.sub(r'\s+', '_', str(col).strip()).lower() for col in df.columns]
    
    # Verificación de columnas necesarias
    columnas_necesarias = ['fecha', 'comentarios', 'calificacion_descripcion', 'puntos_criticos', 'destacados', 'sala', 'sector']
    columnas_faltantes = [col for col in columnas_necesarias if col not in df.columns]
    if columnas_faltantes:
        raise ValueError(f"Faltan las siguientes columnas necesarias en el archivo Excel: {', '.join(columnas_faltantes)}")

    # --- LÓGICA DE CALIFICACIÓN CORREGIDA ---
    # 1. Aplicar IA a los comentarios. Devuelve 'Muy Positiva', 'Neutral', 'Muy Negativa' o None.
    df['calificacion_ia'] = df['comentarios'].apply(analizar_sentimiento_con_ia)

    # 2. Rellenar los valores nulos (donde no hubo comentario o falló la IA) con la calificación original.
    df['calificacion_ia'].fillna(df['calificacion_descripcion'], inplace=True)
    
    # 3. NO SE HACE EL REPLACE. Se conservan las 5 categorías para un análisis más preciso.
    #    Las categorías finales serán una mezcla de las de la IA y las originales.
    
    df['fecha'] = pd.to_datetime(df['fecha'], errors='coerce')
    df.dropna(subset=['fecha'], inplace=True) # Eliminar filas sin fecha válida
    df['sector_original'] = df['sector']
    df['es_vip'] = df['sala'].str.contains('VIP', case=False, na=False)
    
    def asignar_grupo(row):
        if row['es_vip']: return 'VIP'
        sector_lower = str(row['sector_original']).lower()
        if 'caja' in sector_lower: return 'Cajas'
        if 'atención' in sector_lower or 'atencion' in sector_lower: return 'Atención al Cliente'
        if 'rest' in sector_lower: return 'Restaurantes'
        if 'auto' in sector_lower: return 'Autoservicios'
        if 'baño' in sector_lower or 'bano' in sector_lower: return 'Baños'
        if 'traslado' in sector_lower: return 'Traslados'
        return 'Otros'
    df['grupo_sector'] = df.apply(asignar_grupo, axis=1)

    periodo = f"Del {df['fecha'].min().strftime('%d/%m/%Y')} al {df['fecha'].max().strftime('%d/%m/%Y')}"

    # Textos para nubes de palabras
    texto_negativo = " ".join(str(t) for t in df[df['calificacion_ia'].isin(['Negativa', 'Muy Negativa'])]['comentarios'] if pd.notna(t))
    texto_positivo = " ".join(str(t) for t in df[df['calificacion_ia'].isin(['Positiva', 'Muy Positiva'])]['comentarios'] if pd.notna(t))

    analisis_general = {
        "total_valoraciones": int(len(df)),
        "total_comentarios": int(df['comentarios'].notna().sum()),
        "satisfaccion_general": calcular_indice_satisfaccion(df),
        "grafico_diario_b64": generar_grafico_valoraciones_diarias(df),
        "nube_palabras_negativa_b64": generar_nube_palabras(texto_negativo, "#d62728"),
        "nube_palabras_positiva_b64": generar_nube_palabras(texto_positivo, "#2ca02c")
    }
    
    # Agrupación y análisis detallado
    resumen_grupos = []
    analisis_detallado = []
    orden_grupos = ['Baños', 'Atención al Cliente', 'Cajas', 'Restaurantes', 'Autoservicios', 'Traslados', 'VIP', 'Otros']
    todas_oportunidades = []
    todos_destacados = []

    for grupo_nombre in orden_grupos:
        df_grupo = df[df['grupo_sector'] == grupo_nombre]
        if not df_grupo.empty:
            resumen_grupos.append({
                "sector": grupo_nombre,
                "cantidad_valoraciones": len(df_grupo),
                "satisfaccion": calcular_indice_satisfaccion(df_grupo)
            })
            grupo_detallado = {"grupo_titulo": grupo_nombre, "detalles_sector": []}
            for sector_especifico, df_sector_esp in df_grupo.groupby('sector_original'):
                analisis = get_detailed_analysis(df_sector_esp)
                if analisis:
                    analisis['titulo'] = sector_especifico
                    grupo_detallado['detalles_sector'].append(analisis)
                    # Acumular para el resumen general
                    todas_oportunidades.extend(analisis.get('oportunidades_mejora', []))
                    todos_destacados.extend(analisis.get('puntos_destacados', []))
            
            grupo_detallado['detalles_sector'] = sorted(grupo_detallado['detalles_sector'], key=lambda x: x['total_valoraciones'], reverse=True)
            if grupo_detallado['detalles_sector']:
                analisis_detallado.append(grupo_detallado)
    
    # Agrupar temas duplicados de diferentes sectores para el resumen general
    oportunidades_agrupadas = defaultdict(lambda: {'cantidad': 0, 'ejemplos': []})
    for op in todas_oportunidades:
        oportunidades_agrupadas[op['tema']]['cantidad'] += op['cantidad']
        oportunidades_agrupadas[op['tema']]['ejemplos'].extend(op['ejemplos'])
    
    destacados_agrupados = defaultdict(lambda: {'cantidad': 0, 'ejemplos': []})
    for des in todos_destacados:
        destacados_agrupados[des['tema']]['cantidad'] += des['cantidad']
        destacados_agrupados[des['tema']]['ejemplos'].extend(des['ejemplos'])

    # Convertir de defaultdict a lista de diccionarios
    oportunidades_final = [{"tema": k, "cantidad": v['cantidad']} for k, v in oportunidades_agrupadas.items()]
    destacados_final = [{"tema": k, "cantidad": v['cantidad']} for k, v in destacados_agrupados.items()]

    resumen_ia = generar_resumen_ia_simple(oportunidades_final, destacados_final)
            
    return {
        "informe_periodo": periodo,
        "analisis_general": analisis_general,
        "resumen_por_grupos": sorted(resumen_grupos, key=lambda x: x['cantidad_valoraciones'], reverse=True),
        "analisis_ia_resumen": resumen_ia,
        "analisis_detallado_ordenado": analisis_detallado
    }
