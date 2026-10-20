
import * as cheerio from "cheerio";

const url = "https://silentblue.remywiki.com/%22Nh-uh-uh.%22";
const response = await fetch(url);
const html = await response.text();
const $ = cheerio.load(html);

console.log("Titre :", $("h1").first().text().trim());

$(".infobox, table.bluetable, table.wikitable").each((i, element) => {
  console.log(`\n--- ÉLÉMENT ${i + 1} (${element.tagName}) ---`);
  console.log(
    $(element).text().replace(/\s+/g, " ").trim().slice(0, 4000)
  );
});

console.log("\n--- Champs contenant Artist / Composer ---");

$("th, td").each((_, element) => {
  const label = $(element).text().replace(/\s+/g, " ").trim();

  if (/artist|composer|composition|arrangement|作曲|編曲|アーティスト/i.test(label)) {
    console.log(
      "Champ :", label,
      "| Ligne :", $(element).closest("tr").text().replace(/\s+/g, " ").trim()
    );
  }
});
