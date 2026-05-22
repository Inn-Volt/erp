'use client';

import { PDFViewer } from '@react-pdf/renderer';
import PresupuestoPDF from '@/components/pdf/PresupuestoPDF'; // tu ruta real

export default function TestPDFPage() {
  return (
    <PDFViewer
      style={{
        width: '100vw',
        height: '100vh',
        border: 'none',
      }}
    >
      <PresupuestoPDF
        cliente={{
          id: '1',
          estado: 'activo',
          nombre_cliente: 'Cliente Demo',
        } as any}
        items={[] as any}
        totals={{
          netoMateriales: 100000,
          ivaMateriales: 19000,
          netoMO: 250000,
          netoServicios: 50000,
          netoGeneral: 400000,
          ivaGeneral: 76000,
          total: 476000,
        } as any}
        descuentoPorcentajeMO={0}
        folio="TEST-001"
        descripcionGeneral="Vista previa PDF"
        garantia="12 meses"
        condicionesComerciales=""
        ocultarSuministros={false}
        empresa={{
          nombre: 'INNVOLT SPA',
          rut: '78.299.986-9',
          email: 'inn-volt@outlook.cl',
          telefono: '+56 9 6657 5447',
        } as any}
      />
    </PDFViewer>
  );
}