"""Encuesta a alumnos 2025 desde la exportación del sistema de la facultad.

Uso: python -I encuesta2025.py <fceuneed_evaluacion.csv> <salida.csv> [nombre_a_validar]
"""
import collections
import csv
import re
import sys

SRC, OUT = sys.argv[1], sys.argv[2]
VALIDAR = sys.argv[3].upper() if len(sys.argv) > 3 else None

# Preguntas del cuestionario 60 (2025) -> criterio del sistema, en el
# orden de la Resolución CSU 054/2021.
PREGUNTAS = {
    '299': 'ALU_DOMINIO_CONTENIDO',
    '300': 'ALU_RESPUESTA_PRECISION',
    '301': 'ALU_PROGRAMA_CLARO',
    '302': 'ALU_DESARROLLO_PROGRAMA',
    '303': 'ALU_METODOLOGIA',
    '304': 'ALU_USO_TIC',
    '305': 'ALU_EVALUACION_CONTENIDOS',
    '306': 'ALU_REVISION_CALIFICACIONES',
    '307': 'ALU_APERTURA_CONSULTAS',
    '308': 'ALU_TRATO_AMABLE',
}
CARRERAS = {'8': 'ECONOMÍA', '9': 'ADMINISTRACIÓN', '10': 'CONTABILIDAD'}

filas = list(csv.reader(open(SRC, encoding='latin-1', newline=''), delimiter=';'))

# El archivo trae varias tablas seguidas: se ubican por su encabezado.
def tabla(primera_col, segunda_col):
    inicios = [i for i, f in enumerate(filas) if len(f) > 1 and f[0] == primera_col and f[1] == segunda_col]
    for ini in inicios:
        enc = filas[ini]
        for f in filas[ini + 1:]:
            if f and f[0] and not f[0].lstrip('-').isdigit():
                break
            yield dict(zip(enc, f))

# --- respuestas 2025 (sin repetir la misma respuesta si el volcado la trae dos veces)
vistos = set()
niveles = collections.defaultdict(list)         # (doc, carrera_id, matter_id, criterio) -> [nivel]
alumnos = collections.defaultdict(set)          # (doc, carrera_id, matter_id) -> {alumno}
for r in tabla('id', 'questionary_id'):
    if r.get('year', '').strip() != '2025' or r.get('question_id') not in PREGUNTAS:
        continue
    if r['id'] in vistos:
        continue
    vistos.add(r['id'])
    try:
        nivel = int(r['answer'])
    except ValueError:
        continue
    if not 1 <= nivel <= 3:
        continue
    k = (r['teacher_doc'].strip(), r['carrera_id'].strip(), r['matter_id'].strip())
    niveles[k + (PREGUNTAS[r['question_id']],)].append(nivel)
    alumnos[k].add(r['user_doc'])

# --- asignaciones 2025: (doc, matter_id) -> materia, sede, sección
asign = {}
for r in tabla('id', 'rol_docume'):
    if r.get('ane_ano', '').strip() != '2025' or 'mi2_id' not in r:
        continue
    asign[(r['rol_docume'].strip(), r['mi2_id'].strip())] = r


def seccion(s):
    s = (s or '').strip().upper()
    m = re.match(r'SECCION\s*\((\w+)\)', s)
    if m:
        return m.group(1)
    return 'ÚNICA' if 'NICA' in s else s


def sede(nombre, sec):
    nombre = (nombre or '').strip()
    if 'ITAKYRY' in nombre.upper():
        return f'Filial Itakyry — Sección {sec}', sec
    return nombre, sec


salida, sin_asignacion = [], set()
for (doc, car, mat), alus in sorted(alumnos.items()):
    a = asign.get((doc, mat))
    if not a:
        sin_asignacion.add((doc, car, mat))
        continue
    sec = seccion(a['sec_descri'])
    sed, sec = sede(a['sed_descri'], sec)
    for crit in PREGUNTAS.values():
        ns = niveles.get((doc, car, mat, crit))
        if not ns:
            continue
        salida.append({
            'docente_documento': doc,
            'asignatura': a['mat_descri'].strip(),
            'carrera': CARRERAS.get(car, car),
            'sede': sed,
            'periodo': '2025',
            'seccion_grupo': sec,
            'criterio_codigo': crit,
            'calificacion': round(sum(ns) / len(ns), 4),
            'total_encuestados': len(alus),
            '_profesor': a['rol_apenom'].strip(),
        })

campos = ['docente_documento', 'asignatura', 'carrera', 'sede', 'periodo', 'seccion_grupo',
          'criterio_codigo', 'calificacion', 'total_encuestados']
with open(OUT, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=campos, extrasaction='ignore')
    w.writeheader()
    w.writerows(salida)

catedras = {(s['docente_documento'], s['asignatura'], s['sede'], s['seccion_grupo']) for s in salida}
print(f'respuestas 2025 usadas: {len(vistos)}')
print(f'cátedras con encuesta: {len(catedras)} | filas generadas: {len(salida)}')
print(f'combinaciones sin asignación 2025 (no se pueden ubicar): {len(sin_asignacion)}')
print('por sede:', collections.Counter(s for _, _, s, _ in catedras).most_common())

if VALIDAR:
    print(f'\n--- validación: {VALIDAR}')
    for s in salida:
        if VALIDAR in s['_profesor'].upper():
            obt = round((s['calificacion'] - 1) / 2 * 2, 2)
            print(f"{s['asignatura'][:38]:38} {s['sede'][:16]:16} {s['seccion_grupo']:6} "
                  f"{s['criterio_codigo']:28} nivel {s['calificacion']:.3f} -> {obt:.2f}%  (n={s['total_encuestados']})")
