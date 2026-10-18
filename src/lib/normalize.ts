// magic-dart only exports its root entry, which also pulls in node:zlib (ZIP endpoints).
// The normalisers are dependency-free, so the browser bundle imports that module directly.
export { parseAmount, parseNumber, parseDate, parseRmFlags, viewerUrl, RM_FLAGS } from '../../node_modules/magic-dart/dist/normalize.js';
