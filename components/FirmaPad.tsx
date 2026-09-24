'use client';

/**
 * FirmaPad — firma con el dedo (o mouse) que entrega un PNG como data URI (portado de TecApp).
 * El trazo se suaviza con curvas cuadráticas entre puntos medios para que no se vea quebrado.
 * Usa Pointer Events + `touch-action: none`: así el dedo dibuja en vez de desplazar la página.
 */

import { useEffect, useRef } from 'react';

type Punto = { x: number; y: number };

interface Props {
  /** Recibe el PNG (data URI) al terminar cada trazo, o '' al borrar. */
  onChange: (dataUri: string) => void;
  alto?: number;
  colorBorde?: string;
  colorTexto?: string;
}

export default function FirmaPad({ onChange, alto = 170, colorBorde = '#d9d9d9', colorTexto = '#6b6b6b' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const movio = useRef(false);
  const ultimo = useRef<Punto | null>(null);
  const medio = useRef<Punto | null>(null);
  const hayTrazo = useRef(false);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  // Resolución real del lienzo (nitidez en retina). Se ajusta al montar y cada vez que cambia
  // el ancho (p. ej. al girar el teléfono): redimensionar un canvas lo borra, así que en ese
  // caso se avisa que la firma quedó vacía para que la vuelvan a hacer.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ancho = 0;
    const ajustar = () => {
      // clientWidth/Height = área de dibujo sin el borde.
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (w < 2 || h < 2 || w === ancho) return;
      ancho = w;
      const ratio = Math.min(window.devicePixelRatio || 1, 2); // 2x basta y el PNG pesa menos
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111827';
      ctx.fillStyle = '#111827';
      if (hayTrazo.current) { hayTrazo.current = false; onChangeRef.current(''); }
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const coords = (e: React.PointerEvent<HTMLCanvasElement>): Punto => {
    const c = e.currentTarget;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left - c.clientLeft, y: e.clientY - rect.top - c.clientTop };
  };

  const iniciar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = coords(e);
    dibujando.current = true;
    movio.current = false;
    ultimo.current = p;
    medio.current = p;
  };

  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current || !ultimo.current || !medio.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const p = coords(e);
    const nuevoMedio = { x: (ultimo.current.x + p.x) / 2, y: (ultimo.current.y + p.y) / 2 };
    ctx.beginPath();
    ctx.moveTo(medio.current.x, medio.current.y);
    ctx.quadraticCurveTo(ultimo.current.x, ultimo.current.y, nuevoMedio.x, nuevoMedio.y);
    ctx.stroke();
    medio.current = nuevoMedio;
    ultimo.current = p;
    movio.current = true;
  };

  const terminar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    dibujando.current = false;
    const ctx = e.currentTarget.getContext('2d');
    // Un toque sin desplazamiento deja un punto.
    if (ctx && !movio.current && ultimo.current) {
      ctx.beginPath();
      ctx.arc(ultimo.current.x, ultimo.current.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
    hayTrazo.current = true;
    onChange(e.currentTarget.toDataURL('image/png'));
  };

  const limpiar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    hayTrazo.current = false;
    onChange('');
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        aria-label="Espacio para firmar"
        onPointerDown={iniciar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        style={{ display: 'block', width: '100%', height: alto, touchAction: 'none', cursor: 'crosshair', background: '#fff', border: `1px dashed ${colorBorde}`, borderRadius: 10 }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 12, color: colorTexto }}>Firma con el dedo o el mouse</span>
        <button type="button" onClick={limpiar} style={{ fontSize: 13, color: colorTexto, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 4 }}>
          Borrar
        </button>
      </div>
    </div>
  );
}
