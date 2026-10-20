
import * as cheerio from "cheerio";

const url = "https://silentblue.remywiki.com/World_Vanquisher";

const response = await fetch(url, {
  headers: { "User-Agent": "Mozilla/5.0" },
});

if (!response.ok) {
  throw new Error(`Erreur HTTP : ${response.status}`);
}

const html = await response.text();
const $ = cheerio.load(html);

console.log("=== INFOS DE LA PAGE ===");

$("h1").each((_, el) => {
  console.log("H1 :", $(el).text().trim());
});

console.log("\n=== TABLEAUX : STRUCTURE DES LIGNES ===");

$("table").each((tableIndex, table) => {
  const tableText = $(table).text().replace(/\s+/g, " ").trim();

  if (
    !/Notecounts|Chart Designer|BPM|Artist|Level/i.test(tableText)
  ) {
    return;
  }

  console.log(`\n######## TABLEAU ${tableIndex + 1} ########`);

  $(table).find("tr").each((rowIndex, row) => {
    const cells = $(row)
      .find("th, td")
      .map((_, cell) => $(cell).text().replace(/\s+/g, " ").trim())
      .get();

    if (cells.length > 0) {
      console.log(`Ligne ${rowIndex + 1} :`, JSON.stringify(cells));
    }
  });
});

console.log("\n=== LIENS DE CATÉGORIES ===");

$("a[href*='Category:']").each((_, el) => {
  const href = $(el).attr("href");
  const label = $(el).text().trim();

  if (href && /maimai|CHUNITHM|ONGEKI/i.test(href + label)) {
    console.log(label, "=>", href);
  }
});
