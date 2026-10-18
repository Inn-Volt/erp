"""
Catálogo inicial de plantillas de levantamiento técnico de InnVolt (fase 11).

Genera los INSERT de supabase_fase11_levantamientos.sql (entre @@PLANTILLAS@@ y @@FIN@@).
Las plantillas se editan después en la app (Mi empresa → Plantillas de informe); este archivo
solo define el punto de partida. Si una plantilla ya existe (mismo código), el SQL no la toca.

    python scripts/plantillas_levantamiento.py

Convenciones de cada pregunta (JSON en informe_plantillas.campos):
  clave, etiqueta, tipo, opciones, unidad, requerido, ayuda, placeholder, subcampos, mostrarSi,
  alternativas  → respuestas válidas cuando no hay dato: «No medido», «No identificado»…
  precarga      → se llena sola desde la visita: cliente, direccion, contacto, telefono, fecha, tecnico
  naturaleza    → observado | medido | declarado | estimado (sale en el PDF)
  alerta        → valores que marcan un riesgo destacado al comienzo del informe
  cotizacion    → para qué sirve al cotizar: antecedente, diagnostico, requisito, material, equipo,
                  cantidad, mano_obra, servicio, montaje, exclusion, pendiente, evidencia
  interno       → no sale en el PDF del cliente
"""
import io
import json
import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SQL = os.path.join(RAIZ, 'supabase_fase11_levantamientos.sql')


def campo(tipo, clave, etiqueta, **kw):
    c = {'clave': clave, 'etiqueta': etiqueta, 'tipo': tipo}
    for k, v in kw.items():
        if v is None:
            continue
        if k == 'si':   # (campo, valor[, op])
            c['mostrarSi'] = {'campo': v[0], 'op': v[2] if len(v) > 2 else '=', 'valor': v[1]}
        else:
            c[k] = v
    return c


def SEC(clave, etiqueta, **kw): return campo('seccion', clave, etiqueta, **kw)
def T(clave, etiqueta, **kw): return campo('texto', clave, etiqueta, **kw)
def P(clave, etiqueta, **kw): return campo('parrafo', clave, etiqueta, **kw)
def N(clave, etiqueta, unidad=None, **kw): return campo('numero', clave, etiqueta, unidad=unidad, **kw)
def S(clave, etiqueta, opciones, **kw): return campo('seleccion', clave, etiqueta, opciones=opciones, **kw)
def M(clave, etiqueta, opciones, **kw): return campo('multiseleccion', clave, etiqueta, opciones=opciones, **kw)
def V(clave, etiqueta, **kw): return campo('si_no_na', clave, etiqueta, **kw)   # Sí / No / No aplica / No verificado
def F(clave, etiqueta, **kw): return campo('foto', clave, etiqueta, **kw)
def A(clave, etiqueta, **kw): return campo('archivo', clave, etiqueta, **kw)
def FIR(clave, etiqueta, **kw): return campo('firma', clave, etiqueta, **kw)
def L(clave, etiqueta, subcampos, **kw): return campo('lista', clave, etiqueta, subcampos=subcampos, **kw)
def FE(clave, etiqueta, **kw): return campo('fecha', clave, etiqueta, **kw)


ORIGEN = ['Medido en terreno', 'Declarado por el cliente', 'Estimado por el técnico', 'Pendiente de confirmar']
ESTADO = ['Bueno', 'Regular', 'Deficiente', 'No verificado']
UNIDADES = ['un', 'm', 'm²', 'punto', 'circuito', 'global', 'hora']
NO_MEDIDO = ['No medido']
NO_IDENT = ['No identificado']
GRAVEDAD = ['Baja', 'Media', 'Alta', 'Riesgo inmediato']
FASES = ['Monofásico', 'Trifásico', 'No identificado']


# ─── Bloques comunes ──────────────────────────────────────────────────────────
def antecedentes(*extra):
    return [
        SEC('s_antecedentes', 'Antecedentes de la visita'),
        T('cliente', 'Cliente', precarga='cliente'),
        T('direccion', 'Dirección', precarga='direccion'),
        T('contacto', 'Contacto en sitio', precarga='contacto'),
        T('telefono', 'Teléfono del contacto', precarga='telefono'),
        P('motivo', 'Motivo de la visita / qué solicita el cliente', requerido=True, naturaleza='declarado',
          cotizacion=['requisito'], placeholder='En palabras del cliente: qué necesita y para cuándo.'),
        S('tipo_inmueble', 'Tipo de inmueble', ['Casa', 'Departamento', 'Local comercial', 'Oficina',
          'Bodega / industria', 'Edificio / condominio', 'Otro'], cotizacion=['antecedente']),
        *extra,
        M('acceso', 'Condiciones de acceso', ['Acceso libre', 'Coordinar con administración', 'Horario restringido',
          'Requiere permiso de trabajo', 'Requiere inducción de seguridad', 'Requiere trabajar sin público'],
          cotizacion=['montaje']),
    ]


def mediciones():
    """Mediciones: siempre se puede marcar que no se midió."""
    return [
        SEC('s_mediciones', 'Mediciones'),
        V('se_midio', '¿Se realizaron mediciones?', ayuda='Si solo hubo inspección visual, marca «No»: el informe no presentará valores medidos.'),
        T('instrumento', 'Instrumento utilizado (marca, modelo)', si=('se_midio', 'Sí'), naturaleza='medido'),
        L('mediciones', 'Medición', [
            T('punto', 'Punto / circuito'),
            S('magnitud', 'Magnitud', ['Tensión F-N (V)', 'Tensión F-F (V)', 'Corriente (A)', 'Aislación (MΩ)',
              'Resistencia de tierra (Ω)', 'Temperatura (°C)', 'Otra']),
            N('valor', 'Valor'),
            S('resultado', 'Resultado', ['Normal', 'Fuera de rango', 'No concluyente']),
        ], si=('se_midio', 'Sí'), naturaleza='medido', cotizacion=['evidencia'],
           alerta=['Fuera de rango'], ayuda='Una fila por medición. En monofásico no registres fases S y T.'),
    ]


def hallazgos():
    return [
        SEC('s_hallazgos', 'Hallazgos y riesgos'),
        L('hallazgos', 'Hallazgo', [
            T('descripcion', 'Qué se observó'),
            T('ubicacion', 'Ubicación'),
            S('gravedad', 'Gravedad', GRAVEDAD),
            F('foto', 'Foto'),
        ], naturaleza='observado', cotizacion=['diagnostico', 'evidencia'], alerta=['Riesgo inmediato'],
           ayuda='Cada hallazgo con su foto. «Riesgo inmediato» se destaca al comienzo del informe.'),
        P('accion_inmediata', 'Medida tomada ante un riesgo inmediato',
          ayuda='Ej.: se desenergizó el circuito, se informó al cliente por escrito. Dejar vacío si no hubo.'),
    ]


