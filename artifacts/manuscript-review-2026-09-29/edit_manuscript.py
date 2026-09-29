from pathlib import Path
import sys, json, csv, re, difflib, hashlib
from copy import deepcopy
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_COLOR_INDEX, WD_TAB_ALIGNMENT
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
sys.path.insert(0,'/tmp/sslope-review-plot-libs')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle
import numpy as np

ROOT=Path('/home/robertoa1/Datos/proyectos/sslope')
OUT=Path(__file__).parent
SOURCE=Path('/home/robertoa1/Descargas/Artículo - Prototipo semisintético FEM LSTM con corrección guiada por física para pronosticar desplazamientos en taludes.docx')
FIG=OUT/'figuras';FIG.mkdir(exist_ok=True)
d=Document(SOURCE); original=list(d.paragraphs); original_tables=list(d.tables)
changes=[]
def edit(i,new,reason):
    p=original[i];old=p.text
    if old==new:return
    p.clear()
    for op,a,b,c,e in difflib.SequenceMatcher(None,old,new,autojunk=False).get_opcodes():
        if op=='delete':continue
        r=p.add_run(new[c:e]);r.font.name='Times New Roman';r.font.size=Pt(12)
        if op!='equal':r.font.highlight_color=WD_COLOR_INDEX.YELLOW
    changes.append({'paragraph':i,'section':next((original[j].text for j in range(i,-1,-1) if original[j].style.name.startswith('Heading')), 'Portada y resúmenes'),'before':old,'after':new,'reason':reason})
def add_after(anchor,text,style=None,highlight=True):
    p=d.add_paragraph(text,style)
    anchor._p.addnext(p._p)
    if highlight:
        for r in p.runs:r.font.highlight_color=WD_COLOR_INDEX.YELLOW
    changes.append({'paragraph':'nuevo','section':text[:75],'before':'No existía','after':text,'reason':'Completar definición, método, evidencia o declaración requerida sin alterar resultados originales.'})
    return p
def readcsv(name):
    with (ROOT/name).open() as f:return list(csv.DictReader(f))
def jread(name):return json.loads((ROOT/name).read_text())

