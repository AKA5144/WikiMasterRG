import fs from "node:fs";

const read = path =>
  JSON.parse(fs.readFileSync(path, "utf8"));

const original = read("./src/data/songs.json");
const enriched = read("./src/data/songs.enriched-test.json");
const corrected = read("./src/data/songs.credits-test.json");

function report(name, songs) {
  const games = ["maimai", "CHUNITHM", "ONGEKI"];

  console.log(`\n=== ${name} ===`);
  console.log("Nombre de chansons :", songs.length);
  console.log("IDs en double :", songs.length - new Set(songs.map(s => s.id)).size);

  for (const game of games) {
    const entries = songs.filter(s => s.games?.includes(game));
    const missingCharts = entries.filter(s => !s.charts?.[game]);
    const missingArtists = entries.filter(s => !s.artist?.trim());
    const missingJackets = entries.filter(s => !s.jacketUrl?.trim());

    console.log(
      `${game}: ${entries.length} chansons | ` +
      `${missingCharts.length} sans charts | ` +
      `${missingArtists.length} sans artiste | ` +
      `${missingJackets.length} sans jaquette`
    );
  }
}

report("ORIGINAL", original);
report("ENRICHI", enriched);
report("CRÉDITS CORRIGÉS", corrected);

const originalById = new Map(original.map(s => [s.id, s]));
const missingIds = corrected.filter(s => !originalById.has(s.id));
const lostCharts = corrected.filter(s => {
  const before = originalById.get(s.id);
  return before && Object.keys(before.charts ?? {}).some(
    game => before.charts[game] && !s.charts?.[game]
  );
});

console.log("\n=== COMPARAISON ===");
console.log("Chansons ajoutées par erreur :", missingIds.length);
console.log("Chansons ayant perdu des charts :", lostCharts.length);
console.log(
  "Titres modifiés :",
  corrected.filter(s => {
    const before = originalById.get(s.id);
    return before && before.title !== s.title;
  }).length
);
