import fs from "node:fs";

const songs = JSON.parse(
  fs.readFileSync("./src/data/songs.credits-test.json", "utf8")
);

const titles = [
  "-OutsideR:RequieM-",
  "\"411Ψ892\"",
  "[X]",
  "《最愛》 ～ Curse"
];

for (const title of titles) {
  const song = songs.find(s => s.title === title);

  if (song) {
    console.log("\nTitre :", song.title);
    console.log("Artiste :", song.artist);
    console.log("Composition :", song.compositionArrangement);
  } else {
    console.log("\nTitre introuvable :", title);
  }
}
