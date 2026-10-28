// Registra el resolvedor de imports de las pruebas (ver resolver.mjs).
import { register } from 'node:module';

register('./resolver.mjs', import.meta.url);
