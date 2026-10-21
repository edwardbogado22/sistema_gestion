"""Corrige los CSV de planilla/importa2025 que quedaron con doble entrecomillado:
cada fila se escribió como un único campo entre comillas en lugar de columnas
separadas. Detecta ese caso (fila con un solo campo) y la vuelve a parsear.
"""
import csv
import glob
import os

CARPETA = 'planilla/importa2025'


def arreglar_archivo(ruta):
    with open(ruta, encoding='utf-8-sig', newline='') as f:
        primera_linea = f.readline()
    delim = ';' if primera_linea.count(';') > primera_linea.count(',') else ','

    with open(ruta, encoding='utf-8-sig', newline='') as f:
        filas = list(csv.reader(f, delimiter=delim))

    n_cols = len(filas[0])

    filas_corregidas = []
    for fila in filas:
        if len(fila) == 1 and delim in fila[0]:
            fila = next(csv.reader([fila[0]], delimiter=delim))
        # Comas/punto y coma sin comillas dentro del nombre de la materia
        # (primer campo) generan columnas de más: se vuelven a unir.
        while len(fila) > n_cols:
            fila = [fila[0] + ',' + fila[1]] + fila[2:]
        filas_corregidas.append(fila)

    inconsistentes = [i for i, f in enumerate(filas_corregidas) if len(f) != n_cols]

    with open(ruta, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerows(filas_corregidas)

    return len(filas_corregidas), n_cols, inconsistentes


if __name__ == '__main__':
    for ruta in sorted(glob.glob(os.path.join(CARPETA, '*.csv'))):
        total, n_cols, inconsistentes = arreglar_archivo(ruta)
        estado = 'OK' if not inconsistentes else f'REVISAR filas {inconsistentes}'
        print(f'{os.path.basename(ruta)}: {total} filas, {n_cols} columnas -> {estado}')
