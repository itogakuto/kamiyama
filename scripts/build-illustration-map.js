import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const viewBox = { width: 1200, height: 800 };
const bounds = {
  south: 33.895,
  west: 134.201,
  north: 34.069,
  east: 134.472
};
const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
const overpassEndpoints = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
const outputPath = fileURLToPath(new URL("../assets/kamiyama-illustrated.svg", import.meta.url));
const cli = parseArgs(process.argv.slice(2));

const sourceFiles = {
  boundary: "kamiyama_boundary.json",
  road438: "road438.json",
  road193: "road193.json",
  prefecturalRoads: "pref_roads.json",
  rivers: "rivers.json",
  points: "kamiyama_features.json"
};

const queries = {
  boundary: `[out:json][timeout:60];rel(4058004);out geom;`,
  road438: `[out:json][timeout:30];way["highway"]["ref"~"(^|;)438(;|$)"](${bbox});out geom;`,
  road193: `[out:json][timeout:30];way["highway"]["ref"~"(^|;)193(;|$)"](${bbox});out geom;`,
  prefecturalRoads: `[out:json][timeout:45];way["highway"]["ref"~"^(20|21|43)$"](${bbox});out geom;`,
  rivers: `[out:json][timeout:45];(way["waterway"]["name"="鮎喰川"](${bbox});way["waterway"]["name"~"谷川|川"](${bbox}););out geom;`,
  points: `[out:json][timeout:30];(node["natural"="peak"](${bbox});node["place"](${bbox}););out;`
};

const routeNames = {
  438: "国道438号",
  193: "国道193号",
  20: "県道20号",
  21: "県道21号",
  43: "県道43号"
};
const preferredRouteLabelPoints = {
  438: { x: 420, y: 515 },
  193: { x: 270, y: 385 },
  20: { x: 710, y: 370 },
  21: { x: 875, y: 345 },
  43: { x: 535, y: 325 }
};
const districtNames = new Set(["上分", "下分", "神領", "鬼籠野", "阿野"]);
const waterwayNames = new Set([
  "鮎喰川",
  "左右内谷川",
  "鬼篭野谷川",
  "鬼籠野谷川",
  "上角谷川",
  "南山谷川",
  "神通谷川",
  "高根谷川",
  "喜来谷川",
  "大地谷川",
  "青井夫谷川"
]);

const data = {};
for (const name of Object.keys(queries)) {
  data[name] = await loadDataset(name);
}

const boundaryRelation = data.boundary.elements.find(element => element.type === "relation");
if (!boundaryRelation) {
  throw new Error("Kamiyama boundary relation was not found.");
}

const boundaryRings = joinBoundaryRings(
  boundaryRelation.members
    .filter(member => member.type === "way" && member.role === "outer" && member.geometry)
    .map(member => member.geometry)
);
const boundaryRing = boundaryRings.sort((a, b) => ringArea(b) - ringArea(a))[0];
if (!boundaryRing) {
  throw new Error("Kamiyama boundary ring could not be assembled.");
}

const townPath = pathForLatLon(boundaryRing, { close: true, tolerance: 1.2 });
const roads = collectRoads();
const rivers = collectRivers();
const points = collectPoints(boundaryRing);
const svg = renderSvg({ townPath, roads, rivers, points });

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg);
console.log(`Wrote ${outputPath}`);

async function loadDataset(name) {
  if (cli.sourceDir) {
    const filePath = path.join(cli.sourceDir, sourceFiles[name]);
    return JSON.parse(await readFile(filePath, "utf8"));
  }

  let lastError;
  for (const endpoint of overpassEndpoints) {
    try {
      return await fetchOverpass(endpoint, queries[name]);
    } catch (error) {
      lastError = error;
      console.warn(`${name}: ${endpoint} failed: ${error.message}`);
    }
  }

  throw lastError;
}

