
const API_BASE = "https://silentblue.remywiki.com/api.php";

export interface WikiPage {
  pageid: number;
  ns: number;
  title: string;
}

export interface WikiVersion {
  title: string;
  game: "maimai" | "CHUNITHM" | "ONGEKI";
  url: string;
  region: "Japan" | "Asia" | "China";
  jacket: string | null;
}

type WikiImage = {
  title: string;
  ns: number;
};

async function request<T>(
  params: Record<string, string>
): Promise<T> {
  const url = new URL(API_BASE);

  for (const [key, value] of Object.entries({
    ...params,
    format: "json",
    origin: "*",
  })) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `SilentBlue returned HTTP ${response.status}: ${text.slice(0, 200)}`
    );
  }

  if (!text.trim().startsWith("{")) {
    throw new Error(
      `SilentBlue returned unexpected content: ${text.slice(0, 200)}`
    );
  }

  const data = JSON.parse(text) as T & {
    error?: { info?: string };
  };

  if (data.error) {
    throw new Error(data.error.info ?? "Unknown API error");
  }

  return data;
}

export async function getWikiPage(
  title: string
): Promise<WikiPage | null> {
  const data = await request<{
    query?: { pages?: Record<string, WikiPage> };
  }>({
    action: "query",
    prop: "info",
    titles: title,
  });

  const page = Object.values(data.query?.pages ?? {})[0];

  return !page || page.pageid < 0 ? null : page;
}

export async function getSongWikitext(
  title: string
): Promise<string> {
  const data = await request<{
    parse?: { wikitext?: { "*": string } };
  }>({
    action: "parse",
    page: title,
    prop: "wikitext",
  });

  return data.parse?.wikitext?.["*"] ?? "";
}

const VERSION_ROOTS = [
  { game: "maimai", title: "maimai" },
  { game: "CHUNITHM", title: "CHUNITHM" },
  { game: "ONGEKI", title: "ONGEKI" },
] as const;

/**
 * Correspondances explicites lorsque le nom du fichier
 * ne peut pas être déduit du titre de la version.
 */
const JACKET_OVERRIDES: Record<string, string> = {
  "CHUNITHM:1st": "File:CHUNITHM.png",
};

function isVersionArticle(
  title: string,
  game: WikiVersion["game"]
): boolean {
  if (game === "maimai") {
    return (
      title.startsWith("maimai:") ||
      title.startsWith("maimai DX:")
    );
  }

  return title.startsWith(`${game}:`);
}

function getVersionRegion(
  title: string
): WikiVersion["region"] {
  if (/\(China\)$/i.test(title)) return "China";
  if (/\(Asia\)$/i.test(title)) return "Asia";
  return "Japan";
}

function getWikiUrl(title: string): string {
  return `https://silentblue.remywiki.com/${title.replace(/ /g, "_")}`;
}

/**
 * Essaie de trouver le fichier image associé à une page.
 * Pour CHUNITHM:1st, le fichier est connu explicitement.
 */
async function getJacketFileTitle(
  title: string
): Promise<string | null> {
  const override = JACKET_OVERRIDES[title];

  if (override) {
    return override;
  }

  const data = await request<{
    query?: {
      pages?: Record<
        string,
        {
          images?: WikiImage[];
        }
      >;
    };
  }>({
    action: "query",
    prop: "images",
    titles: title,
    imlimit: "max",
  });

  const page = Object.values(data.query?.pages ?? {})[0];
  const images = page?.images ?? [];

  if (images.length === 0) {
    return null;
  }

  // Préfère une image dont le nom correspond au titre de la version.
  const versionName = title.split(":").slice(1).join(":").trim();

  const matchingImage = images.find((image) =>
    image.title
      .replace(/^File:/i, "")
      .toLowerCase()
      .includes(versionName.toLowerCase())
  );

  return (matchingImage ?? images[0]).title;
}

/**
 * Convertit un titre de fichier du wiki en URL d'image.
 */
async function getJacketUrl(
  fileTitle: string
): Promise<string | null> {
  const data = await request<{
    query?: {
      pages?: Record<
        string,
        {
          missing?: boolean;
          imageinfo?: Array<{
            thumburl?: string;
            url?: string;
          }>;
        }
      >;
    };
  }>({
    action: "query",
    prop: "imageinfo",
    titles: fileTitle,
    iiprop: "url",
    iiurlwidth: "300",
  });

  const page = Object.values(data.query?.pages ?? {})[0];
  const image = page?.imageinfo?.[0];

  return image?.thumburl ?? image?.url ?? null;
}

async function getVersionJacket(
  title: string
): Promise<string | null> {
  try {
    const fileTitle = await getJacketFileTitle(title);

    if (!fileTitle) {
      return null;
    }

    return await getJacketUrl(fileTitle);
  } catch (error) {
    console.warn(`Unable to load jacket for ${title}:`, error);
    return null;
  }
}

export async function getGameVersions(): Promise<WikiVersion[]> {
  const versions: Omit<WikiVersion, "jacket">[] = [];

  for (const root of VERSION_ROOTS) {
    let continuation: Record<string, string> = {};

    do {
      const data = await request<{
        query?: {
          pages?: Record<
            string,
            {
              links?: Array<{
                title: string;
                ns: number;
              }>;
            }
          >;
        };
        continue?: Record<string, string>;
      }>({
        action: "query",
        prop: "links",
        titles: root.title,
        pllimit: "max",
        ...continuation,
      });

      const links = Object.values(data.query?.pages ?? {})
        .flatMap((page) => page.links ?? []);

      for (const link of links) {
        const title = link.title.trim();

        // Les versions peuvent utiliser un espace de noms personnalisé.
        if (!isVersionArticle(title, root.game)) continue;

        if (/characters|song list|discography/i.test(title)) {
          continue;
        }

        versions.push({
          title,
          game: root.game,
          url: getWikiUrl(title),
          region: getVersionRegion(title),
        });
      }

      continuation = data.continue ?? {};
    } while (Object.keys(continuation).length > 0);
  }

  const unique = new Map<string, Omit<WikiVersion, "jacket">>();

  for (const version of versions) {
    unique.set(`${version.game}:${version.title}`, version);
  }

  const uniqueVersions = [...unique.values()].sort((a, b) =>
    a.title.localeCompare(b.title)
  );

  // Charge les jackets par petits groupes pour éviter trop de requêtes
  // simultanées vers le wiki.
  const result: WikiVersion[] = [];
  const batchSize = 6;

  for (let i = 0; i < uniqueVersions.length; i += batchSize) {
    const batch = uniqueVersions.slice(i, i + batchSize);

    const versionsWithJackets = await Promise.all(
      batch.map(async (version) => ({
        ...version,
        jacket: await getVersionJacket(version.title),
      }))
    );

    result.push(...versionsWithJackets);
  }

  return result;
}
