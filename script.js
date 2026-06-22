import * as L from "./node_modules/leaflet/dist/leaflet-src.esm.js";

const buttons = document.querySelector("#buttons");
const cards = document.querySelector("#cards");
const count = document.querySelector("#count");
const search = document.querySelector("#search");
const mapLegend = document.querySelector("#map-legend");

const categoryStyles = {
  "食事": "food",
  "見どころ": "highlight",
  "情報": "information"
};

let data = [];
let currentCategory = "すべて";
let currentKeyword = "";
let map;
let markerLayer;

function showMap() {
  const kamiyamaCenter = [33.97, 134.35];
  map = L.map("map", {
    scrollWheelZoom: true
  }).setView(kamiyamaCenter, 12);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  markerLayer = L.layerGroup().addTo(map);
}

function createMarkerPopup(items) {
  const popup = document.createElement("div");
  popup.className = "map-popup";

  if (items.length > 1) {
    const summary = document.createElement("strong");
    summary.textContent = `${items.length}件のスポット`;
    popup.appendChild(summary);
  }

  for (const item of items) {
    const spot = document.createElement("div");
    spot.className = "map-popup-spot";

    const title = document.createElement("strong");
    title.textContent = item.title;
    spot.appendChild(title);

    const category = document.createElement("p");
    category.textContent = `${item.category} / ${item.subcategory}`;
    spot.appendChild(category);

    const link = document.createElement("a");
    link.href = item.page_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "詳しく見る";
    spot.appendChild(link);

    popup.appendChild(spot);
  }

  return popup;
}

function getCategoryStyle(category) {
  return categoryStyles[category] ?? "other";
}

function createCategoryIcon(category, count) {
  const style = getCategoryStyle(category);
  const singleClass = count === 1 ? " map-marker--single" : "";

  return L.divIcon({
    className: `map-marker map-marker--${style}${singleClass}`,
    html: `<span>${count > 1 ? count : ""}</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -38]
  });
}

function showMapLegend() {
  mapLegend.innerHTML = "";

  const categories = [...new Set(
    data
      .filter(item => item.coordinate_accuracy === "point")
      .map(item => item.category)
  )];

  for (const category of categories) {
    const tag = document.createElement("span");
    tag.className = "map-legend-tag";

    const swatch = document.createElement("span");
    swatch.className = `map-legend-swatch map-legend-swatch--${getCategoryStyle(category)}`;
    swatch.setAttribute("aria-hidden", "true");

    tag.appendChild(swatch);
    tag.append(category);
    mapLegend.appendChild(tag);
  }
}

function showMarkers(items) {
  markerLayer.clearLayers();

  const groups = new Map();

  for (const item of items) {
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) {
      continue;
    }

    if (item.coordinate_accuracy !== "point") {
      continue;
    }

    const key = `${item.latitude},${item.longitude}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const positions = [];

  for (const group of groups.values()) {
    const position = [group[0].latitude, group[0].longitude];
    const markerOptions = {
      icon: createCategoryIcon(group[0].category, group.length),
      title: group.length === 1 ? group[0].title : `${group.length}件のスポット`
    };

    L.marker(position, markerOptions)
      .bindPopup(createMarkerPopup(group), { maxHeight: 260 })
      .addTo(markerLayer);
    positions.push(position);
  }

  if (positions.length > 0) {
    map.fitBounds(positions, {
      padding: [32, 32],
      maxZoom: 14
    });
  }
}

async function loadData() {
  try {
    const dataUrl = new URL("./data.json", import.meta.url);
    const response = await fetch(dataUrl);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    data = await response.json();

    showMapLegend();
    showButtons();
    showCards();
  } catch (error) {
    count.textContent = "データを読み込めませんでした。起動方法やファイル名を確認してください。";
  }
}

function getCategories() {
  const categories = data.map(item => item.category);
  return ["すべて", ...new Set(categories)];
}

function countByCategory(category) {
  if (category === "すべて") {
    return data.length;
  }

  return data.filter(item => item.category === category).length;
}

function showButtons() {
  buttons.innerHTML = "";

  for (const category of getCategories()) {
    const button = document.createElement("button");
    button.textContent = `${category}（${countByCategory(category)}）`;

    if (category === currentCategory) {
      button.classList.add("active");
    }

    button.onclick = () => {
      currentCategory = category;
      showButtons();
      showCards();
    };

    buttons.appendChild(button);
  }
}

function matchKeyword(item) {
  const keyword = currentKeyword.trim();

  if (keyword === "") {
    return true;
  }

  const text = [
    item.title,
    item.description,
    item.category,
    item.subcategory,
    item.address
  ].join(" ");

  return text.includes(keyword);
}

function getFilteredItems() {
  return data.filter(item => {
    const matchCategory =
      currentCategory === "すべて" || item.category === currentCategory;

    return matchCategory && matchKeyword(item);
  });
}

function createMapLink(address) {
  const query = encodeURIComponent(address);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function createTelLink(tel) {
  return tel.replaceAll("-", "");
}

function showCards() {
  cards.innerHTML = "";

  const items = getFilteredItems();
  count.textContent = `${items.length}件を表示中`;
  showMarkers(items);

  if (items.length === 0) {
    cards.innerHTML = `<p class="empty">条件に合うスポットが見つかりませんでした。</p>`;
    return;
  }

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "card";

    const mapLink = item.address ? createMapLink(item.address) : "";
    const telLink = item.tel ? createTelLink(item.tel) : "";

    card.innerHTML = `
        ${item.image_url ? `<img src="${item.image_url}" alt="${item.title}の写真">` : ""}
        <div class="card-body">
        <p class="category">${item.category} / ${item.subcategory}</p>
        <h2>${item.title}</h2>
        <p>${item.description}</p>

        <div class="links">
            ${item.fee === "無料" ? `<p class="badge">無料</p>` : ""}
            ${item.address ? `<a href="${mapLink}" target="_blank" rel="noopener noreferrer">地図で検索</a>` : ""}
            ${item.tel ? `<a href="tel:${telLink}">電話する</a>` : ""}
            <a href="${item.page_url}" target="_blank" rel="noopener noreferrer">神山マップで見る</a>
        </div>
        </div>
    `;

    cards.appendChild(card);
    }
}

search.addEventListener("input", () => {
  currentKeyword = search.value;
  showCards();
});

showMap();
loadData();