async function fetchOverpass(endpoint, query) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "kamiyama-map-illustration-builder/1.0"
    },
    body: new URLSearchParams({ data: query })
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 80).replace(/\s+/g, " ")}`);
  }
}

function parseArgs(args) {
  const result = {};

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--source-dir") {
      result.sourceDir = args[index + 1];
      index += 1;
    }
  }

  return result;
}

function collectRoads() {
  const roadSets = [
    { ref: "438", importance: "national", elements: data.road438.elements },
    { ref: "193", importance: "national", elements: data.road193.elements },
    ...["20", "21", "43"].map(ref => ({
      ref,
      importance: "prefectural",
      elements: data.prefecturalRoads.elements.filter(element => element.tags?.ref === ref)
    }))
  ];

  return roadSets.map(roadSet => {
    const paths = roadSet.elements
      .filter(element => element.type === "way" && element.geometry?.length > 1)
      .map(element => {
        const points = element.geometry.map(toSvgPoint);
        const labelPoints = element.geometry
          .filter(point => isInsideRing(point, boundaryRing))
          .map(toSvgPoint);

        return {
          d: pathForLatLon(element.geometry, { tolerance: roadSet.importance === "national" ? 0.55 : 0.75 }),
          points,
          labelPoints: labelPoints.length > 1 ? labelPoints : points
        };
      });

    return {
      ...roadSet,
      name: routeNames[roadSet.ref],
      paths,
      labelPoint: getRouteLabelPoint(paths, roadSet.ref)
    };
  }).filter(road => road.paths.length > 0);
}

function collectRivers() {
  return data.rivers.elements
    .filter(element => element.type === "way" && element.geometry?.length > 1)
    .map(element => {
      const name = element.tags?.name || element.tags?.["name:ja"] || "";
      const isMain = name === "鮎喰川";
      const points = element.geometry.map(toSvgPoint);

      return {
        name,
        isMain,
        d: pathFromPoints(simplify(points, isMain ? 0.75 : 0.9)),
        length: polylineLength(points)
      };
    })
    .filter(river => river.isMain || (waterwayNames.has(river.name) && river.length > 24))
    .sort((a, b) => Number(a.isMain) - Number(b.isMain));
}

function collectPoints(ring) {
  const rawNodes = data.points.elements
    .filter(element => element.type === "node")
    .filter(element => isInsideRing({ lat: element.lat, lon: element.lon }, ring));

  const districts = groupByName(
    rawNodes.filter(node => districtNames.has(node.tags?.name || node.tags?.["name:ja"] || ""))
  ).map(group => ({
    name: group.name,
    ...averagePoint(group.nodes.map(node => toSvgPoint(node)))
  }));

  const peaks = rawNodes
    .filter(node => node.tags?.natural === "peak")
    .map(node => ({
      name: node.tags?.name || "",
      ele: Number.parseFloat(node.tags?.ele || "0"),
      ...toSvgPoint(node)
    }))
    .sort((a, b) => b.ele - a.ele)
    .slice(0, 6);

  return { districts, peaks };
}

function groupByName(nodes) {
  const groups = new Map();

  for (const node of nodes) {
    const name = node.tags?.name || node.tags?.["name:ja"];
    if (!groups.has(name)) {
      groups.set(name, []);
    }
    groups.get(name).push(node);
  }

  return [...groups.entries()].map(([name, groupedNodes]) => ({ name, nodes: groupedNodes }));
}

function averagePoint(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function joinBoundaryRings(segments) {
  const unused = segments.map(segment => segment.map(point => ({ lat: point.lat, lon: point.lon })));
  const rings = [];

  while (unused.length > 0) {
    const ring = unused.shift();

    while (unused.length > 0 && keyForPoint(ring[0]) !== keyForPoint(ring.at(-1))) {
      const lastKey = keyForPoint(ring.at(-1));
      const firstKey = keyForPoint(ring[0]);
      const nextIndex = unused.findIndex(segment => (
        keyForPoint(segment[0]) === lastKey ||
        keyForPoint(segment.at(-1)) === lastKey ||
        keyForPoint(segment[0]) === firstKey ||
        keyForPoint(segment.at(-1)) === firstKey
      ));

      if (nextIndex === -1) {
        break;
      }

      const [next] = unused.splice(nextIndex, 1);
      const nextFirstKey = keyForPoint(next[0]);
      const nextLastKey = keyForPoint(next.at(-1));

      if (nextFirstKey === lastKey) {
        ring.push(...next.slice(1));
      } else if (nextLastKey === lastKey) {
        ring.push(...next.reverse().slice(1));
      } else if (nextLastKey === firstKey) {
        ring.unshift(...next.slice(0, -1));
      } else {
        ring.unshift(...next.reverse().slice(0, -1));
      }
    }

    rings.push(ring);
  }

  return rings;
}

function keyForPoint(point) {
  return `${point.lat.toFixed(7)},${point.lon.toFixed(7)}`;
}

function ringArea(ring) {
  let area = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current.lon * next.lat - next.lon * current.lat;
  }

  return Math.abs(area / 2);
}

function isInsideRing(point, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i].lon;
    const yi = ring[i].lat;
    const xj = ring[j].lon;
    const yj = ring[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lon < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi);

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function toSvgPoint(point) {
  const minY = mercatorY(bounds.south);
  const maxY = mercatorY(bounds.north);
  const y = mercatorY(point.lat);

  return {
    x: ((point.lon - bounds.west) / (bounds.east - bounds.west)) * viewBox.width,
    y: ((maxY - y) / (maxY - minY)) * viewBox.height
  };
}

function mercatorY(lat) {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

function pathForLatLon(points, options = {}) {
  return pathFromPoints(simplify(points.map(toSvgPoint), options.tolerance ?? 0.8), options.close);
}

function pathFromPoints(points, close = false) {
  if (points.length === 0) {
    return "";
  }

  const d = [
    `M${format(points[0].x)} ${format(points[0].y)}`,
    ...points.slice(1).map(point => `L${format(point.x)} ${format(point.y)}`)
  ].join("");

  return close ? `${d}Z` : d;
}

function simplify(points, tolerance) {
  if (points.length <= 2 || tolerance <= 0) {
    return points;
  }

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  simplifySection(points, 0, points.length - 1, tolerance * tolerance, keep);
  return points.filter((_, index) => keep[index]);
}

function simplifySection(points, first, last, sqTolerance, keep) {
  let maxDistance = 0;
  let index = first;

  for (let current = first + 1; current < last; current += 1) {
    const distance = squaredSegmentDistance(points[current], points[first], points[last]);
    if (distance > maxDistance) {
      maxDistance = distance;
      index = current;
    }
  }

  if (maxDistance > sqTolerance) {
    keep[index] = 1;
    simplifySection(points, first, index, sqTolerance, keep);
    simplifySection(points, index, last, sqTolerance, keep);
  }
}

function squaredSegmentDistance(point, start, end) {
  let x = start.x;
  let y = start.y;
  let dx = end.x - x;
  let dy = end.y - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((point.x - x) * dx + (point.y - y) * dy) / (dx * dx + dy * dy);

    if (t > 1) {
      x = end.x;
      y = end.y;
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = point.x - x;
  dy = point.y - y;
  return dx * dx + dy * dy;
}

function polylineLength(points) {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return length;
}

function getLongestPathMidpoint(paths) {
  const longest = paths
    .map(path => ({ ...path, length: polylineLength(path.points) }))
    .sort((a, b) => b.length - a.length)[0];

  if (!longest) {
    return null;
  }

  const target = longest.length / 2;
  let traveled = 0;

  for (let index = 1; index < longest.points.length; index += 1) {
    const prev = longest.points[index - 1];
    const next = longest.points[index];
    const segmentLength = Math.hypot(next.x - prev.x, next.y - prev.y);

    if (traveled + segmentLength >= target) {
      const ratio = (target - traveled) / segmentLength;
      return {
        x: prev.x + (next.x - prev.x) * ratio,
        y: prev.y + (next.y - prev.y) * ratio
      };
    }

    traveled += segmentLength;
  }

  return longest.points[Math.floor(longest.points.length / 2)];
}

function getCentralRouteLabelPoint(paths) {
  const points = paths.flatMap(path => path.labelPoints ?? path.points);
  if (points.length === 0) {
    return getLongestPathMidpoint(paths);
  }

  const center = averagePoint(points);
  return [...points].sort((a, b) => (
    squaredDistance(a, center) - squaredDistance(b, center)
  ))[0];
}

function getRouteLabelPoint(paths, ref) {
  const points = paths.flatMap(path => path.labelPoints ?? path.points);
  const preferred = preferredRouteLabelPoints[ref];

  if (points.length > 0 && preferred) {
    return [...points].sort((a, b) => (
      squaredDistance(a, preferred) - squaredDistance(b, preferred)
    ))[0];
  }

  return getCentralRouteLabelPoint(paths);
}

function squaredDistance(a, b) {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function renderSvg({ townPath, roads, rivers, points }) {
  const roadGroups = {
    national: roads.filter(road => road.importance === "national"),
    prefectural: roads.filter(road => road.importance === "prefectural")
  };
  const generatedAt = new Date().toISOString().slice(0, 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox.width} ${viewBox.height}" preserveAspectRatio="none" role="img" aria-labelledby="title description">
  <title id="title">神山町の実地形を抽象化したイラスト地図</title>
  <desc id="description">OpenStreetMap由来の神山町境界、国道438号、国道193号、県道20号・21号・43号、鮎喰川、山頂と地区名を簡略化した固定イラスト</desc>
  <metadata>Generated ${generatedAt}. Geometry simplified from OpenStreetMap data, © OpenStreetMap contributors, ODbL. This SVG is a static illustration, not a live geographic database.</metadata>
  <defs>
    <filter id="town-shadow" x="-10%" y="-12%" width="120%" height="130%">
      <feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#173f31" flood-opacity=".2"/>
    </filter>
    <path id="town-shape" d="${townPath}"/>
    <clipPath id="town-clip">
      <use href="#town-shape"/>
    </clipPath>
    <pattern id="forest-pattern" width="42" height="42" patternUnits="userSpaceOnUse">
      <path d="m9 31 8-13 8 13h-5v8h-6v-8zm18-8 6-10 6 10h-4v6h-5v-6z" fill="#174f3e" opacity=".2"/>
    </pattern>
    <symbol id="peak" viewBox="0 0 100 74">
      <path d="M3 70 35 15l16 25 18-34 28 64z" fill="#245b49"/>
      <path d="m24 34 11-19 8 12 8 13 8-12 10-22 10 27" fill="#c5d873" opacity=".9"/>
    </symbol>
    <symbol id="tree" viewBox="0 0 28 44">
      <path d="M12 29h5v13h-5z" fill="#815d3c"/>
      <path d="m14 2-12 24h8L5 34h19l-6-8h8z" fill="#39704d"/>
    </symbol>
  </defs>

  <rect width="${viewBox.width}" height="${viewBox.height}" fill="#dcead9"/>
  <use href="#town-shape" fill="#fff9e9" opacity=".96"/>
  <g filter="url(#town-shadow)">
    <use href="#town-shape" fill="#4f8f69" stroke="#fff9e9" stroke-width="13"/>
  </g>

  <g clip-path="url(#town-clip)">
    <rect width="${viewBox.width}" height="${viewBox.height}" fill="#5a956e"/>
    <rect width="${viewBox.width}" height="${viewBox.height}" fill="url(#forest-pattern)"/>
    <path d="M-20 214C110 166 246 151 389 197C517 239 636 150 756 162C908 177 1010 259 1220 211V-20H-20Z" fill="#326f54" opacity=".82"/>
    <path d="M-20 682C120 608 266 605 397 655C522 703 632 622 758 630C906 640 1015 709 1220 650V820H-20Z" fill="#2c674f" opacity=".86"/>
    <path d="M-20 524C136 477 292 505 426 470C548 438 664 414 782 373C925 324 1038 316 1220 350V584C1062 566 946 590 807 588C681 585 582 550 450 590C306 633 160 583 -20 638Z" fill="#8eb276" opacity=".62"/>

    <g class="tributaries" fill="none" stroke-linecap="round" stroke-linejoin="round">
      ${rivers.filter(river => !river.isMain).map(river => `<path d="${river.d}" stroke="#7ac8c3" stroke-width="5" opacity=".54"/>`).join("\n      ")}
    </g>
    <g class="main-river" fill="none" stroke-linecap="round" stroke-linejoin="round">
      ${rivers.filter(river => river.isMain).map(river => `<path d="${river.d}" stroke="#eff8ef" stroke-width="28" opacity=".74"/><path d="${river.d}" stroke="#61bcb8" stroke-width="17"/>`).join("\n      ")}
    </g>

    <g class="roads" fill="none" stroke-linecap="round" stroke-linejoin="round">
      ${renderRoadPaths(roadGroups.national, 21, "#285447", ".5")}
      ${renderRoadPaths(roadGroups.national, 13, "#f0c25d")}
      ${renderRoadPaths(roadGroups.prefectural, 15, "#315f50", ".45")}
      ${renderRoadPaths(roadGroups.prefectural, 8, "#f4d98a")}
    </g>

    <g class="peaks">
      ${points.peaks.map((peak, index) => renderPeak(peak, index)).join("\n      ")}
    </g>

    <g class="districts" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
      ${points.districts.map(district => `<text x="${format(district.x)}" y="${format(district.y - 18)}" fill="#fff7df" stroke="#255541" stroke-width="6" paint-order="stroke" font-size="24" font-weight="850" letter-spacing="3">${escapeXml(district.name)}</text>`).join("\n      ")}
    </g>

    <g class="route-labels" font-family="system-ui, -apple-system, sans-serif" text-anchor="middle">
      ${roads.map(renderRouteLabel).join("\n      ")}
    </g>

    <g opacity=".62">
      ${points.districts.map((district, index) => `<use href="#tree" x="${format(district.x + ((index % 2) * 34 - 17))}" y="${format(district.y + 18)}" width="27" height="43"/>`).join("\n      ")}
    </g>
  </g>

  <use href="#town-shape" fill="none" stroke="#fff9e9" stroke-width="13"/>
  <g transform="translate(480 735)">
    <rect width="240" height="44" rx="22" fill="#fff9e9"/>
    <text x="120" y="29" fill="#285846" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="850" text-anchor="middle" letter-spacing="5">KAMIYAMA</text>
  </g>
  <text x="1180" y="784" fill="#426553" font-family="system-ui, -apple-system, sans-serif" font-size="11" text-anchor="end" opacity=".72">© OpenStreetMap contributors / simplified illustration</text>
</svg>
`;
}