# Cambios locales, sin sustituir números de resultados, intervalos o valores p.
edit(7,original[7].text.replace('el incremento de desplazamiento inducido por lluvia','el desplazamiento máximo inducido por lluvia respecto del estado inicial').replace('5000 remuestreos por bloques de fecha','5000 remuestreos por conglomerados de fecha'),'Distinguir magnitud inducida respecto del estado inicial del incremento temporal aprendido y nombrar correctamente el remuestreo.')
edit(10,original[10].text.replace('rainfall-induced displacement-increment forecasting','forecasting maximum rainfall-induced displacement relative to the initial state').replace('date-block resamples','rainfall-date cluster resamples'),'Alinear el resumen inglés con el objetivo y el estimador implementados.')
edit(13,'FEM: método de elementos finitos; FoS: factor de seguridad; IC: intervalo de confianza; IoT: internet de las cosas; LHS: muestreo por hipercubo latino; LSTM: red de memoria a corto y largo plazo; MAE: error absoluto medio; MLP: perceptrón multicapa; MSE: error cuadrático medio; PIELM: modelo de aprendizaje extremo informado por física; PINN: red neuronal informada por la física; RBF: función de base radial; RMSE: raíz del error cuadrático medio; RQ: pregunta de investigación.','Completar siglas y separar PIELM de RBF.')
edit(15,original[15].text.replace('el aprendizaje profundo mejora la eficiencia de la predicción del factor de estabilidad y contribuye a la seguridad durante el desarrollo del proyecto','el aprendizaje profundo puede facilitar la predicción del factor de estabilidad en el caso estudiado').replace('puede apoyar decisiones de alerta, evacuación, rediseño de bancos y control de producción','podría apoyar decisiones de alerta, evacuación, rediseño de bancos y control de producción, siempre que su desempeño y sus umbrales se validen para el sitio'),'Evitar extrapolar resultados de una publicación a seguridad operacional del prototipo.')
edit(16,'Los enfoques convencionales de análisis de estabilidad, incluidos los modelos de equilibrio límite y de elementos finitos (FEM), representan de forma explícita la geometría, la resistencia y las condiciones de frontera. Esta base física permite interpretar mecanismos de falla y evaluar escenarios de lluvia, excavación o cambios en las propiedades del material. Sin embargo, sus resultados dependen de parámetros inciertos y de actualizaciones que no siempre acompañan la velocidad del monitoreo en campo. Liu et al. (2022) contrastaron la evolución de la estabilidad de un gemelo digital de talud con una falla observada asociada a lluvia extrema. Este antecedente muestra la importancia de actualizar y contrastar el modelo con registros de desempeño y observaciones; TA-01 no dispone de ese contraste.','Parafrasear la cita literal y mantener explícita la diferencia entre antecedente observado y caso semisintético.')
edit(17,'El desarrollo de sensores geotécnicos, estaciones meteorológicas, sistemas IoT y fotogrametría ha ampliado la disponibilidad de series temporales para este propósito. No obstante, el uso exclusivo de aprendizaje automático puede producir predicciones difíciles de interpretar o físicamente inconsistentes, especialmente ante escenarios poco representados en los datos históricos. Pei et al. (2023) evaluaron métodos que incorporan conocimiento del dominio y documentaron ventajas predictivas en los conjuntos analizados. Ese resultado motiva examinar restricciones geotécnicas en el aprendizaje, pero no garantiza que cualquier corrector físico mejore cualquier predictor.','Parafrasear y evitar inferir superioridad general a partir de un antecedente.')
edit(18,'Los gemelos digitales vinculan una representación computacional del talud con observaciones y mecanismos de actualización. Piciullo et al. (2025) integraron monitoreo hidrológico, meteorología, modelado numérico y aprendizaje automático para emitir pronósticos móviles de estabilidad. Su experiencia ofrece un antecedente operacional distinto de TA-01. En el presente estudio se examina una configuración semisintética que conserva una respuesta mecánica FEM e incorpora dependencia temporal; no se mide su frecuencia de actualización ni su utilidad para alertas en mina.','Parafrasear y no transferir la validación operacional de otro estudio.')
edit(19,original[19].text.replace('Ninguno de esos antecedentes coincide con el alcance exacto de TA-01:','La comparación de la Tabla 1 delimita el alcance específico de TA-01, sin establecer prioridad absoluta:').replace('examinar su estabilidad entre fechas de lluvia','examinar su estabilidad entre fechas de lluvia'),'Delimitar novedad sin afirmar ausencia global de trabajos equivalentes.')
edit(28,original[28].text.replace('bajo fechas de lluvia disjuntas','con fechas de lluvia disjuntas'),'Mejorar precisión de la formulación sin cambiar la pregunta.')
edit(32,'Cada pregunta se vincula con métodos y resultados específicos: RQ1 con las Tablas 3 y 4; RQ2 con los intervalos pareados por fecha de la Figura 3; RQ3 con las perturbaciones de la Tabla 6 y la Figura 5; y RQ4 con la verificación del FEM y la aproximación espacial de la Tabla 5 y la Figura 2. Las conclusiones conservan estos límites de evaluación.','Hacer trazables RQ, tablas, figuras y conclusiones tras ordenar la numeración.')
edit(35,original[35].text.replace('particiones sin fuga entre ventanas de un mismo evento','particiones sin compartir fechas ni escenarios entre conjuntos'),'Acotar la afirmación de ausencia de fuga al control comprobado.')
edit(38,'Nota. LHS: muestreo por hipercubo latino; FEM: elementos finitos; LSTM: memoria a corto y largo plazo. Esquema del experimento semisintético, no de un sistema de alerta de campo.','Definir abreviaturas y explicitar el carácter esquemático de la figura.')
edit(43,original[43].text.replace('El objetivo de pronóstico fue el incremento del desplazamiento máximo inducido por lluvia, expresado en milímetros. No debe confundirse este incremento, de magnitud muy pequeña en TA-01, con el desplazamiento total de un talud real.','El valor evaluado fue el desplazamiento máximo inducido por lluvia respecto del estado inicial sin lluvia, expresado en milímetros y almacenado como rainfall_induced_max_displacement_mm. La red aprende su cambio entre la hora de origen y la hora objetivo; el pronóstico reconstruye el valor en la hora objetivo. No debe confundirse esta magnitud con el desplazamiento total de un talud real.'),'Precisar la diferencia entre etiqueta evaluada y cambio temporal aprendido en el código.')
edit(46,original[46].text+' K es la matriz global de rigidez y pₜ representa la presión de poros.','Definir símbolos de la primera ecuación.')
edit(48,original[48].text+' En las expresiones siguientes, y denota el valor objetivo, h el horizonte, x la historia de entradas, r la lluvia acumulada durante el horizonte, z las entradas del corrector, s el índice de seguridad y ψ y φ los parámetros entrenados. Las ecuaciones de pronóstico son esquemáticas: la normalización y la restricción final deben explicitarse antes del envío [VERIFICAR ecuaciones 2 y 3].','Definir notación y señalar, sin sustituirlas unilateralmente, las ecuaciones que no coinciden completamente con la implementación.')
edit(54,original[54].text.replace('Adam.','Adam (Kingma & Ba, 2015).')+' La arquitectura LSTM sigue el principio de memoria recurrente de Hochreiter y Schmidhuber (1997). Ridge, LSTM e híbrido restringen la salida final para que no sea menor que el valor actual. Esa restricción compartida también debe considerarse al interpretar el aporte del corrector.','Documentar fuentes metodológicas y la restricción común, no exclusiva del híbrido.')
edit(55,original[55].text+' La monotonía se refiere a las entradas directas del corrector manteniendo fija la salida base de la LSTM; no prueba monotonía global del híbrido cuando cambian conjuntamente todas las variables. Esta distinción separa restricciones agregadas de las PINN de ecuaciones de campo (Raissi et al., 2019; Karniadakis et al., 2021).','Acotar la garantía matemática del corrector y añadir referencias fundacionales verificadas.')
edit(57,original[57].text.replace('Tabla 4','Tabla 2'),'Numerar tablas por orden de aparición.')
edit(58,original[58].text.replace('Tabla 4','Tabla 2'),'Numerar tablas por orden de aparición.')
edit(61,original[61].text+' La partición no cronológica reserva las fechas de mayor lluvia para prueba y validación y usa una asignación balanceada por categorías del índice de seguridad simulado; no representa un muestreo aleatorio simple de fechas futuras.','Describir la selección de eventos extremos y el balanceamiento existentes en temporal-baseline.js.')
edit(62,original[62].text.replace('por bloques de fecha de lluvia','por conglomerados de fecha de lluvia').replace('se aplicó Holm a valores p exploratorios','se describe la aplicación de Holm (1979) a valores p exploratorios [VERIFICAR archivo y script de origen]').replace('Agrupar por fecha evita tratar las ventanas de un mismo evento como independientes.','Agrupar por fecha conserva la dependencia de las ventanas de un mismo evento (Field & Welsh, 2007), pero presupone que los conglomerados son suficientemente independientes entre fechas. No es un bootstrap de bloques de días consecutivos.'),'Precisar remuestreo e indicar la falta de trazabilidad del cálculo de valores p, sin cambiarlos.')
edit(65,original[65].text+' La coincidencia de las huellas permite comprobar la integridad de los artefactos archivados; no demuestra por sí sola que un entrenamiento nuevo produzca pesos idénticos.','Distinguir integridad de archivos y réplica exacta del entrenamiento.')
edit(70,original[70].text.replace('Tabla 2','Tabla 3').replace('incremento simulado de desplazamiento inducido por lluvia','desplazamiento máximo simulado inducido por lluvia respecto del estado inicial'),'Actualizar referencias cruzadas de tablas.')
edit(71,original[71].text.replace('Tabla 2','Tabla 3'),'Actualizar numeración por orden de aparición.')
edit(74,original[74].text.replace('Tabla 3','Tabla 4'),'Actualizar numeración por orden de aparición.')
edit(76,original[76].text.replace('Tabla 3','Tabla 4').replace('respectivamente; ninguno alcanzó 0,05.','respectivamente [VERIFICAR cálculo reproducible]; ninguno alcanzó 0,05.'),'Conservar todos los valores p, marcando el origen no localizado.')
edit(77,original[77].text.replace('unidades de remuestreo y permutación','unidades de remuestreo y de la permutación descrita [VERIFICAR]'),'Separar el bootstrap trazable de la permutación sin artefacto localizado.')
edit(81,original[81].text+' Los sensores empleados en esa aproximación también son sintéticos; no constituyen instrumentación de TA-01.','Explicitar el carácter sintético de la supervisión espacial.')
edit(87,original[87].text.replace('No se registraron medidas comparables de tiempo de entrenamiento, inferencia, consumo energético o latencia de extremo a extremo.','No se registró un benchmark comparable de tiempo de entrenamiento, inferencia, consumo energético o latencia de extremo a extremo. Algunos artefactos sí contienen medidas parciales de inferencia, insuficientes para sustentar eficiencia operacional.'),'Reconocer la latencia parcial almacenada sin convertirla en validación de tiempo real.')
edit(88,original[88].text.replace('objetivo original de M-1','validación de un talud real').replace('el validación','la validación'),'Eliminar identificador interno no definido.')
edit(90,original[90].text+' La lluvia futura conocida constituye una condición idealizada, no una entrada disponible sin error en campo. Además, la sustitución de variables por medias puede crear combinaciones fuera de la distribución conjunta del generador.','Añadir amenazas de información futura idealizada y enmascaramiento fuera de distribución.')
edit(91,original[91].text.replace('un incremento de desplazamiento','el desplazamiento máximo inducido por lluvia respecto del estado inicial'),'Mantener consistente la definición del observable en las amenazas de constructo.')
edit(93,original[93].text.replace('Se corrigieron cuatro valores p mediante Holm,','Se describe la corrección de cuatro valores p mediante Holm [VERIFICAR trazabilidad],')+' La precisión de almacenamiento del FEM y la variación entre semillas de entrenamiento no se evaluaron como factores de sensibilidad.','No ratificar un cálculo no trazable e incluir límites numéricos y de repetición.')
edit(98,original[98].text.replace('los cuatro valores p ajustados fueron mayores que 0,05.','los cuatro valores p ajustados reportados fueron mayores que 0,05 [VERIFICAR].'),'Mantener cifras y conclusión prudente sin dar por verificada la inferencia.')
edit(99,original[99].text.replace('confirmó la implementación del FEM mediante pruebas internas','verificó aspectos de la implementación del FEM mediante pruebas internas'),'No convertir comprobaciones parciales en confirmación total.')
edit(103,original[103].text.replace('Por ese alcance no requirió revisión de un comité de ética.','La necesidad de revisión o exención ética debe confirmarse según la política institucional y de la revista [CONFIRMAR].'),'No declarar una exención institucional que no ha sido documentada.')
edit(106,original[106].text.replace('y apoyar el cálculo exploratorio de pruebas pareadas por fecha a partir de predicciones guardadas','y [CONFIRMAR POR LOS AUTORES: alcance de la asistencia en cálculos estadísticos]').replace('No generó los datos originales ni entrenó los modelos.','Los datos geotécnicos se generan mediante el simulador y los modelos se entrenan mediante los scripts documentados. El alcance de la asistencia de IA en el desarrollo de código y en la ejecución de esos procesos debe declararse expresamente [CONFIRMAR POR LOS AUTORES].'),'Evitar una negación no sustentada sobre el uso de IA en el desarrollo y entrenamiento.')