def propuesta(*extra):
    return [
        SEC('s_propuesta', 'Propuesta y datos para cotizar'),
        P('solucion', 'Solución técnica propuesta', requerido=True, naturaleza='estimado', cotizacion=['requisito'],
          ayuda='Lo que se propone hacer. No incluir precios.'),
        *extra,
        L('trabajos', 'Trabajo', [
            T('descripcion', 'Trabajo a realizar'),
            N('cantidad', 'Cantidad'),
            S('unidad', 'Unidad', UNIDADES),
            S('origen', 'Origen de la cantidad', ORIGEN),
        ], cotizacion=['mano_obra', 'cantidad'], ayuda='Una fila por trabajo. Si no sabes la cantidad, déjala vacía y marca «Pendiente de confirmar».'),
        L('materiales', 'Material o equipo', [
            T('descripcion', 'Descripción técnica'),
            T('especificacion', 'Especificación conocida'),
            N('cantidad', 'Cantidad'),
            S('unidad', 'Unidad', UNIDADES),
            T('marca_modelo', 'Marca / modelo (solo si está identificado o lo pide el cliente)'),
            S('origen', 'Origen de la cantidad', ORIGEN),
            S('validacion', 'Estado', ['Por validar', 'Validado con el cliente', 'Compatibilidad por verificar']),
        ], cotizacion=['material', 'equipo', 'cantidad']),
        T('dotacion', 'Dotación y plazo estimados', placeholder='Ej.: 2 técnicos, 1 día', naturaleza='estimado', cotizacion=['mano_obra']),
        M('servicios', 'Servicios adicionales', ['Retiro de escombros', 'Trabajo en altura', 'Andamio / alza hombre',
          'Trámite SEC (TE1)', 'Ingeniería / planos', 'Obras civiles menores', 'Terminaciones / pintura',
          'Trabajo fuera de horario', 'Corte de energía programado'], cotizacion=['servicio']),
        N('altura', 'Altura máxima de trabajo', 'm', alternativas=['No aplica'], cotizacion=['montaje']),
        P('montaje', 'Condiciones de montaje', cotizacion=['montaje'], placeholder='Superficies, recorridos, horarios, protección de terminaciones…'),
        P('exclusiones', 'Exclusiones y limitaciones', cotizacion=['exclusion'],
          placeholder='Lo que no incluye la propuesta o no se pudo revisar.'),
        P('pendientes', 'Datos pendientes de confirmar', cotizacion=['pendiente'],
          placeholder='Lo que falta saber para cotizar sin riesgo.'),
        S('urgencia', 'Prioridad', ['Normal', 'Prioritaria', 'Urgente: riesgo inmediato'], alerta=['Urgente: riesgo inmediato']),
        P('recomendaciones', 'Recomendaciones y próximos pasos'),
    ]


def cierre():
    return [
        SEC('s_cierre', 'Registro y cierre'),
        F('fotos', 'Fotos generales', cotizacion=['evidencia']),
        A('adjuntos', 'Documentos adjuntos', ayuda='Planos, boletas, fichas técnicas que entregó el cliente.'),
        P('observaciones', 'Observaciones finales'),
        P('notas_internas', 'Notas internas para la oficina', interno=True,
          ayuda='No salen en el PDF del cliente: disposición del cliente, competencia, presupuesto que mencionó…'),
        T('recibe', 'Nombre de quien recibe la visita'),
        FIR('firma_cliente', 'Firma de quien recibe (opcional)'),
    ]


def plantilla(codigo, nombre, servicio, descripcion, objetivo, instrucciones, intro, especificos, checklist, extra_propuesta=(), extra_antecedentes=()):
    campos = antecedentes(*extra_antecedentes) + especificos + hallazgos() + propuesta(*extra_propuesta) + cierre()
    claves = [c['clave'] for c in campos]
    assert len(claves) == len(set(claves)), f'{codigo}: claves repetidas {[k for k in claves if claves.count(k) > 1]}'
    return dict(codigo=codigo, nombre=nombre, tipo='visita', tipo_servicio=servicio, descripcion=descripcion,
                objetivo=objetivo, instrucciones=instrucciones, intro=intro, campos=campos,
                checklist=[{'texto': t} for t in checklist])


INSTR = ('Completa lo que puedas verificar. Si un dato no se pudo obtener, usa «No identificado», «No medido» o '
         '«No verificado»: nunca inventes un valor. Saca fotos de todo lo que respalde un hallazgo o una cantidad.')

P_LIST = []

# A. Levantamiento eléctrico general
P_LIST.append(plantilla(
    'LEV-ELE', 'Levantamiento eléctrico general', 'electricidad',
    'Instalaciones nuevas, ampliaciones, aumentos de capacidad y evaluación de instalaciones existentes.',
    'Reunir los antecedentes de alimentación, tableros, circuitos y recorridos para cotizar sin segunda visita.',
    INSTR + ' Si es trifásico, registra las tres fases.',
    'Levantamiento técnico de la instalación eléctrica, realizado para dimensionar y cotizar los trabajos solicitados.',
    [
        SEC('s_alimentacion', 'Alimentación y empalme'),
        S('fases', 'Sistema', FASES, requerido=True, naturaleza='observado', cotizacion=['antecedente']),
        S('tension', 'Tensión nominal', ['220 V', '380 V', 'Otra'], alternativas=NO_IDENT),
        S('tipo_empalme', 'Tipo de empalme', ['Aéreo', 'Subterráneo'], alternativas=NO_IDENT),
        N('capacidad_empalme', 'Capacidad del empalme / protección general', 'A', alternativas=NO_IDENT, naturaleza='observado', cotizacion=['antecedente']),
        S('distribuidora', 'Distribuidora', ['Enel', 'CGE', 'Chilquinta', 'Otra'], alternativas=NO_IDENT),
        S('estado_empalme', 'Estado del empalme', ESTADO, alerta=['Deficiente']),
        F('foto_empalme', 'Fotos del empalme y medidor'),
        SEC('s_tableros', 'Tableros y protecciones'),
        L('tableros', 'Tablero', [
            T('nombre', 'Nombre / ubicación'),
            S('tipo', 'Tipo', ['General', 'Distribución', 'Fuerza', 'Alumbrado', 'Otro']),
            T('proteccion', 'Protección general (ej. 2x40 A)'),
            S('diferencial', '¿Tiene diferencial?', ['Sí, en todos los circuitos', 'En algunos', 'No', 'No verificado']),
            S('espacio', 'Espacio disponible', ['Sí', 'Pocas posiciones', 'No']),
            S('estado', 'Estado', ESTADO),
            F('foto', 'Foto'),
        ], naturaleza='observado', cotizacion=['antecedente', 'evidencia'], alerta=['Deficiente']),
        SEC('s_circuitos', 'Circuitos, conductores y canalizaciones'),
        L('circuitos', 'Circuito', [
            T('circuito', 'Circuito / uso'),
            T('proteccion', 'Protección'),
            T('conductor', 'Conductor (ej. 2,5 mm² THHN)'),
            S('canalizacion', 'Canalización', ['Embutida', 'Tubo a la vista', 'Bandeja', 'Sin canalización', 'No verificada']),
            S('estado', 'Estado', ESTADO),
        ], naturaleza='observado', alerta=['Deficiente']),
        V('puesta_tierra', '¿Existe puesta a tierra?', alerta=['No'], cotizacion=['diagnostico']),
        N('distancia', 'Distancia del tablero al punto de trabajo', 'm', alternativas=['No aplica'], cotizacion=['cantidad']),
        P('recorrido', 'Recorrido propuesto', cotizacion=['montaje'], placeholder='Por dónde iría el alimentador o los circuitos nuevos.'),
        *mediciones(),
    ],
    ['Fotos del empalme, medidor y tablero general', 'Se identificaron las protecciones existentes',
     'Se recorrió el trazado propuesto y se midieron distancias', 'Se confirmaron horarios y accesos para ejecutar'],
    extra_antecedentes=[S('tipo_trabajo', 'Tipo de trabajo', ['Instalación nueva', 'Ampliación', 'Aumento de capacidad',
                        'Evaluación de instalación existente'], requerido=True, cotizacion=['requisito'])],
))

