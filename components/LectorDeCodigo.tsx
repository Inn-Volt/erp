'use client';

/**
 * LectorDeCodigo — lee códigos de barra y QR con la cámara (portado de TecApp).
 *
 * · Donde el navegador trae decodificador propio (Android, Chrome en Mac) se usa ese: instantáneo.
 * · Donde no (iPhone/Safari, Chrome en Windows) se descarga @zxing/library SOLO en ese equipo.
 * · La cámara se pide en alta resolución y con enfoque continuo: en 640×480 un código lineal
 *   no se puede leer.
 * · Cada código se confirma leyéndolo varias veces seguidas: un código de barras borroso puede
 *   decodificarse mal una vez, pero el error no se repite idéntico.
 * · getUserMedia solo existe en https (o localhost); si no, se dice en pantalla.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, ScanLine, Flashlight, Loader2 } from 'lucide-react';

const NOMBRE_DE_FORMATO: Record<string, string> = {
  qr_code: 'QR', code_128: 'código de barras', code_39: 'código de barras', code_93: 'código de barras',
  codabar: 'código de barras', ean_13: 'EAN-13', ean_8: 'EAN-8', upc_a: 'UPC-A', upc_e: 'UPC-E',
  itf: 'ITF', data_matrix: 'Data Matrix', pdf417: 'PDF417', aztec: 'Aztec',
};

const CONFIRMACIONES = 3;
const CONFIRMACIONES_ITF = 5; // ITF puede entregar un código recortado que parece válido
/**
 * Un código aceptado no se vuelve a contar mientras siga frente al lente: para sumar otra
 * unidad del mismo material hay que sacarlo de la vista al menos este tiempo y volver a apuntar.
 */
const AUSENCIA_PARA_REPETIR_MS = 1000;

const FORMATOS_DESEADOS = [
  'code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'itf',
  'upc_a', 'upc_e', 'qr_code', 'data_matrix', 'pdf417', 'aztec',
];

type RestriccionesDeCamara = MediaTrackConstraints & {
  advanced?: ({ focusMode?: string; zoom?: number; torch?: boolean } & MediaTrackConstraintSet)[];
};
type Detector = { detect: (fuente: CanvasImageSource) => Promise<{ rawValue: string; format?: string }[]> };
type ConstructorDetector = new (opciones?: { formats?: string[] }) => Detector;

function decodificadorNativo(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

const FORMATO_ZXING: Record<number, string> = {
  0: 'aztec', 1: 'codabar', 2: 'code_39', 3: 'code_93', 4: 'code_128', 5: 'data_matrix',
  6: 'ean_8', 7: 'ean_13', 8: 'itf', 10: 'pdf417', 11: 'qr_code', 14: 'upc_a', 15: 'upc_e',
};

/** Decodificador en JavaScript para navegadores sin BarcodeDetector. */
async function decodificadorDeRespaldo(): Promise<Detector> {
  const zxing = await import('@zxing/library');
  const lector = new zxing.MultiFormatReader();
  const pistas = new Map();
  pistas.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [
    zxing.BarcodeFormat.QR_CODE, zxing.BarcodeFormat.CODE_128, zxing.BarcodeFormat.CODE_39,
    zxing.BarcodeFormat.CODE_93, zxing.BarcodeFormat.CODABAR, zxing.BarcodeFormat.EAN_13,
    zxing.BarcodeFormat.EAN_8, zxing.BarcodeFormat.ITF, zxing.BarcodeFormat.UPC_A,
    zxing.BarcodeFormat.UPC_E, zxing.BarcodeFormat.DATA_MATRIX, zxing.BarcodeFormat.PDF_417,
    zxing.BarcodeFormat.AZTEC,
  ]);
  pistas.set(zxing.DecodeHintType.TRY_HARDER, true);
  lector.setHints(pistas);

  const lienzo = document.createElement('canvas');
  const pincel = lienzo.getContext('2d', { willReadFrequently: true });

  return {
    detect(fuente: CanvasImageSource) {
      const video = fuente as HTMLVideoElement;
      const anchoReal = video.videoWidth || 0;
      const altoReal = video.videoHeight || 0;
      if (!pincel || anchoReal === 0 || altoReal === 0) return Promise.resolve([]);
      // 1024 px de ancho alcanzan para un código lineal y un teléfono medio decodifica a tiempo.
      const escala = Math.min(1, 1024 / anchoReal);
      const ancho = Math.round(anchoReal * escala);
      const alto = Math.round(altoReal * escala);
      lienzo.width = ancho;
      lienzo.height = alto;
      pincel.drawImage(video, 0, 0, ancho, alto);
      const pixeles = pincel.getImageData(0, 0, ancho, alto).data;
      const gris = new Uint8ClampedArray(ancho * alto);
      for (let i = 0, j = 0; j < gris.length; i += 4, j++) {
        gris[j] = (pixeles[i] * 299 + pixeles[i + 1] * 587 + pixeles[i + 2] * 114) / 1000;
      }
      try {
        const mapa = new zxing.BinaryBitmap(new zxing.HybridBinarizer(new zxing.RGBLuminanceSource(gris, ancho, alto)));
        const leido = lector.decode(mapa);
        return Promise.resolve([{ rawValue: leido.getText(), format: FORMATO_ZXING[leido.getBarcodeFormat() as number] ?? '' }]);
      } catch {
        return Promise.resolve([]); // cuadro sin código: el caso normal
      } finally {
        lector.reset();
      }
    },
  };
}

