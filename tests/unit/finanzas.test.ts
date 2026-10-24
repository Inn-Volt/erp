// Pruebas de la lógica de dinero (node --test). Correr: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoRut, formatearRut, rutValido } from '../../lib/rut.ts';
import { fechaCL, numeroCL, parsearCartola, sugerirCobro, sugerirCompra } from '../../lib/cartola.ts';
import { desglosarCobro, ivaDelMes } from '../../lib/contabilidad.ts';

test('RUT: dígito verificador y formato', () => {
  assert.ok(rutValido('12.345.678-5'));
  assert.ok(rutValido('76543210-3'));
  assert.ok(!rutValido('12.345.678-9'));
  assert.ok(!rutValido(''));
  assert.equal(formatearRut('123456785'), '12.345.678-5');
  assert.equal(avisoRut(''), null);
  assert.ok(avisoRut('1-1'));
});

test('Cartola: números y fechas chilenas', () => {
  assert.equal(numeroCL('1.234.567'), 1234567);
  assert.equal(numeroCL('$ 1.234,50'), 1234.5);
  assert.equal(numeroCL('(5.000)'), -5000);
  assert.equal(numeroCL('12,000'), 12000);
  assert.equal(numeroCL(''), null);
  assert.equal(fechaCL('31/01/2026'), '2026-01-31');
  assert.equal(fechaCL('5-2-26'), '2026-02-05');
  assert.equal(fechaCL('Saldo'), null);
});

test('Cartola: cargos y abonos separados, huellas estables', () => {
  const txt = `Cuenta;00-123
Fecha;Descripción;N° Docto;Cargos (CLP);Abonos (CLP);Saldo
02/10/2026;TRANSFERENCIA CLINICA FACT 1520;0;;1.202.983;5.000.000
03/10/2026;PAGO ELECTRO SUR;123;595.000;;4.405.000
03/10/2026;COMISION;0;5.990;;4.399.010
03/10/2026;COMISION;0;5.990;;4.393.020`;
  const r = parsearCartola(txt);
  assert.equal(r.movimientos.length, 4);
  assert.equal(r.movimientos[0].monto, 1202983);
  assert.equal(r.movimientos[1].monto, -595000);
  assert.equal(r.movimientos[0].referencia, null);
  assert.notEqual(r.movimientos[2].huella, r.movimientos[3].huella);
  assert.deepEqual(parsearCartola(txt).movimientos.map(m => m.huella), r.movimientos.map(m => m.huella));
  const cobros = [
    { id: 'a', saldo: 1202983, numero_factura: '1520', cliente: 'Clínica' },
    { id: 'b', saldo: 350000, numero_factura: '1530', cliente: 'Juan Pérez' },
    { id: 'c', saldo: 350000, numero_factura: '1531', cliente: 'María Soto' },
  ];
  assert.equal(sugerirCobro(r.movimientos[0], cobros)?.id, 'a');
  assert.equal(sugerirCobro({ monto: 350000, descripcion: 'Transferencia de Juan Perez' }, cobros)?.id, 'b');
  assert.equal(sugerirCobro({ monto: 350000, descripcion: 'transferencia' }, cobros), null);
  assert.equal(sugerirCompra(r.movimientos[1], [{ id: 'k', total: 595000, folio: '123', proveedor: 'Electro Sur' }])?.id, 'k');
});

test('Libro de ventas: neto, exento e IVA en la proporción de la cotización', () => {
  assert.deepEqual(desglosarCobro(595000, { subtotal: 1000000, iva: 190000, total: 1190000 }), { neto: 500000, exento: 0, iva: 95000, total: 595000 });
  assert.deepEqual(desglosarCobro(1390000, { subtotal: 1200000, iva: 190000, total: 1390000 }), { neto: 1000000, exento: 200000, iva: 190000, total: 1390000 });
  assert.deepEqual(desglosarCobro(119000, null), { neto: 100000, exento: 0, iva: 19000, total: 119000 });
  const h = desglosarCobro(695000, { subtotal: 1200000, iva: 190000, total: 1390000 });
  assert.equal(h.neto + h.exento + h.iva, 695000);
  assert.deepEqual(ivaDelMes(190000, 50000), { debito: 190000, credito: 50000, aPagar: 140000, remanente: 0 });
  assert.equal(ivaDelMes(10000, 50000).remanente, 40000);
});
