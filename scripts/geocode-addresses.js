import { readFile, writeFile } from "node:fs/promises";

const dataPath = new URL("../data.json", import.meta.url);
const gsiApiUrl = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=";
const forceUpdate = process.argv.includes("--force");

function normalizeAddress(address) {
  const withoutPostalCode = address
    .replace(/^〒?\s*\d{3}-?\d{4}\s*/, "")
    .trim();

  if (withoutPostalCode.startsWith("神山町")) {
    return `徳島県名西郡${withoutPostalCode}`;
  }

  return withoutPostalCode;
}

function isInKamiyama([longitude, latitude]) {
  return latitude >= 33.85 && latitude <= 34.1 &&
    longitude >= 134.2 && longitude <= 134.55;
}

function wait(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function getOfficialCoordinates(pageUrl) {
  if (!pageUrl) {
    return null;
  }

  const response = await fetch(pageUrl);

  if (!response.ok) {
    throw new Error(`公式ページ HTTP ${response.status}`);
  }

  const html = await response.text();
  let match = html.match(
    /maps\.google\.co\.jp\/maps\?q=(-?\d+(?:\.\d+)?)(?:%2C|,)(-?\d+(?:\.\d+)?)/i
  );

  if (!match) {
    const shortUrlMatch = html.match(
      /https:\/\/maps\.app\.goo\.gl\/[A-Za-z0-9_-]+/
    );

    if (shortUrlMatch) {
      const mapResponse = await fetch(shortUrlMatch[0], {
        redirect: "manual"
      });
      const redirectUrl = mapResponse.headers.get("location") ?? "";
      const placeMatch = redirectUrl.match(
        /!3d(-?\d+(?:\.\d+)?)[^!]*!4d(-?\d+(?:\.\d+)?)/
      );

      if (placeMatch) {
        match = placeMatch;
      }
    }
  }

  if (!match) {
    return null;
  }

  const latitude = Number(match[1]);
  const longitude = Number(match[2]);

  if (!isInKamiyama([longitude, latitude])) {
    return null;
  }

  return {
    latitude,
    longitude,
    coordinate_accuracy: "point",
    coordinate_source: "神山町公式ページ"
  };
}

async function getDistrictCoordinates(address) {
  const query = normalizeAddress(address);
  const response = await fetch(`${gsiApiUrl}${encodeURIComponent(query)}`);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const features = await response.json();
  const feature = features.find(item =>
    Array.isArray(item.geometry?.coordinates) &&
    isInKamiyama(item.geometry.coordinates)
  );

  if (!feature) {
    throw new Error("神山町内の座標が見つかりませんでした");
  }

  const [longitude, latitude] = feature.geometry.coordinates;
  return {
    latitude,
    longitude,
    coordinate_accuracy: "district",
    coordinate_source: "国土地理院住所検索API"
  };
}

const data = JSON.parse(await readFile(dataPath, "utf8"));
let updatedCount = 0;
let failedCount = 0;

for (const item of data) {
  const hasCoordinates =
    Number.isFinite(item.latitude) && Number.isFinite(item.longitude);

  const hasCoordinateSource = item.page_url || item.address;

  if (!hasCoordinateSource || (hasCoordinates && !forceUpdate)) {
    continue;
  }

  try {
    const officialCoordinates = await getOfficialCoordinates(item.page_url);
    const districtCoordinates = !officialCoordinates && item.address ?
      await getDistrictCoordinates(item.address) : null;
    const coordinates = officialCoordinates ?? districtCoordinates;

    if (!coordinates) {
      throw new Error("利用できる座標が見つかりませんでした");
    }

    Object.assign(item, coordinates);
    updatedCount += 1;
    const accuracy = coordinates.coordinate_accuracy === "point" ?
      "地点" : "地区代表点";
    console.log(`${accuracy}: ${item.title}`);
  } catch (error) {
    failedCount += 1;
    console.error(`NG: ${item.title} (${error.message})`);
  }

  await wait(250);
}

await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`);

console.log(`完了: ${updatedCount}件更新、${failedCount}件失敗`);

if (failedCount > 0) {
  process.exitCode = 1;
}
