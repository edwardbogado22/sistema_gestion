"""Importa a Supabase los dos registros de asistencia a eventos de 2025
(Claustro docente y Capacitaciones) ya corregidos en planilla/importa2025/.

Crea (o reutiliza) los eventos correspondientes en la tabla `evento` y
carga `evento_asistencia_registro` para cada CI que matchea con
`profesores.documento_identidad`. Las CI sin match se listan al final
y no se insertan.

Requiere SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno o en
.env.local (se lee automáticamente).
"""
import csv
import json
import os
import urllib.parse
import urllib.request

CARPETA = 'planilla/importa2025'


def cargar_env_local():
    ruta = '.env.local'
    if not os.path.exists(ruta):
        return
    with open(ruta, encoding='utf-8') as f:
        for linea in f:
            linea = linea.strip()
            if not linea or linea.startswith('#') or '=' not in linea:
                continue
            k, v = linea.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())


cargar_env_local()
URL = os.environ['VITE_SUPABASE_URL']
KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
HEADERS = {
    'apikey': KEY,
    'Authorization': f'Bearer {KEY}',
    'Content-Type': 'application/json',
}


def api(method, path, body=None, prefer=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    headers = dict(HEADERS)
    if prefer:
        headers['Prefer'] = prefer
    req = urllib.request.Request(URL + path, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def get_all(path):
    out, offset, step = [], 0, 1000
    while True:
        sep = '&' if '?' in path else '?'
        chunk = api('GET', f'{path}{sep}limit={step}&offset={offset}')
        out.extend(chunk)
        if len(chunk) < step:
            break
        offset += step
    return out


def normalizar_ci(ci):
    return str(ci).strip().lstrip('0')


def buscar_o_crear_evento(nombre, fecha, tipo):
    existentes = api('GET', f"/rest/v1/evento?nombre=eq.{urllib.parse.quote(nombre)}&fecha=eq.{fecha}")
    if existentes:
        return existentes[0]['id']
    creado = api('POST', '/rest/v1/evento', {'nombre': nombre, 'fecha': fecha, 'tipo': tipo}, prefer='return=representation')
    return creado[0]['id']


def cargar_asistencia(ruta, columna_nombre_evento, eventos_por_nombre, por_ci):
    with open(ruta, encoding='utf-8') as f:
        rows = list(csv.reader(f))[1:]

    sin_match = []
    registros = []
    for r in rows:
        ci = normalizar_ci(r[0])
        nombre_evento_csv = r[columna_nombre_evento]
        evento_id = eventos_por_nombre.get(nombre_evento_csv)
        if evento_id is None:
            continue
        profesor = por_ci.get(ci)
        if not profesor:
            sin_match.append((ci, r[1]))
            continue
        registros.append({'evento_id': evento_id, 'profesor_id': profesor['id']})

    if registros:
        api(
            'POST',
            '/rest/v1/evento_asistencia_registro?on_conflict=evento_id,profesor_id',
            registros,
            prefer='resolution=ignore-duplicates',
        )

    return len(registros), sin_match


if __name__ == '__main__':
    profes = get_all('/rest/v1/profesores?select=id,documento_identidad')
    por_ci = {}
    for p in profes:
        por_ci.setdefault(normalizar_ci(p['documento_identidad']), p)

    ev_claustro = buscar_o_crear_evento('CLAUSTRO DOCENTE', '2025-03-22', 'REUNION')
    ev_cap1 = buscar_o_crear_evento('PRIMERA CAPACITACIÓN DOCENTE', '2025-04-04', 'CAPACITACION_NO_EVALUADA')
    ev_cap2 = buscar_o_crear_evento('SEGUNDA CAPACITACIÓN DOCENTE', '2025-04-07', 'CAPACITACION_NO_EVALUADA')

    mapa_claustro = {'CLAUSTRO DOCENTE 22/03/2025': ev_claustro}
    mapa_capacitaciones = {
        'PRIEMERA CAPACITACIÓN DOCENTE 04/04/2025': ev_cap1,
        'SEGUNDA CAPACITACIÓN DOCENTE 07/04/2025': ev_cap2,
    }

    n1, faltan1 = cargar_asistencia(
        os.path.join(CARPETA, 'ASISTEMCIA_CLAUTRO_2025.csv'), 3, mapa_claustro, por_ci
    )
    n2, faltan2 = cargar_asistencia(
        os.path.join(CARPETA, 'ASISTENCIA_CAPACITACIONES_2025.csv'), 3, mapa_capacitaciones, por_ci
    )

    print(f'Claustro: {n1} registros insertados, {len(faltan1)} CI sin match')
    print(f'Capacitaciones: {n2} registros insertados, {len(faltan2)} CI sin match')

    with open('planilla/importa2025/ci_sin_match.txt', 'w', encoding='utf-8') as out:
        out.write('=== Claustro, CI sin match ===\n')
        for ci, nom in faltan1:
            out.write(f'{ci}\t{nom}\n')
        out.write('\n=== Capacitaciones, CI sin match ===\n')
        for ci, nom in faltan2:
            out.write(f'{ci}\t{nom}\n')
