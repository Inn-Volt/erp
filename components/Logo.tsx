
/**
 * Logo de InnVolt, adaptable al tema.
 * ─────────────────────────────────────────────────────────────────────────────
 *   InnVolt-transparente-claro.png   → "Inn" en negro  → fondo CLARO
 *   InnVolt-transparente-oscuro.png  → "Inn" en blanco → fondo OSCURO
 *
 * Se alternan con las clases `dark:` de Tailwind: sin parpadeo ni JS.
 * Para cambiar el logo basta con reemplazar esos archivos en /public.
 */

/** Ruta del logo con tinta oscura — la que se ve sobre papel/fondo blanco. */
export const LOGO_CLARO  = '/InnVolt-transparente-claro.png';
/** Ruta del logo con tinta clara — la que se ve sobre fondo negro. */
export const LOGO_OSCURO = '/InnVolt-transparente-oscuro.png';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <>
      <img src={LOGO_CLARO}  alt="InnVolt" className={`logo-claro ${className}`} />
      <img src={LOGO_OSCURO} alt="InnVolt" className={`logo-oscuro ${className}`} />
    </>
  );
}

/**
 * Versión con alto fijo en píxeles, para usar dentro de estilos inline
 * (el resto de la app no usa clases de Tailwind).
 *
 * Importante: el estilo inline NO define `display`; de eso se encargan
 * las clases .logo-claro/.logo-oscuro, porque un `display` inline
 * ganaría siempre y se verían los dos logos a la vez.
 */
export function LogoImg({ height = 30 }: { height?: number }) {
  const estilo: React.CSSProperties = {
    height, width: 'auto', objectFit: 'contain',
  };
  return (
    <>
      <img src={LOGO_CLARO}  alt="InnVolt" style={estilo} className="logo-claro" />
      <img src={LOGO_OSCURO} alt="InnVolt" style={estilo} className="logo-oscuro" />
    </>
  );
}

/**
 * Isotipo cuadrado (rayo sobre amarillo de marca).
 * Sirve para espacios reducidos: avatar, favicon, botón de menú.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      style={{
        width: size, height: size,
        background: 'var(--y-brand)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, borderRadius: 'var(--r-sm)',
      }}
    >
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="#000" aria-hidden="true">
        <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z" />
      </svg>
    </span>
  );
}

export default Logo;
