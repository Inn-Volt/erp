"""
Plantilla «Protocolo de pruebas eléctricas» (fase 15): pruebas de entrega que respaldan la
garantía y la declaración TE1 ante la SEC. Genera su INSERT en supabase_fase15_revision.sql
(entre @@PROTOCOLO@@ y @@FIN@@). Si ya existe una plantilla con el código PROT-PRU, no se toca.

    python scripts/plantilla_protocolo.py
"""
import io
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, 'scripts'))
from plantillas_levantamiento import SEC, T, P, N, S, M, L, FE, FIR, F, V, q  # noqa: E402

SQL = os.path.join(RAIZ, 'supabase_fase15_revision.sql')
RESULTADO = ['Cumple', 'No cumple', 'No medido']

PROTOCOLO = dict(
    codigo='PROT-PRU', nombre='Protocolo de pruebas eléctricas', tipo='entrega', tipo_servicio='electricidad',
    descripcion='Mediciones de entrega: aislación, continuidad de tierras, puesta a tierra, diferenciales, tensiones y corrientes.',
    objetivo='Dejar constancia medida de que la instalación entregada funciona y es segura; respalda la garantía y la declaración TE1.',
    instrucciones=('Anota lo que mediste, con el instrumento usado. Si algo no se pudo medir, elige «No medido»: '
                   'nunca escribas un valor que no mediste. Saca foto de la pantalla del instrumento en las mediciones clave.'),
    intro='Protocolo de pruebas eléctricas de la instalación entregada.',
    campos=[
        SEC('s_datos', 'Instalación e instrumento'),
        T('cliente', 'Cliente', precarga='cliente'),
        T('direccion', 'Dirección', precarga='direccion'),
        S('sistema', 'Sistema', ['Monofásico', 'Trifásico'], requerido=True),
        N('tension_nominal', 'Tensión nominal', 'V', placeholder='220 / 380'),
        T('tablero', 'Tablero ensayado', placeholder='TDA piso 2, TG…'),
        T('instrumento', 'Instrumento (marca, modelo y N° de serie)', requerido=True),
        FE('calibracion', 'Fecha de la última calibración'),

        SEC('s_aislacion', 'Resistencia de aislación'),
        L('aislacion', 'Circuito', [T('circuito', 'Circuito'), S('tension_ensayo', 'Tensión de ensayo', ['250 V', '500 V', '1000 V']),
          N('resistencia', 'Resistencia', 'MΩ'), S('resultado', 'Resultado', RESULTADO)],
          naturaleza='medido', alerta=['No cumple'], cotizacion=['evidencia'],
          ayuda='Con el circuito desenergizado y las cargas desconectadas. Referencia habitual en BT: ≥ 0,5 MΩ ensayando a 500 V CC (revisa el pliego vigente).'),

        SEC('s_continuidad', 'Continuidad de conductores de protección'),
        L('continuidad', 'Punto', [T('punto', 'Punto / circuito'), N('resistencia', 'Resistencia', 'Ω'), S('resultado', 'Resultado', RESULTADO)],
          naturaleza='medido', alerta=['No cumple'], ayuda='Entre la barra de tierra del tablero y cada punto (enchufes, carcasas).'),

        SEC('s_tierra', 'Puesta a tierra'),
        S('tierra_metodo', 'Método', ['Caída de potencial (3 puntos)', 'Pinza de tierra', 'Otro']),
        N('tierra_resistencia', 'Resistencia medida', 'Ω', naturaleza='medido'),
        N('tierra_maximo', 'Valor máximo exigido para esta instalación', 'Ω'),
        S('tierra_resultado', 'Resultado', RESULTADO, alerta=['No cumple'], naturaleza='medido'),
        F('tierra_foto', 'Foto del instrumento (puesta a tierra)'),

        SEC('s_diferenciales', 'Protecciones diferenciales'),
        L('diferenciales', 'Diferencial', [T('circuito', 'Circuito / ubicación'), S('sensibilidad', 'Sensibilidad IΔn', ['30 mA', '300 mA', 'Otra']),
          N('tiempo', 'Tiempo de disparo a IΔn', 'ms'), S('boton', 'Botón de prueba', ['Opera', 'No opera']), S('resultado', 'Resultado', RESULTADO)],
          naturaleza='medido', alerta=['No cumple', 'No opera'],
          ayuda='Con instrumento de prueba de diferenciales. Referencia habitual: dispara en ≤ 300 ms a IΔn.'),

        SEC('s_tensiones', 'Tensiones y corrientes'),
        N('v_l1n', 'Tensión L1-N', 'V', naturaleza='medido'),
        N('v_l2n', 'Tensión L2-N', 'V', naturaleza='medido', si=('sistema', 'Trifásico')),
        N('v_l3n', 'Tensión L3-N', 'V', naturaleza='medido', si=('sistema', 'Trifásico')),
        N('v_ll', 'Tensión entre fases', 'V', naturaleza='medido', si=('sistema', 'Trifásico')),
        N('v_nt', 'Tensión neutro-tierra', 'V', naturaleza='medido'),
        N('i_l1', 'Corriente L1', 'A', naturaleza='medido'),
        N('i_l2', 'Corriente L2', 'A', naturaleza='medido', si=('sistema', 'Trifásico')),
        N('i_l3', 'Corriente L3', 'A', naturaleza='medido', si=('sistema', 'Trifásico')),
        V('polaridad', 'Polaridad de enchufes verificada'),

        SEC('s_resultado', 'Resultado'),
        S('resultado_general', 'Resultado general', ['Conforme', 'Conforme con observaciones', 'No conforme'],
          requerido=True, alerta=['No conforme']),
        P('observaciones', 'Observaciones y correcciones pendientes', cotizacion=['pendiente']),
        FIR('firma_tecnico', 'Firma del técnico'),
        FIR('firma_cliente', 'Firma de quien recibe'),
    ],
    checklist=[{'texto': t} for t in ['Se desenergizó antes de medir aislación', 'Se reconectaron las cargas y se probó todo',
                                      'Se dejaron rotulados los circuitos', 'Se entregó copia al cliente']],
)


def sql():
    p = PROTOCOLO
    return (
        'INSERT INTO public.informe_plantillas (codigo, nombre, tipo, tipo_servicio, descripcion, objetivo, instrucciones, intro, campos, checklist, estado, version)\n'
        f"VALUES ({q(p['codigo'])}, {q(p['nombre'])}, {q(p['tipo'])}, {q(p['tipo_servicio'])}, {q(p['descripcion'])},\n"
        f"  {q(p['objetivo'])}, {q(p['instrucciones'])}, {q(p['intro'])},\n"
        f"  $j${json.dumps(p['campos'], ensure_ascii=False)}$j$::JSONB,\n"
        f"  $j${json.dumps(p['checklist'], ensure_ascii=False)}$j$::JSONB, 'activa', 1)\n"
        'ON CONFLICT (codigo) WHERE codigo IS NOT NULL DO NOTHING;'
    )


if __name__ == '__main__':
    s = io.open(SQL, encoding='utf-8').read()
    s = re.sub(r'-- @@PROTOCOLO@@.*?-- @@FIN@@', lambda _: '-- @@PROTOCOLO@@\n' + sql() + '\n-- @@FIN@@', s, flags=re.S)
    io.open(SQL, 'w', encoding='utf-8', newline='\n').write(s)
    print('ok:', len([c for c in PROTOCOLO['campos'] if c['tipo'] != 'seccion']), 'preguntas')