export interface ResultadoLectura {
  ok: boolean;
  mensaje: string;
}

interface Props {
  titulo?: string;
  /** Recibe cada código confirmado y responde qué se hizo con él (se muestra en pantalla). */
  onLeido: (codigo: string) => ResultadoLectura;
  onCerrar: () => void;
}

export default function LectorDeCodigo({ titulo = 'Escanear código o QR', onLeido, onCerrar }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const pista = useRef<MediaStreamTrack | null>(null);
  /** Último código aceptado y cuándo se vio por última vez (null = se puede repetir). */
  const bloqueo = useRef<{ valor: string; visto: number } | null>(null);
  const candidato = useRef<{ valor: string; formato: string; veces: number } | null>(null);
  // onLeido cambia en cada render del padre; se lee por ref para no reiniciar la cámara.
  const onLeidoRef = useRef(onLeido);
  useEffect(() => { onLeidoRef.current = onLeido; }, [onLeido]);

  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<ResultadoLectura | null>(null);
  const [preparando, setPreparando] = useState(true);
  const [aceptados, setAceptados] = useState(0);
  const [confirmando, setConfirmando] = useState<{ veces: number; de: number } | null>(null);
  const [zoom, setZoom] = useState<{ min: number; max: number; valor: number } | null>(null);
  const [hayLinterna, setHayLinterna] = useState(false);
  const [linterna, setLinterna] = useState(false);

  const manejar = useCallback((codigo: string, formato: string) => {
    bloqueo.current = { valor: codigo, visto: Date.now() };
    const r = onLeidoRef.current(codigo);
    const tipo = formato ? ` · ${NOMBRE_DE_FORMATO[formato] ?? formato}` : '';
    setAviso({ ok: r.ok, mensaje: `${r.mensaje}${r.ok ? tipo : ''}` });
    if (r.ok) {
      setAceptados(n => n + 1);
      navigator.vibrate?.(60); // confirma sin mirar la pantalla
    }
  }, []);

  useEffect(() => {
    // `activo` es local a ESTA ejecución del efecto (no un ref compartido): si el efecto se
    // desmonta mientras espera la cámara —React en desarrollo lo monta dos veces—, esa
    // ejecución se detiene sola y suelta su cámara, en vez de pelear con la nueva.
    let activo = true;
    let flujo: MediaStream | null = null;

    async function arrancar() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin-https');
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (!activo) { flujo.getTracks().forEach(t => t.stop()); return; }

        const track = flujo.getVideoTracks()[0];
        pista.current = track;
        const capacidades = (track.getCapabilities?.() ?? {}) as {
          focusMode?: string[]; zoom?: { min: number; max: number }; torch?: boolean;
        };
        if (capacidades.focusMode?.includes('continuous')) {
          try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as RestriccionesDeCamara); } catch { /* se lee igual */ }
        }
        if (capacidades.zoom) {
          setZoom({ min: capacidades.zoom.min, max: capacidades.zoom.max, valor: (track.getSettings() as { zoom?: number }).zoom ?? capacidades.zoom.min });
        }
        setHayLinterna(Boolean(capacidades.torch));

        if (video.current) {
          video.current.srcObject = flujo;
          await video.current.play();
        }
        if (!activo) return;

        let detector: Detector;
        try {
          if (decodificadorNativo()) {
            const Constructor = (window as unknown as {
              BarcodeDetector: ConstructorDetector & { getSupportedFormats: () => Promise<string[]> };
            }).BarcodeDetector;
            const soportados = await Constructor.getSupportedFormats();
            const formatos = FORMATOS_DESEADOS.filter(f => soportados.includes(f));
            detector = new Constructor(formatos.length > 0 ? { formats: formatos } : undefined);
          } else {
            detector = await decodificadorDeRespaldo();
          }
        } catch {
          if (!activo) return;
          setPreparando(false);
          setError('No se pudo cargar el lector de códigos. Revisa la conexión e inténtalo de nuevo, o escribe el código a mano.');
          return;
        }
        if (!activo) return;
        setPreparando(false);

        const mirar = async () => {
          if (!activo || !video.current) return;
          try {
            const encontrados = await detector.detect(video.current);
            const valor = encontrados[0]?.rawValue?.trim();
            const ahora = Date.now();
            const b = bloqueo.current;
            if (b) {
              if (valor === b.valor) b.visto = ahora;                                    // sigue a la vista
              else if (ahora - b.visto > AUSENCIA_PARA_REPETIR_MS) bloqueo.current = null; // salió: se libera
            }
            if (valor && valor !== bloqueo.current?.valor) {
              const formato = encontrados[0].format ?? '';
              const falta = formato === 'itf' ? CONFIRMACIONES_ITF : CONFIRMACIONES;
              const previo = candidato.current;
              candidato.current = previo && previo.valor === valor
                ? { ...previo, veces: previo.veces + 1 }
                : { valor, formato, veces: 1 };
              if (candidato.current.veces >= falta) {
                candidato.current = null;
                setConfirmando(null);
                manejar(valor, formato);
              } else {
                setConfirmando({ veces: candidato.current.veces, de: falta });
              }
            }
          } catch { /* un cuadro fallido no interrumpe */ }
          if (activo) setTimeout(mirar, 150);
        };
        mirar();
      } catch (e) {
        if (!activo) return;
        setPreparando(false);
        if (!navigator.mediaDevices?.getUserMedia) {
          setError('El navegador solo entrega la cámara por una conexión segura (https). Abre el ERP desde su dirección https o escribe el código a mano.');
          return;
        }
        setError(e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'No se dio permiso para usar la cámara. Actívalo en el navegador o escribe el código a mano.'
          : 'No se pudo abrir la cámara. Puedes escribir el código a mano.');
      }
    }

    arrancar();
    return () => {
      // Apagar la cámara al cerrar (si no, la luz queda encendida y el teléfono se calienta).
      activo = false;
      pista.current = null;
      candidato.current = null;
      flujo?.getTracks().forEach(t => t.stop());
    };
  }, [manejar]);

  async function cambiarZoom(valor: number) {
    setZoom(z => (z ? { ...z, valor } : z));
    try { await pista.current?.applyConstraints({ advanced: [{ zoom: valor }] } as RestriccionesDeCamara); } catch { /* sin cambio */ }
  }

  async function alternarLinterna() {
    const siguiente = !linterna;
    try {
      await pista.current?.applyConstraints({ advanced: [{ torch: siguiente }] } as RestriccionesDeCamara);
      setLinterna(siguiente);
    } catch {
      setHayLinterna(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 260 }} onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
      <div className="modal-box" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border2)' }}>
          <p className="section-label" style={{ margin: 0 }}><ScanLine size={16} /> {titulo}</p>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '1rem 1.25rem' }}>
          {error ? (
            <p style={{ background: 'var(--danger-soft)', color: 'var(--danger)', borderRadius: 10, padding: '0.75rem', fontSize: '0.88rem', lineHeight: 1.45 }}>{error}</p>
          ) : (
            <>
              <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 12, background: '#000' }}>
                <video ref={video} muted playsInline style={{ display: 'block', width: '100%', height: 'min(52vh, 320px)', objectFit: 'cover' }} />
                {/* Guía ancha y baja, con la forma de un código lineal */}
                <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ height: 96, width: '85%', borderRadius: 10, border: '2px solid var(--y-brand)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.25)' }} />
                </div>
                {preparando && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#fff', fontSize: '0.85rem' }}>
                    <Loader2 size={16} className="iv-spin" /> Abriendo cámara…
                  </div>
                )}
                {hayLinterna && (
                  <button onClick={alternarLinterna} className="btn btn-sm"
                    style={{ position: 'absolute', right: 10, top: 10, background: linterna ? '#fff' : 'rgba(0,0,0,0.6)', color: linterna ? '#000' : '#fff', border: 'none' }}>
                    <Flashlight size={14} /> {linterna ? 'Apagar' : 'Luz'}
                  </button>
                )}
              </div>

              {zoom && zoom.max > zoom.min && (
                <label style={{ display: 'block', marginTop: '0.75rem' }}>
                  <span className="label-muted" style={{ display: 'block', marginBottom: 4 }}>Acercar (mejor que pegar el teléfono a la etiqueta)</span>
                  <input type="range" min={zoom.min} max={zoom.max} step={(zoom.max - zoom.min) / 20 || 0.1} value={zoom.valor}
                    onChange={e => cambiarZoom(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--y-brand)' }} />
                </label>
              )}

              <div style={{ minHeight: 44, marginTop: '0.75rem' }}>
                {aviso ? (
                  <p style={{ fontSize: '0.9rem', fontWeight: 500, color: aviso.ok ? 'var(--success)' : 'var(--text)' }}>{aviso.mensaje}</p>
                ) : confirmando ? (
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Confirmando lectura… {confirmando.veces}/{confirmando.de}</p>
                ) : (
                  <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                    Apunta al código de barras o QR del material. Puedes leer varios seguidos sin cerrar; para sumar otra unidad del mismo, retíralo de la vista y vuelve a apuntar. Si no enfoca, aléjate unos 15 cm.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div style={{ padding: '0.85rem 1.25rem', borderTop: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{aceptados > 0 ? `${aceptados} ${aceptados === 1 ? 'lectura agregada' : 'lecturas agregadas'}` : ''}</span>
          <button onClick={onCerrar} className="btn btn-primary">Listo</button>
        </div>
      </div>
    </div>
  );
}