# B. Reparación eléctrica
P_LIST.append(plantilla(
    'REP-ELE', 'Reparación eléctrica', 'electricidad',
    'Fallas, cortocircuitos, disparos de protecciones, pérdida de alimentación, recalentamientos y averías.',
    'Registrar el síntoma, el diagnóstico y lo que se hizo o queda por hacer, separando lo confirmado de lo probable.',
    INSTR + ' Distingue lo que viste y mediste de lo que te contó el cliente.',
    'Informe de atención de falla eléctrica: síntoma informado, diagnóstico y solución.',
    [
        SEC('s_sintoma', 'Síntoma informado'),
        M('sintoma', 'Síntoma', ['Disparo de protección', 'Corte total', 'Corte parcial', 'Cortocircuito',
          'Olor a quemado / recalentamiento', 'Luces que parpadean', 'Enchufe sin energía', 'Golpe de corriente', 'Otro'],
          requerido=True, naturaleza='declarado', alerta=['Olor a quemado / recalentamiento', 'Golpe de corriente']),
        S('cuando', 'Cuándo ocurre', ['Permanente', 'Intermitente', 'Al conectar un equipo', 'Con lluvia o humedad',
          'En un horario específico'], alternativas=['No determinado'], naturaleza='declarado'),
        T('desde_cuando', 'Desde cuándo', naturaleza='declarado'),
        P('equipos_afectados', 'Equipos o sectores afectados', naturaleza='declarado'),
        T('ubicacion_falla', 'Ubicación de la falla'),
        SEC('s_diagnostico', 'Diagnóstico'),
        M('pruebas', 'Pruebas realizadas', ['Inspección visual', 'Medición de tensión', 'Medición de aislación',
          'Prueba de diferencial', 'Desconexión por circuitos', 'Termografía'], requerido=True, naturaleza='observado'),
        T('instrumento', 'Instrumento utilizado', placeholder='Marca y modelo, si se midió'),
        L('mediciones', 'Medición', [
            T('punto', 'Punto / circuito'),
            S('magnitud', 'Magnitud', ['Tensión (V)', 'Corriente (A)', 'Aislación (MΩ)', 'Resistencia de tierra (Ω)', 'Temperatura (°C)']),
            N('valor', 'Valor'),
            S('resultado', 'Resultado', ['Normal', 'Fuera de rango', 'No concluyente']),
        ], naturaleza='medido', alerta=['Fuera de rango']),
        P('diagnostico', 'Diagnóstico', requerido=True, naturaleza='estimado', cotizacion=['diagnostico']),
        S('causa_estado', 'Causa', ['Confirmada', 'Probable, por confirmar', 'No determinada'], requerido=True),
        P('causa', 'Causa identificada', si=('causa_estado', 'No determinada', '≠')),
        SEC('s_intervencion', 'Intervención'),
        S('reparacion', '¿Se reparó en la visita?', ['Sí, reparación completa', 'Parcial o provisoria', 'No, solo diagnóstico'], requerido=True),
        P('trabajo_ejecutado', 'Trabajo ejecutado', si=('reparacion', 'No, solo diagnóstico', '≠')),
        P('materiales_usados', 'Materiales utilizados en la visita', si=('reparacion', 'No, solo diagnóstico', '≠')),
        P('trabajo_pendiente', 'Trabajo pendiente', cotizacion=['pendiente', 'mano_obra'],
          si=('reparacion', 'Sí, reparación completa', '≠')),
    ],
    ['Se dejó la instalación en condición segura', 'Se informó al cliente el diagnóstico',
     'Se registraron fotos de la falla', 'Se separó lo ejecutado de lo pendiente'],
))

# C. Mantención eléctrica
P_LIST.append(plantilla(
    'MAN-ELE', 'Mantención eléctrica preventiva y correctiva', 'mantencion',
    'Mantención de tableros, circuitos y equipos eléctricos.',
    'Identificar los activos, registrar las tareas, mediciones y hallazgos, y dejar las acciones pendientes.',
    INSTR,
    'Informe de mantención eléctrica: activos revisados, tareas realizadas, mediciones y recomendaciones.',
    [
        SEC('s_tipo', 'Alcance de la mantención'),
        S('tipo_mantencion', 'Tipo de mantención', ['Preventiva', 'Correctiva', 'Predictiva'], requerido=True),
        S('historial', 'Historial', ['Hay registro de mantenciones anteriores', 'No hay registro', 'No informado']),
        FE('ultima_mantencion', 'Última mantención', si=('historial', 'Hay registro de mantenciones anteriores')),
        SEC('s_activos', 'Activos revisados'),
        L('activos', 'Activo', [
            T('identificacion', 'Identificación interna'),
            S('tipo', 'Tipo', ['Tablero', 'Motor', 'UPS', 'Grupo electrógeno', 'Iluminación', 'Bomba', 'Climatización', 'Otro']),
            T('fabricante', 'Fabricante'),
            T('modelo', 'Modelo'),
            T('ubicacion', 'Ubicación'),
            S('estado', 'Estado', ['Operativo', 'Operativo con observaciones', 'Fuera de servicio']),
            F('foto', 'Foto'),
        ], requerido=True, naturaleza='observado', alerta=['Fuera de servicio']),
        SEC('s_tareas', 'Tareas realizadas'),
        M('tareas', 'Tareas realizadas', ['Reapriete de conexiones', 'Limpieza de tableros', 'Termografía',
          'Medición de aislación', 'Prueba de diferenciales', 'Revisión de puesta a tierra',
          'Cambio de componentes', 'Rotulación'], naturaleza='observado'),
        P('detalle_tareas', 'Detalle de lo realizado'),
        *mediciones(),
        SEC('s_seguimiento', 'Seguimiento'),
        P('acciones_pendientes', 'Acciones pendientes', cotizacion=['pendiente', 'mano_obra']),
        FE('proxima', 'Próxima mantención sugerida'),
    ],
    ['Se coordinó el corte de energía con el cliente', 'Se registraron los activos con su identificación',
     'Se dejó cada tablero cerrado y rotulado', 'Se informó al cliente los hallazgos'],
))

