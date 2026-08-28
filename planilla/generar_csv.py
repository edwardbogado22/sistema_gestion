import pandas as pd
import csv
import os

SRC = 'planilla/Docentes-2026-Abril v1.xlsx'
OUT = 'planilla/salida'
PERIODO = '2026'

os.makedirs(OUT, exist_ok=True)

df = pd.read_excel(SRC)
df.columns = ['N', 'Monto', 'Categoria', 'CI', 'Apellido', 'Nombre', 'Sede', 'Carrera', 'Curso', 'Seccion', 'Materia', 'Plan']

df['CI'] = df['CI'].astype(str).str.strip()
for col in ['Apellido', 'Nombre', 'Sede', 'Carrera', 'Curso', 'Seccion', 'Materia']:
    df[col] = df[col].astype(str).str.strip()

CURSO_MAP = {'PRIMER': 1, 'SEGUNDO': 2, 'TERCER': 3, 'CUARTO': 4, 'QUINTO': 5}
CARRERA_ABREV = {'ADMINISTRACIÓN': 'ADM', 'CONTABILIDAD': 'CON', 'ECONOMÍA': 'ECO'}


def normalizar_seccion(s):
    s = s.strip()
    if s.startswith('(') and s.endswith(')'):
        return s[1:-1]
    if 'NICA' in s.upper():
        return 'UNICA'
    return s


# ---------- sedes y carreras (referencia para carga manual) ----------
with open(f'{OUT}/referencia_sedes_carreras.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['tipo', 'nombre'])
    for sede in sorted(df['Sede'].unique()):
        w.writerow(['sede', sede])
    for carrera in sorted(df['Carrera'].unique()):
        w.writerow(['carrera', carrera])

# ---------- asignaturas ----------
asign = df[['Carrera', 'Materia', 'Curso']].drop_duplicates().sort_values(['Carrera', 'Curso', 'Materia'])
asign['curso_nivel'] = asign['Curso'].map(CURSO_MAP)

seq_counter = {}
codigos = []
for _, row in asign.iterrows():
    abrev = CARRERA_ABREV.get(row['Carrera'], row['Carrera'][:3].upper())
    key = (abrev, row['curso_nivel'])
    seq_counter[key] = seq_counter.get(key, 0) + 1
    codigos.append(f"{abrev}{row['curso_nivel']}-{seq_counter[key]:02d}")
asign['codigo'] = codigos

with open(f'{OUT}/asignaturas_plantilla.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['codigo', 'nombre', 'carrera', 'curso_nivel', 'horas_totales_programadas'])
    for _, row in asign.iterrows():
        w.writerow([row['codigo'], row['Materia'], row['Carrera'], row['curso_nivel'], ''])

# ---------- profesores ----------
prof = df[['CI', 'Nombre', 'Apellido']].drop_duplicates(subset=['CI']).sort_values('CI')
with open(f'{OUT}/profesores_plantilla.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['documento_identidad', 'nombres', 'apellidos', 'email', 'telefono'])
    for _, row in prof.iterrows():
        w.writerow([row['CI'], row['Nombre'], row['Apellido'], '', ''])

# ---------- catedras ----------
with open(f'{OUT}/catedras_plantilla.csv', 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['docente_documento', 'asignatura', 'carrera', 'sede', 'periodo', 'seccion_grupo'])
    for _, row in df.iterrows():
        w.writerow([row['CI'], row['Materia'], row['Carrera'], row['Sede'], PERIODO, normalizar_seccion(row['Seccion'])])

print('sedes:', df['Sede'].nunique())
print('carreras:', df['Carrera'].nunique())
print('asignaturas:', len(asign))
print('profesores:', len(prof))
print('catedras:', len(df))