# Incorporaciones metodológicas respaldadas por scripts existentes.
add_after(original[55],'Los escaladores y la normalización del cambio objetivo se estimaron exclusivamente con entrenamiento. Ridge seleccionó su regularización en validación; las redes usaron detención temprana con los criterios registrados en sus artefactos. No se documentó una búsqueda sistemática comparable de arquitecturas ni repeticiones independientes por semilla. El corrector se ajustó sobre la LSTM ya entrenada y sus predicciones en entrenamiento, sin predicciones fuera de muestra para esa segunda etapa.')
add_after(original[62],'Los intervalos predictivos del híbrido se construyeron con un cuantil del error absoluto de validación. Ese mismo conjunto participó en la selección del modelo y la detención temprana. Por ello se presentan como intervalos empíricos con diagnóstico retrospectivo de cobertura, no como una garantía conformal independiente. La Figura 4 contrasta cobertura global y cobertura bajo lluvia ≥5 mm/día; el número de fechas de esta última categoría es reducido.')
add_after(original[64],'El comando de generación transcrito no fija la malla de los artefactos citados: el script usa otra malla por defecto [VERIFICAR reproducción]. La receta completa debe declarar explícitamente malla, prefijos de salida, horizontes y pesos de referencia antes de ejecutar de nuevo el experimento.')
add_after(original[87],'La escala numérica requiere cautela adicional. El posprocesamiento FEM guarda las magnitudes nodales con un paso de redondeo de 10⁻⁵ mm (10⁻⁸ m), anterior a la construcción de las ventanas. Un MAE promedio inferior a ese paso es matemáticamente posible, pero no acredita resolución física ni precisión instrumental. Las pequeñas diferencias de error deben contrastarse con la sensibilidad al almacenamiento y a la tolerancia del solver antes de atribuirles relevancia geotécnica.')
add_after(original[83],'La Figura 6 presenta las variantes con entradas hidrológicas o mecánicas sustituidas por sus medias de entrenamiento. Son ensayos de enmascaramiento en inferencia, sin reentrenamiento: no equivalen a quitar esas variables de una arquitectura entrenada de nuevo. Tampoco aíslan el aporte causal de cada término de la pérdida del corrector; esa ablación permanece pendiente.')
add_after(original[105],'Contribuciones de autoría según CRediT. Roberto Enrique Quezada-Rodríguez: [CONFIRMAR ROLES]. Melanie Celeste Tello Fuentes: [CONFIRMAR ROLES]. La asignación debe describir contribuciones efectivas y ser aprobada por ambos autores; no se infiere a partir del orden de firma.')

# Referencias: no sustituir cifras de publicaciones discrepantes sin confirmación.
refaudit=json.loads((OUT/'references-audit.json').read_text())
fallback={110:'https://www.scielo.cl/scielo.php?pid=S0718-07642024000300001&script=sci_arttext',112:'https://revistasinvestigacion.unmsm.edu.pe/index.php/iigeo/article/view/24403',117:'https://www.scielo.sa.cr/scielo.php?pid=S0256-70242022000100076&script=sci_arttext',120:'https://reciamuc.com/index.php/RECIAMUC/article/view/1701',123:'https://www.mdpi.com/2076-3417/16/10/4932',126:'https://polodelconocimiento.com/ojs/index.php/es/article/view/6761/0',134:'https://revistas.ufps.edu.co/index.php/ingenio/article/view/3364',136:'https://revistas.utea.edu.pe/index.php/hyw/article/view/45',137:'https://www.sciencedirect.com/science/article/pii/S1364815224002895',139:'https://archivo.revistas.ucr.ac.cr/index.php/vial/citationstylelanguage/get/apa?publicationId=67606&submissionId=54752',146:'https://www.nature.com/articles/s41598-024-81872-3',147:'https://revistasinvestigacion.unmsm.edu.pe/index.php/iigeo/article/view/25004'}
for r in refaudit:
    if r['index'] in fallback:r['verification_source']=fallback[r['index']];r['verification_level']='Publicación o ficha editorial localizada; no comprobación íntegra del texto'
    elif r['status']=='registered':r['verification_source']='https://doi.org/'+r['doi'];r['verification_level']='DOI registrado y título contrastado; no comprobación íntegra del texto'
    else:r['verification_level']='[VERIFICAR]'
    if r['index']==113:edit(113,original[113].text+' [VERIFICAR en fuente editorial]','No se obtuvo confirmación primaria suficiente de la referencia.')
    if r['index']==139:edit(139,original[139].text+' [VERIFICAR paginación]','La ficha editorial y SciELO presentan paginaciones distintas; se conservan los números originales.')
    if r['index']==126:edit(126,original[126].text+' [VERIFICAR orden de autoría]','El orden del manuscrito difiere de la ficha editorial; no se cambia sin comprobación adicional.')
