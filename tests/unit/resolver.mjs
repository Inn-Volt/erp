// Para las pruebas: resuelve como Next los imports sin extensión ('./tipos') y con '@/'.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

export async function resolve(especificador, contexto, siguiente) {
  let ruta = null;
  if (especificador.startsWith('@/')) ruta = path.join(raiz, especificador.slice(2));
  else if (especificador.startsWith('.') && contexto.parentURL?.startsWith('file:')) {
    ruta = fileURLToPath(new URL(especificador, contexto.parentURL));
  }
  if (ruta && !/\.[cm]?[jt]sx?$/.test(ruta)) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      if (existsSync(ruta + ext)) return siguiente(pathToFileURL(ruta + ext).href, contexto);
    }
  }
  if (ruta) return siguiente(pathToFileURL(ruta).href, contexto);
  return siguiente(especificador, contexto);
}