# D. Tableros y normalización
P_LIST.append(plantilla(
    'TAB-ELE', 'Tableros eléctricos y normalización', 'electricidad',
    'Levantamiento detallado de tableros y circuitos para normalizar o ampliar.',
    'Describir cada tablero y sus circuitos, sus deficiencias y el alcance de la normalización.',
    INSTR + ' No abras tableros energizados sin las medidas de seguridad correspondientes.',
    'Levantamiento de tableros eléctricos y propuesta de normalización.',
    [
        SEC('s_tableros', 'Tableros'),
        L('tableros', 'Tablero', [
            T('nombre', 'Nombre / ubicación'),
            T('alimentado_desde', 'Alimentado desde'),
            S('caja', 'Gabinete', ['Metálico sobrepuesto', 'Metálico embutido', 'Plástico sobrepuesto', 'Plástico embutido']),
            T('proteccion', 'Protección general (A)'),
            T('capacidad_ruptura', 'Capacidad de ruptura (kA), si es identificable'),
            S('barras', 'Barras de neutro y tierra', ['Separadas', 'Compartidas', 'Sin barra de tierra', 'No verificado']),
            S('diferenciales', 'Diferenciales', ['Todos los circuitos', 'Algunos', 'Ninguno', 'No verificado']),
            S('rotulacion', 'Rotulación', ['Completa', 'Parcial', 'Sin rotular']),
            S('espacio', 'Espacio disponible', ['Sí', 'Pocas posiciones', 'No']),
            S('estado', 'Estado', ESTADO),
            F('foto', 'Fotos'),
        ], requerido=True, naturaleza='observado', alerta=['Deficiente']),
        SEC('s_circuitos', 'Circuitos'),
        L('circuitos', 'Circuito', [
            T('tablero', 'Tablero'),
            T('numero', 'N° / identificación'),
            T('uso', 'Uso'),
            T('proteccion', 'Protección'),
            T('conductor', 'Conductor visible'),
            T('observacion', 'Observación'),
        ], naturaleza='observado'),
        SEC('s_normalizacion', 'Normalización'),
        M('deficiencias', 'Deficiencias detectadas', ['Sin diferencial', 'Sin puesta a tierra', 'Sin rotulación',
          'Sin cubierta / contratapa', 'Conductores sin terminal', 'Protecciones mal coordinadas',
          'Neutro y tierra compartidos', 'Signos de recalentamiento', 'Espacio insuficiente'],
          naturaleza='observado', cotizacion=['diagnostico'], alerta=['Signos de recalentamiento', 'Sin puesta a tierra']),
        V('ampliacion', '¿Se requiere ampliar el tablero?', cotizacion=['requisito']),
        P('alcance_normalizacion', 'Alcance de la normalización', requerido=True, cotizacion=['requisito', 'mano_obra']),
        *mediciones(),
    ],
    ['Fotos de cada tablero abierto y cerrado', 'Se registraron todos los circuitos visibles',
     'Se verificó la existencia de puesta a tierra'],
))

# E. Iluminación
P_LIST.append(plantilla(
    'ILU', 'Iluminación y control de iluminación', 'iluminacion',
    'Proyectos de iluminación LED, indirecta, regulación, sensores y escenas.',
    'Definir por zona qué luminarias hay y cuáles se suministran, su potencia, color, regulación y control.',
    INSTR + ' Diferencia lo existente de lo que se suministra nuevo. Mide los metros lineales de perfiles y cintas.',
    'Levantamiento de iluminación: zonas, luminarias, regulación y sistema de control.',
    [
        SEC('s_zonas', 'Zonas y luminarias'),
        L('zonas', 'Zona', [
            T('zona', 'Zona / espacio'),
            S('condicion', 'Condición', ['Existente', 'Reemplazo', 'Nuevo suministro']),
            S('tipo', 'Tipo de luminaria', ['Panel', 'Foco embutido', 'Riel', 'Cinta LED', 'Perfil LED', 'Proyector', 'Lineal', 'Decorativa', 'Otra']),
            N('puntos', 'Puntos'),
            N('potencia', 'Potencia por punto (W)'),
            N('metros', 'Metros lineales (cinta / perfil)'),
            S('color', 'Color de luz', ['2700 K', '3000 K', '4000 K', '6500 K', 'RGB / RGBW', 'Por definir']),
            S('regulacion', 'Regulación', ['No', 'Dimmer', 'DALI', '0-10 V', 'Inteligente (app)', 'Por definir']),
        ], requerido=True, naturaleza='observado', cotizacion=['material', 'cantidad']),
        SEC('s_perfiles', 'Perfiles, cintas y fuentes'),
        T('perfil', 'Perfil y difusor', placeholder='Ej.: perfil embutido 17 mm, difusor opal'),
        S('tension_cinta', 'Tensión de la cinta', ['12 V', '24 V', '48 V', '220 V', 'No aplica', 'Por definir']),
        T('fuentes', 'Fuentes de alimentación: ubicación y espacio'),
        SEC('s_control', 'Control'),
        T('interruptores', 'Interruptores existentes', naturaleza='observado'),
        V('neutro_cajas', '¿Hay neutro en las cajas de interruptores?', cotizacion=['montaje'],
          ayuda='Muchos interruptores inteligentes lo necesitan. Si no se pudo abrir la caja, «No verificado».'),
        V('cableado_disponible', '¿Hay cableado o ductos disponibles?'),
        S('control', 'Sistema de control solicitado', ['Interruptor tradicional', 'Sensores', 'Wi-Fi / app', 'Zigbee',
          'Matter', 'DALI', 'Por definir'], cotizacion=['requisito']),
        T('hub', 'Hub o gateway requerido'),
        P('escenas', 'Escenas solicitadas', naturaleza='declarado', cotizacion=['requisito']),
        M('asistentes', 'Asistentes de voz', ['Alexa', 'Google', 'Siri / Apple Home', 'No requiere'], naturaleza='declarado'),
    ],
    ['Se midieron los metros lineales de cintas y perfiles', 'Se identificó dónde van las fuentes',
     'Se verificó el neutro en las cajas', 'Fotos de cada zona'],
))

