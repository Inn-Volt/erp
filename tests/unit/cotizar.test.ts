// Pruebas de «cotizar rápido»: cantidad escrita en el buscador y listas pegadas. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidatos, parsearLista, separarCantidad } from '../../lib/cotizador/pegarLista.ts';

test('Cantidad escrita junto al producto', () => {
  assert.deepEqual(separarCantidad('12 enchufe doble'), { cantidad: 12, texto: 'enchufe doble' });
  assert.deepEqual(separarCantidad('12x enchufe'), { cantidad: 12, texto: 'enchufe' });
  assert.deepEqual(separarCantidad('enchufe doble x 12'), { cantidad: 12, texto: 'enchufe doble' });
  assert.deepEqual(separarCantidad('Tablero 12 polos: 2'), { cantidad: 2, texto: 'Tablero 12 polos' });
  assert.deepEqual(separarCantidad('cable 2,5 mm 100 metros'), { cantidad: 1, texto: 'cable 2,5 mm 100 metros' });
  assert.deepEqual(separarCantidad('panel led 60x60'), { cantidad: 1, texto: 'panel led 60x60' });
  assert.deepEqual(separarCantidad('2,5 mm cable'), { cantidad: 1, texto: '2,5 mm cable' });
  assert.deepEqual(separarCantidad('3 un. foco LED'), { cantidad: 3, texto: 'foco LED' });
  assert.deepEqual(separarCantidad('foco LED 3 un'), { cantidad: 3, texto: 'foco LED' });
  assert.deepEqual(separarCantidad('automático 16A'), { cantidad: 1, texto: 'automático 16A' });
});

test('Lista pegada de WhatsApp, numerada o desde Excel', () => {
  assert.deepEqual(parsearLista('- 12 enchufes dobles\n• 9 paneles LED 60x60\nTablero 12 polos x 1\n\n'), [
    { cantidad: 12, texto: 'enchufes dobles' }, { cantidad: 9, texto: 'paneles LED 60x60' }, { cantidad: 1, texto: 'Tablero 12 polos' },
  ]);
  assert.deepEqual(parsearLista('1. Enchufe doble x 4\n2. Interruptor 9/12\n3. Foco LED'), [
    { cantidad: 4, texto: 'Enchufe doble' }, { cantidad: 1, texto: 'Interruptor 9/12' }, { cantidad: 1, texto: 'Foco LED' },
  ]);
  assert.deepEqual(parsearLista('Enchufe doble\t12\t$4.990\nPanel LED\t9'), [
    { cantidad: 12, texto: 'Enchufe doble' }, { cantidad: 9, texto: 'Panel LED' },
  ]);
});

test('Encuentra en la biblioteca lo que más se parece', () => {
  const a = (id: string, descripcion: string, extra: Record<string, unknown> = {}) =>
    ({ id, descripcion, categoria: 'material', unidad: 'un', precio_venta: 1000, costo: 500, activo: true, ...extra }) as never;
  const cat = [
    a('1', 'Enchufe doble 10A con tapa'), a('2', 'Enchufe doble 10A con USB y luz piloto'), a('3', 'Panel LED 60x60 40W'),
    a('4', 'Tablero 12 polos con puerta'), a('5', 'Enchufe triple', { precio_venta: null }), a('6', 'Cable THHN 2,5 mm²', { codigo: 'CAB25' }),
  ];
  assert.equal(candidatos('enchufes dobles', cat)[0].id, '1');
  assert.equal(candidatos('paneles LED 60x60', cat)[0].id, '3');
  assert.equal(candidatos('tablero 12 polos', cat)[0].id, '4');
  assert.equal(candidatos('cab25', cat)[0].id, '6');
  assert.equal(candidatos('enchufe triple', cat).some(x => x.id === '5'), false, 'sin precio no se ofrece');
  assert.equal(candidatos('bomba de agua', cat).length, 0);
});
