import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);

function resolveImplPath() {
    const candidates = [
        path.resolve(path.dirname(__filename), 'impl.js'),
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && path.resolve(candidate) !== path.resolve(__filename)) {
            return candidate;
        }
    }

    throw new Error('report impl.js not found');
}

async function loadImpl() {
    const implPath = resolveImplPath();
    return import(pathToFileURL(implPath).href);
}

export async function main() {
    const impl = await loadImpl();
    return impl.main();
}

export * from './impl.js';

if (process.argv[1]) {
    let invokedPath = null;
    let currentPath = null;

    try {
        invokedPath = fs.realpathSync(path.resolve(process.argv[1]));
    } catch {
        invokedPath = path.resolve(process.argv[1]);
    }

    try {
        currentPath = fs.realpathSync(__filename);
    } catch {
        currentPath = __filename;
    }

    if (invokedPath === currentPath) {
        main();
    }
}