# F. Domótica
P_LIST.append(plantilla(
    'DOM', 'Domótica y automatización', 'domotica',
    'Automatización residencial o comercial: equipos existentes, red, cargas, sensores y escenas.',
    'Saber qué se quiere controlar, con qué y si es compatible, antes de cotizar.',
    INSTR + ' No asumas que dos equipos son compatibles solo porque usan el mismo protocolo: verifícalo.',
    'Levantamiento para automatización: equipos existentes, red, cargas a controlar y lógica deseada.',
    [
        SEC('s_existente', 'Sistema existente'),
        S('plataforma', 'Plataforma actual', ['Ninguna', 'Tuya / Smart Life', 'Google Home', 'Alexa', 'Apple Home',
          'Home Assistant', 'Otra'], naturaleza='declarado'),
        L('equipos_existentes', 'Equipo existente', [
            T('tipo', 'Equipo'),
            T('marca_modelo', 'Marca y modelo'),
            S('protocolo', 'Protocolo', ['Wi-Fi', 'Zigbee', 'Z-Wave', 'Matter / Thread', 'Bluetooth', 'Cableado', 'No identificado']),
            T('ubicacion', 'Ubicación'),
        ], naturaleza='observado'),
        SEC('s_red', 'Red y condiciones'),
        S('wifi', 'Cobertura Wi-Fi', ['Buena en toda el área', 'Zonas débiles', 'Sin cobertura en zonas a automatizar'],
          alternativas=['No verificada'], cotizacion=['requisito']),
        T('router', 'Router / proveedor de internet'),
        V('neutro_cajas', '¿Hay neutro en las cajas?', cotizacion=['montaje']),
        SEC('s_cargas', 'Lo que se quiere controlar'),
        L('dispositivos', 'Dispositivo a controlar', [
            S('carga', 'Qué es', ['Iluminación', 'Enchufe', 'Cortina / persiana', 'Portón', 'Climatización', 'Riego', 'Calefactor', 'Otro']),
            T('ubicacion', 'Ubicación'),
            S('tipo_carga', 'Tipo de carga', ['Resistiva', 'LED', 'Motor', 'Inductiva', 'No identificada']),
            N('potencia', 'Potencia (W)'),
            N('cantidad', 'Cantidad'),
        ], requerido=True, cotizacion=['equipo', 'cantidad']),
        M('sensores', 'Sensores solicitados', ['Movimiento', 'Puerta / ventana', 'Temperatura / humedad', 'Humo',
          'Fuga de agua', 'Ninguno'], cotizacion=['equipo']),
        P('escenas', 'Escenas, horarios y lógica de automatización', naturaleza='declarado', cotizacion=['requisito']),
        S('compatibilidad', 'Compatibilidad', ['Verificada con ficha técnica', 'Por verificar'], requerido=True,
          cotizacion=['pendiente'], ayuda='Si queda «Por verificar», la cotización lo indicará como pendiente.'),
        P('integracion', 'Requisitos de integración'),
    ],
    ['Se probó la cobertura Wi-Fi en las zonas a automatizar', 'Se anotaron marca y modelo de lo existente',
     'Se verificó el neutro donde corresponde'],
))

# G. CCTV
P_LIST.append(plantilla(
    'CCTV', 'CCTV y videovigilancia', 'cctv',
    'Cámaras, grabación, cableado y acceso remoto.',
    'Definir cada cámara y su recorrido de cableado, la grabación y la conectividad.',
    INSTR + ' Registra una fila por cámara y otra por tramo de cableado, con su distancia.',
    'Levantamiento para sistema de videovigilancia.',
    [
        SEC('s_objetivo', 'Objetivo de vigilancia'),
        P('objetivo_vigilancia', 'Qué se quiere vigilar', naturaleza='declarado', cotizacion=['requisito']),
        SEC('s_camaras', 'Cámaras'),
        L('camaras', 'Cámara', [
            T('ubicacion', 'Ubicación'),
            S('ambiente', 'Ambiente', ['Interior', 'Exterior']),
            N('altura', 'Altura de montaje (m)'),
            T('vision', 'Qué debe ver'),
            S('resolucion', 'Resolución', ['2 MP', '4 MP', '5 MP', '8 MP (4K)', 'Por definir']),
            S('iluminacion', 'Iluminación', ['Buena', 'Baja', 'Nula de noche', 'Contraluz']),
            S('alimentacion', 'Alimentación', ['PoE', 'Fuente independiente', 'Por definir']),
            F('foto', 'Foto del punto'),
        ], requerido=True, cotizacion=['equipo', 'cantidad', 'evidencia']),
        SEC('s_cableado', 'Recorridos de cableado'),
        L('tramos', 'Tramo', [
            T('desde', 'Desde'),
            T('hasta', 'Hasta'),
            N('distancia', 'Distancia (m)'),
            S('canalizacion', 'Canalización', ['Existente', 'Nueva a la vista', 'Nueva embutida', 'Aérea']),
            S('origen', 'Origen de la distancia', ORIGEN),
        ], cotizacion=['material', 'cantidad']),
        SEC('s_grabacion', 'Grabación y conectividad'),
        S('grabador', 'Grabador', ['Existente', 'NVR nuevo', 'DVR nuevo', 'Nube', 'Por definir'], cotizacion=['equipo']),
        N('retencion', 'Días de grabación solicitados', 'días', naturaleza='declarado', cotizacion=['requisito']),
        V('acceso_remoto', '¿Requiere acceso remoto?'),
        S('internet', 'Internet', ['Fibra', 'Cable', '4G / 5G', 'No hay']),
        S('rack', 'Rack', ['Existente con espacio', 'Existente sin espacio', 'Requiere rack', 'No aplica']),
        V('monitor', '¿Requiere monitor?'),
        V('ups', '¿Requiere UPS?'),
        P('privacidad', 'Consideraciones de privacidad',
          ayuda='Cámaras que puedan captar espacios de terceros, vía pública o zonas privadas.'),
    ],
    ['Foto desde cada punto de cámara', 'Se midieron los recorridos', 'Se ubicó el lugar del grabador y la energía'],
))

