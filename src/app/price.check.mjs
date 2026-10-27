// Comprobación de formatPrice: node src/app/price.check.mjs
import assert from "node:assert/strict";
import { formatPrice } from "./price.ts";

const nb = " "; // Intl separa la cifra y el € con un espacio que no se parte
assert.equal(formatPrice("6,50"), `6,50${nb}€`);
assert.equal(formatPrice("6.5"), `6,50${nb}€`);
assert.equal(formatPrice("12"), `12,00${nb}€`);
assert.equal(formatPrice(" 9,5 "), `9,50${nb}€`);
assert.equal(formatPrice("6,50 €"), `6,50${nb}€`); // precios guardados antes, con símbolo
assert.equal(formatPrice("1.200,00"), `1200,00${nb}€`);
assert.equal(formatPrice(""), "");
assert.equal(formatPrice("€"), "");
assert.equal(formatPrice("s.q."), "s.q.");
assert.equal(formatPrice("da 10"), "da 10");
console.log("formatPrice: ok");