(OUT/'references-audit.json').write_text(json.dumps(refaudit,ensure_ascii=False,indent=2))
newrefs=[
'Field, C. A., & Welsh, A. H. (2007). Bootstrapping clustered data. Journal of the Royal Statistical Society: Series B (Statistical Methodology), 69(3), 369–390. https://doi.org/10.1111/j.1467-9868.2007.00593.x',
'Hochreiter, S., & Schmidhuber, J. (1997). Long short-term memory. Neural Computation, 9(8), 1735–1780. https://doi.org/10.1162/neco.1997.9.8.1735',
'Holm, S. (1979). A simple sequentially rejective multiple test procedure. Scandinavian Journal of Statistics, 6(2), 65–70. https://www.jstor.org/stable/4615733',
'Karniadakis, G. E., Kevrekidis, I. G., Lu, L., Perdikaris, P., Wang, S., & Yang, L. (2021). Physics-informed machine learning. Nature Reviews Physics, 3, 422–440. https://doi.org/10.1038/s42254-021-00314-5',
'Kingma, D. P., & Ba, J. (2015). Adam: A method for stochastic optimization. International Conference on Learning Representations. https://arxiv.org/abs/1412.6980',
'Raissi, M., Perdikaris, P., & Karniadakis, G. E. (2019). Physics-informed neural networks: A deep learning framework for solving forward and inverse problems involving nonlinear partial differential equations. Journal of Computational Physics, 378, 686–707. https://doi.org/10.1016/j.jcp.2018.10.045']
for text in newrefs:
    p=d.add_paragraph(text)
    for r in p.runs:r.font.highlight_color=WD_COLOR_INDEX.YELLOW
    anchor=next((p0 for p0 in original[109:150] if p0.text.casefold()>text.casefold()),original[150])
    anchor._p.addprevious(p._p)
    changes.append({'paragraph':'nuevo','section':'Referencias','before':'No existía','after':text,'reason':'Respaldar un método ya usado; referencia real verificada.'})
edit(151,original[151].text+' Las citas literales de la Tabla A2 requieren cotejo de texto completo y localizador exacto [VERIFICAR]; la confirmación de un DOI no autentica una cita literal.','Evitar presentar como cotejados cuarenta fragmentos no verificados íntegramente.')

# Figuras independientes, sin simulaciones ni métricas nuevas.
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.titlesize':11,'axes.labelsize':10,'axes.spines.top':False,'axes.spines.right':False,'figure.facecolor':'white','savefig.facecolor':'white'})
BLUE='#0072B2';ORANGE='#D55E00';GRAY='#555555'
sources={}
def save(fig,n,files):
    fig.savefig(FIG/f'Figura_{n}.png',dpi=400,bbox_inches='tight',pad_inches=.15)
    fig.savefig(FIG/f'Figura_{n}.svg',bbox_inches='tight',pad_inches=.15)
    plt.close(fig);sources[f'Figura_{n}']={'classification':'ESQUEMA' if n==1 else 'RESULTADOS_SEMISINTETICOS_ARCHIVADOS','source_files':files,'sha256':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in files}}

f,ax=plt.subplots(figsize=(6.5,3.0));ax.axis('off');ax.set_xlim(0,3);ax.set_ylim(0,2.5)
labels=[('Lluvia externa','NASA POWER diario'),('Escenarios supuestos','Geometría y parámetros LHS'),('FEM 2D','24 estados cuasiestáticos'),('Ventanas temporales','Historia 6 h; horizonte 1/6 h'),('LSTM y corrector','Corrección residual monótona'),('Evaluación','Fechas disjuntas; 2024/2025')]
positions=[(.04,1.55),(1.05,1.55),(2.06,1.55),(2.06,.40),(1.05,.40),(.04,.40)]
for (title,body),(x,y) in zip(labels,positions):
 body=body.replace('; ',chr(10)).replace('Geometría y parámetros LHS','Geometría y parámetros'+chr(10)+'LHS').replace('Corrección residual monótona','Corrección residual'+chr(10)+'monótona')
 ax.add_patch(Rectangle((x,y),.90,.63,fill=False,edgecolor=GRAY,lw=1.1));ax.text(x+.45,y+.42,title,ha='center',va='center',fontsize=9,fontweight='bold');ax.text(x+.45,y+.16,body,ha='center',va='center',fontsize=7.7,wrap=True)
for (x,y),(xx,yy) in zip(positions,positions[1:]):
 if y==yy:ax.annotate('',xy=(xx if xx>x else xx+.9,yy+.31),xytext=(x+.9 if xx>x else x,y+.31),arrowprops={'arrowstyle':'->','color':GRAY})
 else:ax.annotate('',xy=(xx+.45,yy+.63),xytext=(x+.45,y),arrowprops={'arrowstyle':'->','color':GRAY})
ax.text(1.5,.06,'Esquema del caso semisintético TA-01. No representa monitoreo de campo.',ha='center',fontsize=8)
save(f,1,['scripts/generate-fem-dataset.js','scripts/train-lstm.py','scripts/train-physics-guided.py','scripts/generate-research-summary.js'])

mesh=readcsv('data/validation/ta01-fem-mesh-summary.csv')
f,axs=plt.subplots(1,2,figsize=(6.5,2.7),layout='constrained');x=[int(r['node_count']) for r in mesh]
axs[0].plot(x,[float(r['maximum_rainfall_displacement_mm']) for r in mesh],'o-',color=BLUE);axs[0].set_ylabel('Máximo inducido por lluvia (mm)');axs[0].set_xlabel('Nodos de la malla');axs[0].set_title('a) Magnitud calculada');
axs[1].plot(x,[float(r['displacement_difference_against_48x32_percent']) for r in mesh],'s-',color=ORANGE);axs[1].set_ylabel('Diferencia frente a 48 × 32 (%)');axs[1].set_xlabel('Nodos de la malla');axs[1].set_title('b) Referencia interna');
for ax in axs:ax.grid(alpha=.2);ax.tick_params(labelsize=8)
save(f,2,['data/validation/ta01-fem-mesh-summary.csv'])