# H. Control de acceso
P_LIST.append(plantilla(
    'ACC', 'Control de acceso', 'control_acceso',
    'Puertas y accesos, identificación, cerraduras, controlador y evacuación.',
    'Definir cada acceso y su equipamiento, cuidando la apertura segura y la evacuación.',
    INSTR + ' Toda puerta en vía de evacuación debe poder abrirse desde adentro sin energía o con mecanismo seguro.',
    'Levantamiento para sistema de control de acceso.',
    [
        SEC('s_accesos', 'Accesos'),
        L('accesos', 'Acceso', [
            T('nombre', 'Acceso / puerta'),
            S('puerta', 'Tipo de puerta', ['Madera', 'Metálica', 'Vidrio', 'Portón', 'Torniquete / barrera']),
            S('identificacion', 'Identificación', ['Tarjeta / llavero', 'Clave', 'Huella', 'Facial', 'App / QR', 'Citófono']),
            S('cierre', 'Cerradura', ['Electroimán', 'Cerradura eléctrica', 'Pestillo eléctrico', 'Motor de portón', 'Existente']),
            S('boton_salida', 'Botón de salida', ['Sí', 'No', 'Existente']),
            S('sensor', 'Sensor de puerta', ['Sí', 'No']),
            N('distancia', 'Distancia al controlador (m)'),
            F('foto', 'Foto'),
        ], requerido=True, cotizacion=['equipo', 'cantidad']),
        SEC('s_sistema', 'Sistema'),
        S('controlador', 'Controlador', ['Existente', 'Nuevo centralizado', 'Autónomo por puerta', 'Por definir'], cotizacion=['equipo']),
        N('usuarios', 'Cantidad de usuarios', alternativas=['Por confirmar'], naturaleza='declarado'),
        S('respaldo', 'Respaldo de energía', ['UPS / batería', 'No requiere', 'Por definir']),
        V('integracion_cctv', '¿Integración con CCTV?'),
        V('registro', '¿Requiere registro de eventos?'),
        SEC('s_evacuacion', 'Evacuación y apertura segura'),
        V('via_evacuacion', '¿Algún acceso está en vía de evacuación?', alerta=['Sí']),
        S('modo_falla', 'Comportamiento sin energía', ['Abre sin energía (falla segura)', 'Cierra sin energía (falla asegurada)', 'Por definir'],
          si=('via_evacuacion', 'Sí')),
        P('evacuacion', 'Consideraciones de evacuación', si=('via_evacuacion', 'Sí')),
    ],
    ['Foto de cada puerta por ambos lados', 'Se midió la distancia al controlador', 'Se revisó la condición de evacuación'],
))

# I. Redes
P_LIST.append(plantilla(
    'RED', 'Redes y cableado estructurado', 'redes',
    'Puntos de red, categoría, recorridos, rack, switches, PoE y Wi-Fi.',
    'Contar los puntos y medir sus recorridos, y definir el equipamiento activo y las pruebas.',
    INSTR,
    'Levantamiento para red de datos y cableado estructurado.',
    [
        SEC('s_puntos', 'Puntos de red'),
        L('puntos', 'Punto', [
            T('ubicacion', 'Ubicación'),
            N('cantidad', 'Cantidad'),
            S('uso', 'Uso', ['PC', 'Cámara', 'Access point', 'Impresora', 'TV', 'Teléfono IP', 'Otro']),
            N('distancia', 'Distancia al rack (m)'),
            S('origen', 'Origen de la distancia', ORIGEN),
        ], requerido=True, cotizacion=['material', 'cantidad']),
        SEC('s_infra', 'Infraestructura'),
        S('categoria', 'Categoría', ['Cat 5e', 'Cat 6', 'Cat 6A', 'Fibra óptica', 'Por definir'], cotizacion=['requisito']),
        S('tipo_cable', 'Tipo de cable', ['UTP', 'FTP', 'Exterior', 'LSZH']),
        M('canalizacion', 'Canalización', ['Existente con espacio', 'Canaleta nueva', 'Tubo nuevo', 'Bandeja', 'Cielo falso']),
        S('rack', 'Rack', ['Existente con espacio', 'Existente sin espacio', 'Requiere rack']),
        V('patch_panel', '¿Requiere patch panel?'),
        S('switch', 'Switch', ['Existente con puertos libres', 'Nuevo', 'Por definir'], cotizacion=['equipo']),
        N('puertos_poe', 'Puertos PoE necesarios', alternativas=['No aplica']),
        SEC('s_wifi', 'Wi-Fi y conectividad'),
        S('wifi', 'Cobertura Wi-Fi', ['Buena', 'Zonas débiles', 'Sin cobertura'], alternativas=['No verificada']),
        N('access_points', 'Access points sugeridos', naturaleza='estimado'),
        T('internet', 'Proveedor y velocidad de internet', naturaleza='declarado'),
        SEC('s_pruebas', 'Pruebas solicitadas'),
        S('certificacion', 'Pruebas', ['Certificación con equipo', 'Prueba de continuidad', 'No solicitada'], cotizacion=['servicio']),
        V('etiquetado', '¿Requiere etiquetado?'),
    ],
    ['Se contaron los puntos por recinto', 'Se midieron los recorridos', 'Foto del rack o lugar del rack'],
))

# J. Pantallas LED
P_LIST.append(plantilla(
    'LED', 'Pantallas LED publicitarias', 'otro',
    'Pantallas LED interiores o exteriores, su estructura, alimentación y control.',
    'Reunir dimensiones, condiciones de montaje y alimentación. La estructura y anclajes requieren evaluación de diseño.',
    INSTR + ' No dimensiones estructuras ni anclajes: registra las condiciones y deja la evaluación pendiente.',
    'Levantamiento para pantalla LED.',
    [
        SEC('s_pantalla', 'Pantalla'),
        S('uso', 'Uso', ['Interior', 'Exterior'], requerido=True, cotizacion=['requisito']),
        N('ancho', 'Ancho', 'm', naturaleza='medido', cotizacion=['cantidad']),
        N('alto', 'Alto', 'm', naturaleza='medido', cotizacion=['cantidad']),
        S('pitch', 'Pixel pitch', ['P2.5', 'P3', 'P4', 'P5', 'P6', 'P8', 'P10', 'Por definir'], cotizacion=['equipo']),
        N('distancia_vision', 'Distancia de visión típica', 'm'),
        T('contenido', 'Uso del contenido', placeholder='Publicidad, información, eventos…'),
        SEC('s_estructura', 'Estructura y montaje'),
        S('lugar_montaje', 'Dónde se monta', ['Muro', 'Fachada', 'Estructura propia', 'Techo', 'Tótem', 'Por definir']),
        T('soporte', 'Material del muro o soporte', naturaleza='observado'),
        N('altura_instalacion', 'Altura de instalación', 'm'),
        M('medios', 'Medios de montaje', ['Escalera', 'Andamio', 'Alza hombre', 'Grúa', 'Por definir'], cotizacion=['servicio']),
        S('estructural', 'Evaluación estructural', ['Requiere ingeniería estructural', 'Por evaluar'], requerido=True,
          cotizacion=['pendiente'], ayuda='Estructura, anclajes y viento se definen con cálculo, no en la visita.'),
        P('condiciones_sitio', 'Condiciones del sitio', placeholder='Exposición al viento y sol, accesos, permisos municipales…'),
        SEC('s_electrico', 'Alimentación y control'),
        N('potencia', 'Potencia', 'W', alternativas=['Según fabricante, por definir']),
        S('fases', 'Alimentación', ['Monofásica', 'Trifásica', 'Por definir']),
        N('distancia_tablero', 'Distancia al tablero', 'm', cotizacion=['cantidad']),
        V('tierra', '¿Hay puesta a tierra disponible?'),
        S('controlador', 'Controlador', ['Síncrono', 'Asíncrono', 'Por definir']),
        M('conectividad', 'Conectividad', ['Wi-Fi', 'Red cableada', '4G', 'USB']),
        S('mantenimiento', 'Acceso de mantenimiento', ['Frontal', 'Trasero', 'Por definir']),
    ],
    ['Se midió el espacio disponible', 'Fotos del muro o estructura', 'Se ubicó el punto de alimentación'],
))

