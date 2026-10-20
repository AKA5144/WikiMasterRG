
import * as cheerio from "cheerio";

const response = await fetch(
  "https://silentblue.remywiki.com/World_Vanquisher",
  { headers: { "User-Agent": "Mozilla/5.0" } },
);

const $ = cheerio.load(await response.text());

console.log("=== ÉLÉMENTS CONTENANT ARTIST OU BPM ===");

$("*").each((_, element) => {
  if ($(element).children().length > 0) return;

  const text = $(element).text().trim();

  if (/^(artist|bpm|composer|genre|jacket|image)$/i.test(text)) {
    console.log(
      "Texte :", text,
      "| Élément :", element.tagName,
      "| Parent :", $(element).parent().text().replace(/\s+/g, " ").trim().slice(0, 200),
      "| Classe parent :", $(element).parent().attr("class") || "(aucune)",
    );
  }
});

console.log("\n=== IMAGES DE LA PAGE ===");

$("img").each((index, img) => {
  if (index >= 15) return;

  console.log({
    alt: $(img).attr("alt"),
    src: $(img).attr("src"),
    title: $(img).attr("title"),
    class: $(img).attr("class"),
  });
});