boot=jread('data/validation/ta01-rolling-origin-bootstrap.json')['comparisons']
f,axs=plt.subplots(1,2,figsize=(6.5,2.7),layout='constrained')
for ax,h in zip(axs,[1,6]):
 rows=[r for r in boot if r['horizonHours']==h];scale=1e-7 if h==1 else 1e-6
 for yi,r in enumerate(rows):
  lo,hi=r['confidenceInterval95Mm'];point=r['observedDifferenceMm'];ax.errorbar(point/scale,yi,xerr=[[((point-lo)/scale)],[((hi-point)/scale)]],fmt='o',color=BLUE if r['testYear']==2024 else ORANGE,capsize=4)
 ax.axvline(0,color=GRAY,ls='--',lw=1);ax.set_yticks([0,1],['2024 (82 fechas)','2025 (76 fechas)']);ax.set_xlabel(f'Δ MAE (× {"10⁻⁷" if h==1 else "10⁻⁶"} mm)');ax.set_title(f'{h} h: Δ > 0 favorece al híbrido');ax.grid(axis='x',alpha=.2);ax.tick_params(labelsize=8)
save(f,3,['data/validation/ta01-rolling-origin-bootstrap.json'])

cov=readcsv('data/validation/ta01-rolling-interval-coverage.csv')
f,ax=plt.subplots(figsize=(6.5,2.8),layout='constrained');keys=[(2024,1),(2024,6),(2025,1),(2025,6)];x=np.arange(4)
for off,segment,label,color,hatch in [(-.17,'ALL','Todas las ventanas',BLUE,''),(.17,'RAIN_HIGH_GE_5','Lluvia ≥5 mm/día',ORANGE,'//')]:
 values=[100*float(next(r for r in cov if int(r['test_year'])==y and int(r['horizon_hours'])==h and r['segment']==segment)['empirical_coverage']) for y,h in keys]
 ax.bar(x+off,values,width=.33,color=color,hatch=hatch,label=label)
ax.axhline(95,color=GRAY,ls='--',label='Nivel nominal 95 %');ax.set_xticks(x,[f'{y} · {h} h' for y,h in keys]);ax.set_ylabel('Cobertura empírica (%)');ax.set_ylim(0,113);ax.legend(fontsize=8,loc='upper left',ncol=2);ax.grid(axis='y',alpha=.2)
save(f,4,['data/validation/ta01-rolling-interval-coverage.csv'])

rob=readcsv('data/validation/ta01-robustness-summary.csv');conditions=['CLEAN','NOISE_1PCT_STD','NOISE_5PCT_STD','MISSING_10PCT','MISSING_30PCT'];labels=['Limpio','Ruido 1 %','Ruido 5 %','Faltantes 10 %','Faltantes 30 %']
f,axs=plt.subplots(1,2,figsize=(6.5,2.9),layout='constrained')
for ax,h in zip(axs,[1,6]):
 for model,c,marker in [('LSTM',BLUE,'o'),('HYBRID',ORANGE,'s')]:
  vals=[float(next(r for r in rob if int(r['horizon_hours'])==h and r['condition']==cond and r['model']==model)['mae_increase_percent']) for cond in conditions]
  ax.plot(range(5),vals,marker+'-',color=c,label='Híbrido' if model=='HYBRID' else model)
 ax.set_xticks(range(5),labels,rotation=40,ha='right',fontsize=7);ax.set_ylabel('Aumento del MAE frente a limpio (%)');ax.set_title(f'{h} h');ax.grid(alpha=.2);ax.legend(fontsize=8)
save(f,5,['data/validation/ta01-robustness-summary.csv'])

abl=readcsv('data/validation/ta01-ablation-summary.csv');variants=['LSTM','HYBRID_NO_HYDROLOGY','HYBRID_NO_FEM','HYBRID_FULL'];labs=['LSTM','Máscara\nhidrológica','Máscara\nmecánica','Híbrido\ncompleto']
f,axs=plt.subplots(1,2,figsize=(6.5,2.8),layout='constrained')
for ax,h in zip(axs,[1,6]):
 scale=1e-5 if h==1 else 1e-4
 vals=[float(next(r for r in abl if int(r['horizon_hours'])==h and r['variant_id']==v)['mae_mm'])/scale for v in variants]
 ax.bar(range(4),vals,color=[BLUE,'#888888','#BBBBBB',ORANGE],edgecolor=GRAY);ax.set_xticks(range(4),labs,fontsize=7);ax.set_ylabel(f'MAE (× {"10⁻⁵" if h==1 else "10⁻⁴"} mm)');ax.set_title(f'{h} h · sin reentrenamiento');ax.grid(axis='y',alpha=.2)