# K. Cargadores VE
P_LIST.append(plantilla(
    'EVC', 'Cargador para vehículo eléctrico', 'electricidad',
    'Instalación de cargadores (SAVE) en residencias, condominios y comercios.',
    'Determinar la capacidad disponible, el recorrido y el cargador para cotizar la instalación.',
    INSTR + ' Considera las disposiciones del RIC N°15 (versión vigente publicada por la SEC en 2024).',
    'Levantamiento para la instalación de un cargador de vehículo eléctrico.',
    [
        SEC('s_vehiculo', 'Vehículo y cargador'),
        T('vehiculo', 'Vehículo', naturaleza='declarado'),
        S('conector', 'Conector', ['Tipo 1', 'Tipo 2', 'GB/T', 'CCS'], alternativas=['Por confirmar']),
        S('cargador', 'Cargador', ['El cliente ya lo tiene', 'Suministro nuevo', 'Por definir'], requerido=True, cotizacion=['equipo']),
        T('marca_cargador', 'Marca y modelo del cargador', si=('cargador', 'El cliente ya lo tiene')),
        S('potencia', 'Potencia solicitada', ['3,7 kW', '7,4 kW', '11 kW', '22 kW', 'Por definir'], cotizacion=['requisito']),
        S('uso', 'Uso', ['Residencial privado', 'Comunidad / condominio', 'Comercial', 'Público']),
        SEC('s_alimentacion', 'Alimentación disponible'),
        S('fases', 'Sistema', FASES, requerido=True, naturaleza='observado'),
        N('capacidad_empalme', 'Capacidad del empalme', 'A', alternativas=NO_IDENT),
        T('tablero_origen', 'Tablero de origen'),
        S('espacio_tablero', 'Espacio en el tablero', ['Sí', 'Pocas posiciones', 'No']),
        T('protecciones', 'Protecciones existentes'),
        S('aumento', '¿Aumento de capacidad?', ['No requiere', 'Probablemente sí', 'Por evaluar con cálculo'], cotizacion=['pendiente']),
        SEC('s_recorrido', 'Recorrido y ubicación'),
        N('distancia', 'Distancia del tablero al cargador', 'm', requerido=True, naturaleza='medido', cotizacion=['cantidad']),
        S('origen_distancia', 'Origen de la distancia', ORIGEN),
        P('recorrido', 'Recorrido', cotizacion=['montaje']),
        S('exposicion', 'Exposición', ['Interior', 'Exterior protegido', 'Intemperie']),
        F('foto_estacionamiento', 'Fotos del estacionamiento y recorrido'),
        SEC('s_extras', 'Gestión y permisos'),
        S('balanceo', 'Balanceo dinámico de carga', ['Sí', 'No', 'Por evaluar']),
        V('fotovoltaico', '¿Integración con fotovoltaico?'),
        S('conectividad', 'Conectividad del cargador', ['Wi-Fi', 'Ethernet', 'No requiere']),
        S('autorizacion', 'Autorización de la administración', ['No aplica', 'Autorizado', 'Pendiente'], cotizacion=['pendiente']),
    ],
    ['Fotos del tablero de origen y del estacionamiento', 'Se midió el recorrido', 'Se revisó la capacidad del empalme'],
))

# L. Fotovoltaico
P_LIST.append(plantilla(
    'FV', 'Sistema fotovoltaico y gestión energética', 'energias_renovables',
    'Sistemas fotovoltaicos on-grid, híbridos o aislados, baterías y gestión de excedentes.',
    'Reunir consumos, superficie, orientación, sombras y espacio para equipos. La generación se calcula después.',
    INSTR + ' No estimes generación sin datos suficientes: déjala «Pendiente de cálculo».',
    'Levantamiento para sistema fotovoltaico.',
    [
        SEC('s_consumo', 'Consumo y objetivo'),
        S('boletas', 'Boletas de electricidad', ['Las entregó', 'Las enviará', 'No disponibles'], cotizacion=['pendiente']),
        N('consumo', 'Consumo mensual promedio', 'kWh', alternativas=['Pendiente'], naturaleza='declarado'),
        T('tarifa', 'Tarifa', naturaleza='declarado'),
        S('objetivo_fv', 'Objetivo', ['Ahorro (on-grid)', 'Respaldo (híbrido con baterías)', 'Aislado (off-grid)', 'Por definir'], requerido=True, cotizacion=['requisito']),
        S('fases', 'Empalme', FASES),
        N('capacidad_empalme', 'Capacidad del empalme', 'A', alternativas=NO_IDENT),
        SEC('s_superficie', 'Superficie de montaje'),
        S('techo', 'Superficie', ['Zinc', 'Teja', 'Losa', 'Suelo', 'Otra']),
        N('superficie', 'Superficie disponible', 'm²', naturaleza='medido', cotizacion=['cantidad']),
        S('orientacion', 'Orientación', ['Norte', 'Noreste', 'Noroeste', 'Este', 'Oeste', 'Plana']),
        N('inclinacion', 'Inclinación', '°', alternativas=NO_MEDIDO),
        S('sombras', 'Sombras', ['Sin sombras', 'Sombras parciales', 'Sombras importantes', 'No verificado']),
        S('estado_techo', 'Estado de la superficie', ESTADO),
        F('fotos_techo', 'Fotos de la superficie'),
        SEC('s_equipos', 'Equipos y tableros'),
        T('espacio_inversor', 'Espacio para el inversor'),
        N('distancia_inversor', 'Distancia inversor – tablero', 'm', cotizacion=['cantidad']),
        S('baterias', 'Baterías', ['No', 'Sí', 'Por evaluar']),
        P('cargas_respaldo', 'Cargas que deben quedar respaldadas', si=('baterias', 'No', '≠')),
        V('integracion_ev', '¿Integración con cargador VE?'),
        N('generacion', 'Generación estimada', 'kWh/mes', alternativas=['Pendiente de cálculo'], naturaleza='estimado'),
    ],
    ['Se fotografió la superficie completa', 'Se revisaron sombras en distintas horas o con herramienta', 'Se pidieron las boletas'],
))

