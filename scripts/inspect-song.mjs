
import * as cheerio from "cheerio";

const url = "https://silentblue.remywiki.com/%22Nh-uh-uh.%22";
const response = await fetch(url);
const html = await response.text();
const $ = cheerio.load(html);

console.log("Titre :", $("h1").first().text().trim());

console.log("\n--- INFOS DE LA PAGE ---");

const content = $("#mw-content-text");

content.find("p, dl, dt, dd, h2, h3, h4").each((_, element) => {
  const text = $(element).text().replace(/\s+/g, " ").trim();

  if (
    /artist|composer|composition|arrangement|作曲|編曲|アーティスト|ボーカル|Vocal/i.test(text)
  ) {
    console.log(`[${element.tagName}] ${text}`);
  }
});

console.log("\n--- PREMIERS 12000 CARACTÈRES DU CONTENU ---");
console.log(content.text().replace(/\s+/g, " ").trim().slice(0, 12000));

console.log("\n--- IMAGES ---");
content.find("img").each((_, img) => {
  const alt = $(img).attr("alt");
  const src = $(img).attr("src");

  if (alt || src) {
    console.log({ alt, src });
  }
});
