// Let Node `require()` image assets (React Native bundles them; tests only need a placeholder).
import Module from 'node:module';

const exts = (Module as unknown as { _extensions: Record<string, (m: { exports: unknown }, filename: string) => void> })._extensions;
for (const ext of ['.png', '.jpg', '.jpeg']) exts[ext] = (m, filename) => (m.exports = { testUri: filename });