# M. Evaluación normativa SEC
P_LIST.append(plantilla(
    'SEC', 'Evaluación normativa y certificación SEC', 'electricidad',
    'Inspección preliminar o preparación para declaración de la instalación (TE1).',
    'Evaluar la instalación y su documentación. No reemplaza la verificación, ensayos ni la declaración formal ante la SEC.',
    INSTR + ' Una inspección visual no demuestra cumplimiento: indica qué falta verificar o ensayar.',
    'Evaluación preliminar de la instalación eléctrica respecto de la normativa vigente (DS N°8 y pliegos RIC aplicables).',
    [
        SEC('s_alcance', 'Alcance'),
        S('alcance', 'Alcance de la evaluación', ['Inspección preliminar', 'Preparación para declaración (TE1)',
          'Regularización de instalación existente'], requerido=True,
          ayuda='Una inspección preliminar no es una certificación.'),
        S('tipo_instalacion', 'Tipo de instalación', ['Vivienda', 'Local comercial', 'Oficina', 'Industrial', 'Otra']),
        SEC('s_documentos', 'Antecedentes documentales'),
        S('declaracion', 'Declaración anterior (TE1)', ['Sí', 'No'], alternativas=['No informado'], naturaleza='declarado'),
        S('planos', 'Planos', ['Disponibles y actualizados', 'Desactualizados', 'No hay']),
        P('modificaciones', 'Modificaciones posteriores a la declaración', naturaleza='declarado'),
        T('potencia', 'Potencia instalada o declarada'),
        SEC('s_revision', 'Revisión de la instalación'),
        *[S(k, e, ['Sin observaciones a la vista', 'Con observaciones', 'Deficiente', 'No verificado'], naturaleza='observado',
            alerta=['Deficiente'], cotizacion=['diagnostico'])
          for k, e in [('rev_tableros', 'Tableros'), ('rev_alimentadores', 'Alimentadores'), ('rev_protecciones', 'Protecciones'),
                       ('rev_diferenciales', 'Protección diferencial'), ('rev_conductores', 'Conductores'),
                       ('rev_canalizaciones', 'Canalizaciones'), ('rev_tierra', 'Puesta a tierra'), ('rev_rotulacion', 'Rotulación')]],
        P('observaciones_normativas', 'Observaciones normativas', cotizacion=['diagnostico']),
        *mediciones(),
        SEC('s_conclusion', 'Conclusión preliminar'),
        P('conclusion', 'Conclusión preliminar', requerido=True,
          ayuda='No afirmar cumplimiento normativo. Indicar qué se observó y qué falta verificar o ensayar.'),
    ],
    ['Se revisó la documentación disponible', 'Se dejó claro al cliente que es una evaluación preliminar',
     'Fotos de tableros y puesta a tierra'],
))

# Acta de entrega
ACTA = dict(
    codigo='ACTA-ENT', nombre='Acta de entrega de trabajos', tipo='entrega', tipo_servicio=None,
    descripcion='Recepción del trabajo terminado, con pruebas y firma del cliente.',
    objetivo='Dejar constancia de lo ejecutado, las pruebas realizadas y la recepción conforme.',
    instrucciones='Detalla lo ejecutado y las pruebas. Separa lo ejecutado de lo recomendado o pendiente.',
    intro='Acta de entrega de los trabajos ejecutados.',
    campos=[
        SEC('s_ejecutado', 'Trabajos ejecutados'),
        L('ejecutados', 'Trabajo ejecutado', [T('descripcion', 'Trabajo'), T('ubicacion', 'Ubicación'), N('cantidad', 'Cantidad'),
          S('unidad', 'Unidad', UNIDADES)]),
        SEC('s_pruebas', 'Pruebas y mediciones'),
        M('pruebas', 'Pruebas realizadas', ['Continuidad', 'Aislación', 'Prueba de diferenciales', 'Resistencia de tierra',
          'Funcionamiento con el cliente', 'Configuración entregada']),
        L('mediciones', 'Medición', [T('punto', 'Punto'), T('magnitud', 'Magnitud'), N('valor', 'Valor'),
          S('resultado', 'Resultado', ['Normal', 'Fuera de rango'])], naturaleza='medido', alerta=['Fuera de rango']),
        SEC('s_entrega', 'Entrega'),
        T('garantia', 'Garantía'),
        P('recomendaciones', 'Recomendaciones de uso y mantención'),
        P('pendientes', 'Pendientes', cotizacion=['pendiente']),
    ],
    checklist=[{'texto': t} for t in ['Se probaron las protecciones', 'Se entregó la instalación limpia',
                                      'Se explicó el funcionamiento al cliente']],
)
P_LIST.append(ACTA)


def q(texto):
    """Texto SQL con dólar: no hay que escapar nada."""
    if texto is None:
        return 'NULL'
    assert '$t$' not in texto
    return f'$t${texto}$t$'


def sql():
    out = []
    for p in P_LIST:
        out.append(
            'INSERT INTO public.informe_plantillas (codigo, nombre, tipo, tipo_servicio, descripcion, objetivo, instrucciones, intro, campos, checklist, estado, version)\n'
            f"VALUES ({q(p['codigo'])}, {q(p['nombre'])}, {q(p['tipo'])}, {q(p['tipo_servicio'])}, {q(p['descripcion'])},\n"
            f"  {q(p['objetivo'])}, {q(p['instrucciones'])}, {q(p['intro'])},\n"
            f"  $j${json.dumps(p['campos'], ensure_ascii=False)}$j$::JSONB,\n"
            f"  $j${json.dumps(p['checklist'], ensure_ascii=False)}$j$::JSONB, 'activa', 1)\n"
            'ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO NOTHING;'
        )
    return '\n\n'.join(out)


if __name__ == '__main__':
    s = io.open(SQL, encoding='utf-8').read()
    s = re.sub(r'-- @@PLANTILLAS@@.*?-- @@FIN@@', lambda _: '-- @@PLANTILLAS@@\n' + sql() + '\n-- @@FIN@@', s, flags=re.S)
    io.open(SQL, 'w', encoding='utf-8', newline='\n').write(s)
    total = sum(len([c for c in p['campos'] if c['tipo'] != 'seccion']) for p in P_LIST)
    print(f'{len(P_LIST)} plantillas, {total} preguntas')
    for p in P_LIST:
        print(f"  {p['codigo']:9} {len([c for c in p['campos'] if c['tipo'] != 'seccion']):3} preguntas · {p['nombre']}")
