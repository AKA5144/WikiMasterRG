
import * as cheerio from "cheerio";
import { writeFile } from "node:fs/promises";

const url = "https://silentblue.remywiki.com/World_Vanquisher";

const response = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0" },
});

if (!response.ok) {
  throw new Error(`Erreur HTTP : ${response.status}`);
}

const html = await response.text();
const $ = cheerio.load(html);
const title = $("h1").first().text().trim();

console.log("Titre :", JSON.stringify(title));
console.log("Titre correct :", title === "World Vanquisher");
console.log("Texte japonais trouvé :", html.includes("小鳥遊さん"));

await writeFile(
  "src/data/encoding-test.json",
  JSON.stringify(
    {
      title,
      japaneseTextFound: html.includes("小鳥遊さん"),
    },
    null,
    2,
  ),
  "utf8",
);

console.log("Fichier de test enregistré.");
