/**
 * Encabezado de página unificado (lenguaje TecApp): rótulo en acento + título
 * en tipografía display + subtítulo opcional, y acciones a la derecha.
 * Úsalo en todas las páginas para que tipografía y espaciado sean consistentes.
 */
export default function PageHeader({ eyebrow, title, subtitle, actions }: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="pg-header">
      <div style={{ minWidth: 0 }}>
        {eyebrow && <p className="pg-eyebrow">{eyebrow}</p>}
        <h1 className="pg-title">{title}</h1>
        {subtitle && <p className="pg-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="pg-actions">{actions}</div>}
    </div>
  );
}