function renderRoadPaths(roads, width, color, opacity) {
  return roads.flatMap(road =>
    road.paths.map(path => `<path d="${path.d}" stroke="${color}" stroke-width="${width}"${opacity ? ` opacity="${opacity}"` : ""}/>`))
    .join("\n      ");
}

function renderRouteLabel(road) {
  if (!road.labelPoint) {
    return "";
  }

  const width = road.ref.length === 3 ? 64 : 52;
  const x = road.labelPoint.x;
  const y = road.labelPoint.y;

  return `<g transform="translate(${format(x - width / 2)} ${format(y - 18)})">
        <rect width="${width}" height="34" rx="17" fill="#fff8e8" stroke="#244f40" stroke-width="3"/>
        <text x="${width / 2}" y="23" fill="#244f40" font-size="16" font-weight="850">${road.ref}</text>
      </g>`;
}

function renderPeak(peak, index) {
  const size = Math.max(66, Math.min(122, 66 + (peak.ele || 0) / 20));
  const label = peak.name
    ? `<text x="${format(peak.x)}" y="${format(peak.y - size * 0.58 - 8)}" fill="#edf4d2" stroke="#285846" stroke-width="5" paint-order="stroke" font-family="system-ui, -apple-system, sans-serif" font-size="15" font-weight="800" text-anchor="middle">${escapeXml(peak.name)}</text>`
    : "";

  return `<g opacity="${index > 3 ? ".58" : ".82"}">
        <use href="#peak" x="${format(peak.x - size / 2)}" y="${format(peak.y - size * 0.65)}" width="${format(size)}" height="${format(size * 0.74)}"/>
        ${label}
      </g>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function format(value) {
  return Number(value).toFixed(1).replace(/\.0$/, "");
}