save(f,6,['data/validation/ta01-ablation-summary.csv'])
(OUT/'figure-provenance.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2))

# Sustituir el esquema oscuro por su equivalente legible, conservando las ecuaciones como imágenes.
original[37].clear();original[37].add_run().add_picture(str(FIG/'Figura_1.png'),width=Inches(6.15));original[37].alignment=WD_ALIGN_PARAGRAPH.CENTER
for n,idx in enumerate([47,49,50,51],1):
    p=original[idx];p.clear();p.paragraph_format.first_line_indent=Inches(0);p.paragraph_format.left_indent=Inches(0);p.paragraph_format.right_indent=Inches(0);p.paragraph_format.tab_stops.clear_all();p.paragraph_format.tab_stops.add_tab_stop(Inches(2.95),WD_TAB_ALIGNMENT.CENTER);p.paragraph_format.tab_stops.add_tab_stop(Inches(6.15),WD_TAB_ALIGNMENT.RIGHT);p.add_run('\t');p.add_run().add_picture(str(OUT/f'image{n+1}.png'),width=Inches(4.3));p.add_run(f'\t({n})');p.alignment=WD_ALIGN_PARAGRAPH.LEFT

caps={2:('Sensibilidad del desplazamiento inducido a la discretización FEM','FEM mesh sensitivity of rainfall-induced displacement','Número de nodos, desplazamiento máximo y diferencia respecto de la malla 48 × 32. Referencia interna, no convergencia demostrada.'),3:('Diferencia pareada de MAE entre LSTM e híbrido','Paired MAE difference between LSTM and the hybrid','Puntos: Δ = MAE(LSTM) − MAE(híbrido); barras: IC percentiles del 95 % por conglomerados de fecha. Las dos escalas del eje horizontal son distintas. No se representan valores p.'),4:('Cobertura retrospectiva de los intervalos del híbrido','Retrospective coverage of hybrid prediction intervals','Todas las ventanas frente a lluvia ≥5 mm/día. La línea discontinua indica el nivel nominal; la categoría de lluvia alta contiene dos fechas en 2024 y tres en 2025. Ventanas correlacionadas, no ensayos independientes.'),5:('Sensibilidad predictiva a ruido y faltantes aleatorios','Predictive sensitivity to noise and random missing inputs','Ruido relativo a la desviación de entrenamiento y faltantes imputados con medias de entrenamiento. Cada punto compara la condición perturbada con el caso limpio del mismo modelo. Sin reentrenamiento.'),6:('Enmascaramiento de entradas hidrológicas y mecánicas','Masking hydrological and mechanical inputs','Entradas sustituidas por medias de entrenamiento. MAE en las mismas ventanas del conjunto no cronológico de prueba. Las variantes no son modelos reentrenados ni ablaciones de términos individuales de la pérdida.')}
def figure_after(anchor,n,mention):
    p=add_after(anchor,mention)
    q=add_after(p,f'Figura {n}\n{caps[n][0]}',highlight=False)
    q=add_after(q,f'Figure {n}. {caps[n][1]}.',highlight=False)
    image=add_after(q,'',highlight=False);image.add_run().add_picture(str(FIG/f'Figura_{n}.png'),width=Inches(6.15));image.alignment=WD_ALIGN_PARAGRAPH.CENTER
    add_after(image,'Nota. '+caps[n][2]+' Caso semisintético. Fuente: '+', '.join(sources[f'Figura_{n}']['source_files'])+'.',highlight=False)
figure_after(original[68],2,'La Figura 2 muestra la respuesta al refinamiento de malla y su diferencia frente a la referencia interna.')
figure_after(original[77],3,'La Figura 3 presenta los tamaños de diferencia y sus intervalos; el signo positivo favorece al híbrido.')
figure_after(original[79],4,'La Figura 4 muestra que la cobertura global no asegura cobertura bajo lluvia más intensa.')
figure_after(original[83],5,'La Figura 5 resume la sensibilidad al ruido y a la pérdida aleatoria de entradas.')
# Situar la Figura 6 después de la explicación de enmascaramiento, antes de Discusión.
maskpara=next(p for p in d.paragraphs if p.text.startswith('La Figura 6 presenta las variantes'))
figure_after(maskpara,6,'La Figura 6 compara el error de las variantes con entradas enmascaradas, sin atribuirles un efecto causal aislado.')

def insert_table_after(anchor,title,headers,rows,note):
    cp=add_after(anchor,title,highlight=False)
    en='Table 5. Scope of numerical and spatial verification.' if title.startswith('Tabla 5') else 'Table 6. MAE with clean and perturbed inputs.'
    cp=add_after(cp,en,highlight=False)
    t=d.add_table(rows=1,cols=len(headers));t.alignment=WD_TABLE_ALIGNMENT.CENTER
    for c,txt in zip(t.rows[0].cells,headers):c.text=txt
    for row in rows:
        for c,txt in zip(t.add_row().cells,row):c.text=str(txt)
    cp._p.addnext(t._tbl)
    np_=d.add_paragraph(note);t._tbl.addnext(np_._p)
    return t
robrows=[]
for h in [1,6]:
 for cond,label in [('CLEAN','Limpio'),('NOISE_5PCT_STD','Ruido 5 %'),('MISSING_30PCT','Faltantes 30 %')]:
  l=next(r for r in rob if int(r['horizon_hours'])==h and r['condition']==cond and r['model']=='LSTM');hy=next(r for r in rob if int(r['horizon_hours'])==h and r['condition']==cond and r['model']=='HYBRID')
  robrows.append([f'{h} h',label,l['sample_count'],l['mae_mm'].replace('.',','),hy['mae_mm'].replace('.',',')])
# Tabla 5 antes de Figura 5 para mantener orden y mencionar en texto.
t5=insert_table_after(original[83],'Tabla 6\nMAE con entradas limpias y perturbadas',['Horizonte','Condición','Ventanas','LSTM (mm)','Híbrido (mm)'],robrows,'Nota. Valores archivados sin recalcular ni modificar. Fuente: data/validation/ta01-robustness-summary.csv. Todas las respuestas objetivo son semisintéticas; no se reentrena bajo perturbación.')
edit(83,original[83].text+' La Tabla 6 conserva los errores absolutos de las condiciones principales.','Incluir evidencia numérica absoluta junto a los porcentajes relativos de degradación.')
fem=jread('data/validation/ta01-fem-mesh-sensitivity.json');sp=jread('data/validation/ta01-spatial-pinn-validation.json')
verification=[['Parche CST','Deformación','1,14 × 10⁻¹⁸','Campo afín; adimensional'],['Elasticidad global','Desplazamiento','1,62 × 10⁻¹¹ m','Solución analítica manufacturada'],['Biot uniforme','Desplazamiento','1,60 × 10⁻¹¹ m','Solución analítica manufacturada'],['Malla 30 × 20','Diferencia','2,13 %','Frente a referencia interna 48 × 32'],['PIELM/RBF TA-01','Error L2 relativo','12,57 %','354 nodos sin supervisión de desplazamiento'],['PIELM/RBF TA-01','Residuo relativo','14,39 %','Mismo operador FEM de referencia']]
edit(81,original[81].text+' La Tabla 5 distingue las comprobaciones analíticas de la concordancia con el operador compartido.','Agrupar verificaciones distintas sin confundirlas con validación externa.')
t6=insert_table_after(original[81],'Tabla 5\nAlcance de la verificación numérica y espacial',['Comprobación','Magnitud','Resultado','Alcance'],verification,'Nota. Valores ya informados en el manuscrito, contrastados con data/validation/ta01-fem-mesh-sensitivity.json y ta01-spatial-pinn-validation.json. No se mezclan con errores de pronóstico temporal.')

add_after(original[36],'Figure 1. Data flow and validation of the semisynthetic TA-01 prototype.',highlight=False)
for idx,text in [(24,'Table 1. Scope comparison with closely related studies.'),(58,'Table 2. Documented experimental configuration.'),(71,'Table 3. Mean absolute error in the rainfall-date-separated test.'),(74,'Table 4. LSTM and hybrid MAE in chronological tests.')]:
    add_after(original[idx],text,highlight=False)

# Capturas para exportación de seis tablas principales, no de los dos anexos.
main_tables=[original_tables[0],original_tables[1],original_tables[2],original_tables[3],t6,t5]
titles=['Alcance frente a antecedentes','Configuración experimental','MAE por fecha disjunta','MAE cronológico','Verificación numérica','Robustez predictiva']
tabdata=[]
for i,(table,title) in enumerate(zip(main_tables,titles),1):
 rows=[[c.text for c in r.cells] for r in table.rows]
 tabdata.append({'number':i,'title':title,'rows':rows,'source': ['Referencias citadas en Tabla 1','data/models/ta01-lstm-1h.json; data/models/ta01-physics-guided-1h.json','data/validation/ta01-model-comparison.csv','data/validation/ta01-rolling-origin-model-comparison.csv','data/validation/ta01-fem-mesh-sensitivity.json; data/validation/ta01-spatial-pinn-validation.json','data/validation/ta01-robustness-summary.csv'][i-1]})
(OUT/'tables-export.json').write_text(json.dumps(tabdata,ensure_ascii=False,indent=2))

# Corrección terminológica en tablas, sin modificar cifras.
for t in main_tables:
    for row in t.rows:
        for c in row.cells:
            if 'remuestreos por bloques de fecha' in c.text:
                old=c.text;c.text=old.replace('remuestreos por bloques de fecha','remuestreos por conglomerados de fecha')
                changes.append({'paragraph':'tabla','section':'Configuración experimental','before':old,'after':c.text,'reason':'Nombrar el remuestreo realmente implementado.'})
# Presentación uniforme, sin alterar el orden de secciones ni el original.
styles_by_name={st.name:st for st in d.styles}
for style in ['Normal','Title','Subtitle','Heading 1','Heading 2','Caption']:
    st=styles_by_name[style];st.font.name='Times New Roman';st.font.size=Pt(12);st.font.color.rgb=RGBColor(0,0,0)
    st.paragraph_format.line_spacing=2
styles_by_name['Title'].font.size=Pt(16);styles_by_name['Heading 1'].font.bold=True;styles_by_name['Heading 2'].font.bold=True
for p in d.paragraphs:
    if p.text:
        p.paragraph_format.line_spacing=2;p.paragraph_format.space_after=Pt(4);p.paragraph_format.widow_control=True
    if p.style.name.startswith('Heading') or p.text.startswith(('Figura ','Figure ','Tabla ','Table ')):
        p.paragraph_format.keep_with_next=True
    if p._p.xpath('.//w:drawing'):p.paragraph_format.keep_with_next=True
    for r in p.runs:r.font.name='Times New Roman';r.font.size=Pt(16 if p.style.name=='Title' else 12);r.font.color.rgb=RGBColor(0,0,0)
    if any(p.text.startswith(x) for x in ['Anchiraico','Arias-Valencia','Avellán','Blas Cano','Briceño','Bustillos','Caballero','Campos','Catari','Chilon','Cusme','Dahal','Dong','Du,','Field,','González','Guan,','Guevara','Hamzaban','Hochreiter','Holm,','Karniadakis','Kingma','Liu,','Lyu,','Montúfar','Nanda,','National','Oliva','Pei,','Peña','Piciullo','Ragam','Raissi','Sequeira','Tan,','Tian,','Úcar','Wang,','Yiğit','Yin,','Yuan','Zamora','Zhang,']):
        p.paragraph_format.left_indent=Inches(.3);p.paragraph_format.first_line_indent=Inches(-.3)
for table in d.tables:
    table.autofit=False
    nc=len(table.columns)
    for row in table.rows:
        trpr=row._tr.get_or_add_trPr()
        for old in trpr.findall(qn('w:trHeight')):trpr.remove(old)
        if trpr.find(qn('w:cantSplit')) is None:trpr.append(OxmlElement('w:cantSplit'))
        if row._tr is table.rows[0]._tr:
            h=OxmlElement('w:tblHeader');h.set(qn('w:val'),'true');trpr.append(h)
        for cell in row.cells:
            cell.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
            pr=cell._tc.get_or_add_tcPr(); borders=pr.find(qn('w:tcBorders'))
            if borders is not None:pr.remove(borders)
            borders=OxmlElement('w:tcBorders')
            for name in ['top','left','bottom','right']:
                edge=OxmlElement('w:'+name);edge.set(qn('w:val'),'single');edge.set(qn('w:sz'),'4');edge.set(qn('w:color'),'D9D9D9');borders.append(edge)
            pr.append(borders)
            for p in cell.paragraphs:
                p.paragraph_format.line_spacing=1.15;p.paragraph_format.space_after=Pt(4);p.paragraph_format.space_before=Pt(4)
                for r in p.runs:r.font.name='Times New Roman';r.font.size=Pt(10);r.font.color.rgb=RGBColor(0,0,0)
    for c in table.rows[0].cells:
        shade=OxmlElement('w:shd');shade.set(qn('w:fill'),'EAEAEA');c._tc.get_or_add_tcPr().append(shade)
        for p in c.paragraphs:
            for r in p.runs:r.bold=True
    # Evitar anchos heredados incompatibles con páginas verticales.
    if any(table._tbl is target._tbl for target in main_tables):
        total=6.45;weights=[1]*nc
        if table._tbl is original_tables[0]._tbl:weights=[1.1,1.2,1.25,1.1,1.4]
        if table._tbl is original_tables[1]._tbl:weights=[1.0,2.5,1.8]
        if table._tbl is t6._tbl:weights=[1.2,1.1,1.0,2.0]
        for col,w in zip(table.columns,weights):col.width=Inches(total*w/sum(weights))
        for row in table.rows:
            for cell,w in zip(row.cells,weights):cell.width=Inches(total*w/sum(weights))

# Cursivas APA en las seis referencias metodológicas añadidas, sin alterar texto.
for p in d.paragraphs:
    if p.text.startswith(('Field,','Hochreiter,','Holm,','Karniadakis,','Raissi,')):
        m=re.search(r'(?:Journal of the Royal Statistical Society: Series B \(Statistical Methodology\)|Neural Computation|Scandinavian Journal of Statistics|Nature Reviews Physics|Journal of Computational Physics), \d+',p.text)
        if m:
            txt=p.text;p.clear()
            for text,italic in [(txt[:m.start()],False),(m.group(),True),(txt[m.end():],False)]:
                r=p.add_run(text);r.italic=italic;r.font.name='Times New Roman';r.font.size=Pt(12);r.font.highlight_color=WD_COLOR_INDEX.YELLOW
    elif p.text.startswith('Kingma,'):
        txt=p.text;label='Adam: A method for stochastic optimization.';before,after=txt.split(label,1);p.clear()
        for text,italic in [(before,False),(label,True),(after,False)]:
            r=p.add_run(text);r.italic=italic;r.font.name='Times New Roman';r.font.size=Pt(12);r.font.highlight_color=WD_COLOR_INDEX.YELLOW

original[108].paragraph_format.page_break_before=True

# Comentarios verdaderos en Word para discrepancias que requieren decisión autoral.
sys.path.insert(0,'/home/robertoa1/.codex/plugins/cache/openai-primary-runtime/documents/26.909.12148/skills/documents/scripts')
from comments_add import add_comments
draft=OUT/'manuscrito-maquetado.docx';d.save(draft)
comments=[
 ('Universidad Nacional de Trujillo. Trujillo, Perú.','E01. Completar dirección postal y departamento de cada autor. Designar autor de correspondencia y aportar ORCID de Melanie. No se han inventado estos datos.'),
 ('Prototipo semisintético FEM LSTM','E02. Revista pendiente de confirmar: la solicitud nombra BGM, pero las normas transcritas son de ESRJ. BGM admite español; ESRJ exige inglés. Resolver antes de adaptar estilo final o anonimizar.'),
 ('sin establecer prioridad absoluta','A01. Incorporar comparación explícita con Du et al. (2026), Tian et al. (2026) y Dong et al. (2025), ya incluidos en el anexo. La prioridad metodológica no está demostrada mediante una búsqueda sistemática.'),
 ('precipitación diaria de reanálisis','A02. NASA POWER es precipitación de reanálisis, no una estación de mina. El punto geográfico de lluvia no convierte TA-01 en un talud medido en Cerro de Pasco.'),
 ('VERIFICAR ecuaciones 2 y 3','A03. En código el corrector opera sobre el incremento estandarizado; se multiplica por la desviación del objetivo y se reconstruye el valor, con max(valor actual, salida cruda). Las ecuaciones originales omiten escala y proyección. Se conservaron; ver fórmula propuesta en el informe.'),
 ('VERIFICAR archivo y script de origen','A04 CRÍTICA. No se localizó el script ni un CSV/JSON de la prueba de signo con 20 000 permutaciones o de Holm. El bootstrap sí está archivado. Se mantienen cifras p sin ratificarlas. Aportar scripts, semillas exactas, estadístico, regla bilateral y hashes.'),
 ('VERIFICAR cálculo reproducible','A04. Valores p originales conservados, no verificados. No sustituir ni interpretar como confirmados hasta aportar la evidencia reproducible.'),
 ('valores p ajustados reportados','A04. La conclusión no debe descansar en valores p aún no trazables. La inversión del orden y los IC que incluyen cero sí están respaldados por artefactos.'),
 ('el script usa otra malla por defecto','A05 CRÍTICA. El conjunto archivado usa 30 × 20; generate-fem-dataset.js usa 14 × 9 por defecto. El comando del artículo regeneraría otro conjunto y sobreescribiría salidas. Ver receta propuesta en el informe; no ejecutar sobre originales.'),
 ('paso de redondeo de 10⁻⁵ mm','A06. No confundir resolución de la etiqueta con MAE promedio. Un promedio menor al paso es posible; debe evaluarse sensibilidad al redondeo y solver sin inferir precisión física nanométrica.'),
 ('Ese mismo conjunto participó en la selección','A07. No existe partición independiente de calibración. No se acredita garantía conformal bajo selección ni bajo dependencia temporal.'),
 ('sin predicciones fuera de muestra','A08. El corrector se entrena sobre predicciones in-sample de la LSTM; no es fuga hacia test por sí misma, pero falta contraste fuera de muestra y ablación de igual capacidad sin restricciones.'),
 ('1,15 % mayor','A09. Porcentajes relativos calculados sobre MAE resumidos redondeados; la diferencia puntual bootstrap procede de predicciones guardadas. Son estimadores de distinta precisión numérica. Aclarar base sin modificar números unilateralmente.'),
 ('Contribuciones de autoría según CRediT','E03. Ambos autores deben confirmar roles reales, aprobación final, financiación y conflictos. No asignar tareas por orden de firma.'),
 ('CONFIRMAR POR LOS AUTORES','E04. Revisar la declaración de IA para incluir desarrollo de software y apoyo a ejecución cuando corresponda. La responsabilidad científica permanece en autores.'),
 ('material suplementario reúne','E05. Recomiendo separar este anexo del manuscrito de envío; A2 duplica citas y requiere cotejo de cuarenta literales. La edición conserva la estructura recibida.'),
 ('Tabla A2','E06. La verificación de DOI/título no valida las citas literales ni sus traducciones. Añadir página/sección para cada fuente o eliminar A2 en la versión de envío.'),
 ('VERIFICAR en fuente editorial','R01. Referencia no confirmada suficientemente en fuente primaria. No se considera inexistente: sigue pendiente.'),
 ('VERIFICAR paginación','R02. Página editorial: 1–14; SciELO: 93–107. Elegir versión citada y documentar la decisión, sin sustituir cifras automáticamente.'),
 ('VERIFICAR orden de autoría','R03. La ficha editorial presenta Gómez-Intriago como primera autora. Contrastar PDF y ficha antes de corregir orden.'),
 ('los pesos entrenados y los archivos de validación','A10. DOI o archivo inmutable de versión publicado pendiente. No se pudo confirmar acceso público del repositorio desde el visor web; verificar permisos desde una sesión anónima.'),
 ('las ecuaciones físicas','A11. El PIELM TA-01 usa el operador FEM compartido: no equivale a validación externa. Conservar esta distinción en título, discusión y figuras.')
]
# El último patrón no figura literalmente; se ancla al enunciado correspondiente.
comments[-1]=('la misma matriz de rigidez y carga',comments[-1][1])
add_comments(str(draft),str(OUT/'Articulo_TA01_revisado.docx'),comments,'Revisión científica',require_all=True)
(OUT/'changes.json').write_text(json.dumps(changes,ensure_ascii=False,indent=2))
print('OUTPUT',OUT/'Articulo_TA01_revisado.docx','EDITS',len(changes),'TABLES',len(d.tables),'FIGURES',6,'REFERENCES',47)







