// «Leer con IA» (fase 20): lo que responde la IA se ordena antes de prellenar el formulario. Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fechaLeida, montoLeido, normalizarDocumento, tipoLeido } from '../../lib/leerDocumento.ts';

test('Una factura bien leída: RUT formateado, montos enteros y sin avisos', () => {
  const r = normalizarDocumento({
    tipo_doc: 'factura', folio: 'N° 555', fecha: '2026-11-23', proveedor_nombre: '  Distribuidora   Eléctrica SpA ', proveedor_rut: '761234560',
    neto: 100000, iva: 19000, exento: 0, total: '$119.000', descripcion: 'Cable 6 mm²',
  });
  assert.deepEqual(r.doc, {
    tipo_doc: 'factura', folio: '555', fecha: '2026-11-23', proveedor_nombre: 'Distribuidora Eléctrica SpA', proveedor_rut: '76.123.456-0',
    neto: 100000, iva: 19000, exento: 0, total: 119000, descripcion: 'Cable 6 mm²',
  });
  assert.deepEqual(r.avisos, []);
  assert.deepEqual(r.leidos, ['tipo_doc', 'folio', 'fecha', 'proveedor_nombre', 'proveedor_rut', 'neto', 'iva', 'total', 'descripcion']);
});

test('Si neto + IVA + exento no da el total, avisa', () => {
  const r = normalizarDocumento({ tipo_doc: 'factura', neto: 100000, iva: 19000, exento: 0, total: 120000 });
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0], /no da el total/);
});

test('Un RUT que no calza se deja tal cual y avisa', () => {
  const r = normalizarDocumento({ tipo_doc: 'boleta', proveedor_rut: '12.345.678-9', total: 5000 });
  assert.equal(r.doc.proveedor_rut, '12.345.678-9');
  assert.match(r.avisos[0], /RUT/);
});

test('Boleta con solo el total: no compara partes; sin total, el total sale de las partes', () => {
  assert.deepEqual(normalizarDocumento({ tipo_doc: 'boleta', total: 23800 }).avisos, []);
  assert.equal(normalizarDocumento({ tipo_doc: 'factura', neto: 1000, iva: 190 }).doc.total, 1190);
});

test('Tipo de documento, montos y fechas en las formas que suele devolver la IA', () => {
  assert.equal(tipoLeido('Factura Electrónica'), 'factura');
  assert.equal(tipoLeido('FACTURA NO AFECTA O EXENTA'), 'factura_exenta');
  assert.equal(tipoLeido('Nota de Crédito'), 'nota_credito');
  assert.equal(tipoLeido('Boleta electrónica'), 'boleta');
  assert.equal(tipoLeido('voucher'), 'otro');
  assert.equal(montoLeido('$ 1.234.567'), 1234567);
  assert.equal(montoLeido('1.234,50'), 1235);
  assert.equal(montoLeido(-500), 500);
  assert.equal(montoLeido(''), 0);
  assert.equal(fechaLeida('23-11-2026'), '2026-11-23');
  assert.equal(fechaLeida('3/1/2026'), '2026-01-03');
  assert.equal(fechaLeida('2026-02-30'), '');
  assert.equal(fechaLeida('ayer'), '');
});

test('Una respuesta vacía o rara no rompe nada', () => {
  const r = normalizarDocumento(null);
  assert.equal(r.doc.tipo_doc, 'otro');
  assert.equal(r.doc.total, 0);
  assert.deepEqual(r.leidos, []);
});
