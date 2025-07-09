import pandas as pd
from wordcloud import WordCloud
import matplotlib.pyplot as plt
import io
import base64

def generar_nube_palabras(textos):
    texto_completo = " ".join(str(t) for t in textos if pd.notnull(t))
    nube = WordCloud(width=800, height=400, background_color='white').generate(texto_completo)
    img = io.BytesIO()
    nube.to_image().save(img, format='PNG')
    return base64.b64encode(img.getvalue()).decode()

def procesar_datos(df):
    df['sector_grupo'] = df['sector'].apply(lambda x: 'VIP' if 'VIP' in str(x) else str(x).strip())
    calif_por_sector = df.groupby('sector_grupo')['calificacion'].mean().round(2).to_dict()
    horas = pd.to_datetime(df['hora'], errors='coerce').dt.hour
    reclamos_por_hora = horas.value_counts().sort_index().to_dict()
    nube_base64 = generar_nube_palabras(df['Comentarios'])
    criticos = df[df['puntos_criticos'].notnull() & (df['puntos_criticos'] != "Otros")]
    oportunidades = criticos['puntos_criticos'].value_counts().to_dict()
    return {
        "satisfaccion": calif_por_sector,
        "horas_conflictivas": reclamos_por_hora,
        "nube_palabras": nube_base64,
        "oportunidades": oportunidades,
        "total_comentarios": len(df),
    }
