
import fs from "node:fs/promises";

const cache = JSON.parse(
  await fs.readFile("public/data/kamai-playcounts.json", "utf8")
);

const entries = cache.entries ?? {};

const noResults = Object.values(entries)
  .filter((entry) => entry.status === "no-match")
  .map((entry) => ({
    title: entry.title,
    wikiUrl: entry.wikiUrl,
    query: entry.query,
    status: entry.status,
  }));

await fs.writeFile(
  "public/data/kamai-no-results.json",
  JSON.stringify(noResults, null, 2)
);

console.log(`${noResults.length} chansons sans résultat.`);
console.log("Fichier créé : public/data/kamai-no-results.json");
