import * as L from "leaflet";

const buttons = document.querySelector("#buttons");
const cards = document.querySelector("#cards");
const count = document.querySelector("#count");
const search = document.querySelector("#search");
const mapLegend = document.querySelector("#map-legend");
const mapModeNote = document.querySelector("#map-mode-note");
const mapModeButtons = [...document.querySelectorAll("[data-map-mode]")];
const routeSuggestions = document.querySelector("#route-suggestions");
const showAllSpotsButton = document.querySelector("#show-all-spots");
const showCurrentLocationButton = document.querySelector("#show-current-location");

const KAMIYAMA_CENTER = [33.97, 134.35];
const ILLUSTRATION_BOUNDS = L.latLngBounds(
  [33.895, 134.201],
  [34.069, 134.472]
);

const categoryStyles = {
  "食事": "food",
  "見どころ": "highlight",
  "情報": "information",
  "お土産": "souvenir",
  "宿泊": "stay"
};

const categoryIcons = {
  food: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v7m-3-7v4c0 2 1 3 3 3s3-1 3-3V3M7 10v11M16 3c-2 3-2 8 1 10v8m0-8c3-1 4-6 1-10"/></svg>',
  highlight: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 19 6-10 3 5 3-8 6 13z"/><path d="m7 12 2-3 2 3"/></svg>',
  information: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/></svg>',
  souvenir: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 13H6zM9 9V6a3 3 0 0 1 6 0v3"/></svg>',
  stay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/></svg>',
  other: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/></svg>'
};

const routeSuggestionList = [
  {
    id: "waterfall-and-sakura",
    meta: "半日 / 自然",
    duration: "約3時間",
    title: "滝と山里の水音ルート",
    summary: "道の駅を起点に、雨乞の滝、明王寺のしだれ桜、川魚料理まで山あいの景色をつなぎます。",
    stops: [
      "道の駅「温泉の里神山」",
      "雨乞の滝（あまごいのたき）",
      "明王寺（みょうおうじ）しだれ桜",
      "マスの家（神山スキーランド）"
    ]
  },
  {
    id: "culture-and-craft",
    meta: "半日 / 文化",
    duration: "約2時間",
    title: "寄井の文化と手しごとルート",
    summary: "劇場、木工プロダクト、アート作品、神社、温泉を中心部でめぐる、歩きやすい寄り道コースです。",
    stops: [
      "劇場寄井座",
      "SHIZQ STORE（しずくストア）",
      "大粟山アート作品",
      "上一之宮大粟神社",
      "神山温泉いやしの湯"
    ]
  },
  {
    id: "seasonal-flowers",
    meta: "半日 / 季節の花",
    duration: "約3時間30分",
    title: "梅と藤と桜の花めぐりルート",
    summary: "阿川の花どころから神光寺、ゆうかの里へ。季節ごとの花景色を追いかけるコースです。",
    stops: [
      "阿川梅の里（県下最大級）",
      "阿川ゆめの里",
      "峯長瀬の大けやき",
      "神光寺（じんこうじ）のぼり藤",
      "ゆうかの里"
    ]
  }
];

let data = [];
let currentCategory = "すべて";
let currentKeyword = "";
let currentMapMode = "illustration";
let visibleItems = [];
let map;
let markerLayer;
let routeLayer;
let mapModes;
let locationMarker;
let activeRouteId = "";
let selectedItemKeys = new Set();
let markerRecords = [];
const cardsByItemKey = new Map();

function showMap() {
  map = L.map("map", {
    zoomControl: false,
    scrollWheelZoom: false,
    maxBoundsViscosity: 1
  }).setView(KAMIYAMA_CENTER, 12);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  const illustrationLayer = L.imageOverlay(
    new URL("./assets/kamiyama-illustrated.svg", import.meta.url).href,
    ILLUSTRATION_BOUNDS,
    {
      alt: "神山町の輪郭、山地、鮎喰川、国道438号と主要道路を簡略化したイラスト",
      className: "illustrated-map-layer"
    }
  );

  const standardLayer = L.tileLayer(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  );

  const widePhotoLayer = L.tileLayer(
    "https://cyberjapandata.gsi.go.jp/xyz/lndst/{z}/{x}/{y}.png",
    {
      maxNativeZoom: 13,
      maxZoom: 13,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>'
    }
  );

  const detailedPhotoLayer = L.tileLayer(
    "https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg",
    {
      minZoom: 14,
      maxNativeZoom: 18,
      maxZoom: 18,
      attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>'
    }
  );

  mapModes = {
    illustration: {
      layer: illustrationLayer,
      minZoom: 10,
      maxZoom: 14,
      bounds: ILLUSTRATION_BOUNDS,
      note: "OSM由来の町境、主要道路、川、山頂、地区名を作成時に抽出し、固定SVGとして簡略化した観光イラストです。経路の確認には「地図」をご利用ください。"
    },
    standard: {
      layer: standardLayer,
      minZoom: 5,
      maxZoom: 19,
      note: "道路や地名を確認できる通常地図です。"
    },
    photo: {
      layer: L.layerGroup([widePhotoLayer, detailedPhotoLayer]),
      minZoom: 5,
      maxZoom: 18,
      note: "広域は衛星画像、拡大時は国土地理院の全国最新写真を表示します。撮影時期は場所により異なります。"
    }
  };

  routeLayer = L.layerGroup().addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  switchMapMode(currentMapMode);

  map.on("zoomend", () => {
    if (visibleItems.length > 0) {
      renderMarkers(visibleItems);
    }
  });
}

function switchMapMode(modeName) {
  const nextMode = mapModes[modeName];

  if (!nextMode) {
    return;
  }

  for (const mode of Object.values(mapModes)) {
    if (map.hasLayer(mode.layer)) {
      map.removeLayer(mode.layer);
    }
  }

  currentMapMode = modeName;
  nextMode.layer.addTo(map);
  markerLayer.bringToFront?.();

  map.setMinZoom(2);
  map.setMaxZoom(19);
  map.setMinZoom(nextMode.minZoom);
  map.setMaxZoom(nextMode.maxZoom);

  if (map.getZoom() < nextMode.minZoom) {
    map.setZoom(nextMode.minZoom);
  } else if (map.getZoom() > nextMode.maxZoom) {
    map.setZoom(nextMode.maxZoom);
  }

  map.setMaxBounds(nextMode.bounds ? nextMode.bounds.pad(0.05) : null);

  map.getContainer().dataset.mapMode = modeName;
  mapModeNote.textContent = nextMode.note;

  for (const button of mapModeButtons) {
    const isActive = button.dataset.mapMode === modeName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }

  if (activeRouteId) {
    const route = routeSuggestionList.find(candidate => candidate.id === activeRouteId);
    showRouteOnMap(route ? getRouteItems(route) : []);
  }
}

function createMarkerPopup(items) {
  const popup = document.createElement("div");
  popup.className = "map-popup";

  if (items.length > 1) {
    const summary = document.createElement("strong");
    summary.className = "map-popup-summary";
    summary.textContent = `${items.length}件のスポット`;
    popup.appendChild(summary);
  }

  for (const item of items) {
    const spot = document.createElement("div");
    spot.className = "map-popup-spot";

    if (item.image_url && items.length === 1) {
      const image = document.createElement("img");
      image.className = "map-popup-image";
      image.src = item.image_url;
      image.alt = `${item.title}の写真`;
      spot.appendChild(image);
    }

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

function getItemKey(item) {
  return `${item.title}|${item.latitude}|${item.longitude}`;
}

function createCategoryIcon(items) {
  const styles = new Set(items.map(item => getCategoryStyle(item.category)));
  const style = styles.size === 1 ? [...styles][0] : "mixed";
  const isSingle = items.length === 1;
  const content = isSingle
    ? categoryIcons[style] ?? categoryIcons.other
    : `<span class="map-marker-count">${items.length}</span>`;

  return L.divIcon({
    className: `map-marker map-marker--${style}${isSingle ? " map-marker--single" : " map-marker--cluster"}`,
    html: `<span class="map-marker-content">${content}</span>`,
    iconSize: [42, 48],
    iconAnchor: [21, 48],
    popupAnchor: [0, -45]
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

function getMarkerGroups(items) {
  const coordinateItems = items.filter(item =>
    Number.isFinite(item.latitude) &&
    Number.isFinite(item.longitude) &&
    item.coordinate_accuracy === "point"
  );
  const zoom = map.getZoom();
  const clusterDistance = zoom <= 12 ? 52 : zoom === 13 ? 44 : zoom === 14 ? 34 : 0;
  const groups = [];

  for (const item of coordinateItems) {
    const latLng = L.latLng(item.latitude, item.longitude);
    const point = map.project(latLng, zoom);
    let group = null;

    if (clusterDistance > 0) {
      group = groups.find(candidate => candidate.point.distanceTo(point) < clusterDistance);
    } else {
      group = groups.find(candidate =>
        candidate.items[0].latitude === item.latitude &&
        candidate.items[0].longitude === item.longitude
      );
    }

    if (group) {
      group.items.push(item);
      const size = group.items.length;
      group.point = L.point(
        (group.point.x * (size - 1) + point.x) / size,
        (group.point.y * (size - 1) + point.y) / size
      );
      group.position = map.unproject(group.point, zoom);
    } else {
      groups.push({ items: [item], point, position: latLng });
    }
  }

  return groups;
}

function renderMarkers(items) {
  markerLayer.clearLayers();
  markerRecords = [];

  for (const group of getMarkerGroups(items)) {
    const title = group.items.length === 1
      ? group.items[0].title
      : `${group.items.length}件のスポット`;
    const marker = L.marker(group.position, {
      icon: createCategoryIcon(group.items),
      title,
      riseOnHover: true
    })
      .bindPopup(createMarkerPopup(group.items), {
        maxHeight: 310,
        minWidth: group.items.length === 1 ? 220 : 190
      })
      .on("click", () => selectItems(group.items))
      .addTo(markerLayer);

    markerRecords.push({ marker, itemKeys: group.items.map(getItemKey) });
  }

  updateSelectionStyles();
}

function selectItems(items) {
  selectedItemKeys = new Set(items.map(getItemKey));
  updateSelectionStyles();
}

function clearActiveRoute() {
  activeRouteId = "";
  routeLayer?.clearLayers();
  showRouteSuggestions();
}

function updateSelectionStyles() {
  for (const [key, card] of cardsByItemKey) {
    card.classList.toggle("selected", selectedItemKeys.has(key));
  }

  for (const record of markerRecords) {
    const selected = record.itemKeys.some(key => selectedItemKeys.has(key));
    record.marker.getElement()?.classList.toggle("selected", selected);
  }
}

function fitMapToItems(items) {
  const positions = items
    .filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .map(item => [item.latitude, item.longitude]);

  if (positions.length === 0) {
    return;
  }

  map.fitBounds(positions, {
    paddingTopLeft: [36, 100],
    paddingBottomRight: [36, 42],
    maxZoom: 14
  });
}

function getRouteItems(route) {
  return route.stops
    .map(title => data.find(item => item.title === title))
    .filter(Boolean);
}

function showRouteOnMap(items) {
  if (!routeLayer) {
    return;
  }

  routeLayer.clearLayers();

  const positions = items
    .filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .map(item => [item.latitude, item.longitude]);

  if (positions.length < 2) {
    return;
  }

  L.polyline(positions, {
    color: "#cf6b3d",
    weight: 5,
    opacity: .9,
    dashArray: "10 9",
    lineCap: "round",
    lineJoin: "round"
  }).addTo(routeLayer);

  markerLayer.bringToFront?.();
}

function showRouteSuggestions() {
  if (!routeSuggestions) {
    return;
  }

  routeSuggestions.innerHTML = "";

  for (const route of routeSuggestionList) {
    const items = getRouteItems(route);

    if (items.length < 2) {
      continue;
    }

    const card = document.createElement("article");
    card.className = "route-card";
    card.classList.toggle("active", route.id === activeRouteId);

    const meta = document.createElement("p");
    meta.className = "route-meta";
    meta.textContent = route.meta;

    const title = document.createElement("h3");
    title.textContent = route.title;

    const summary = document.createElement("p");
    summary.className = "route-summary";
    summary.textContent = route.summary;

    const duration = document.createElement("p");
    duration.className = "route-duration";
    duration.innerHTML = `<span>所要時間</span>${route.duration}`;

    const stopList = document.createElement("ol");
    stopList.className = "route-stops";

    for (const [index, item] of items.entries()) {
      const stop = document.createElement("li");

      const number = document.createElement("span");
      number.className = "route-stop-number";
      number.textContent = String(index + 1);

      const body = document.createElement("span");
      body.className = "route-stop-body";

      const stopTitle = document.createElement("strong");
      stopTitle.textContent = item.title;

      const category = document.createElement("span");
      category.textContent = `${item.category} / ${item.subcategory}`;

      body.append(stopTitle, category);
      stop.append(number, body);
      stopList.appendChild(stop);
    }

    const button = document.createElement("button");
    button.className = "route-button";
    button.type = "button";
    button.textContent = route.id === activeRouteId ? "地図に表示中" : "地図で見る";
    button.setAttribute("aria-pressed", String(route.id === activeRouteId));
    button.addEventListener("click", () => selectRoute(route));

    card.append(meta, title, summary, duration, stopList, button);
    routeSuggestions.appendChild(card);
  }
}

function selectRoute(route) {
  const routeItems = getRouteItems(route);

  if (routeItems.length === 0) {
    return;
  }

  activeRouteId = route.id;
  currentCategory = "すべて";
  currentKeyword = "";
  search.value = "";
  selectedItemKeys = new Set(routeItems.map(getItemKey));

  showButtons();
  showCards();
  selectItems(routeItems);
  showRouteOnMap(routeItems);
  fitMapToItems(routeItems);
  showRouteSuggestions();

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelector(".map-section")?.scrollIntoView({
    behavior: prefersReducedMotion ? "auto" : "smooth",
    block: "start"
  });
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
    showRouteSuggestions();
    showButtons();
    showCards({ fitMap: true });
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
    button.type = "button";
    button.textContent = `${category}（${countByCategory(category)}）`;

    if (category === currentCategory) {
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }

    button.onclick = () => {
      currentCategory = category;
      selectedItemKeys.clear();
      clearActiveRoute();
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

function focusItemOnMap(item) {
  const itemKey = getItemKey(item);
  clearActiveRoute();
  selectItems([item]);
  map.setView([item.latitude, item.longitude], Math.max(map.getZoom(), 14), {
    animate: true
  });

  requestAnimationFrame(() => {
    const record = markerRecords.find(candidate => candidate.itemKeys.includes(itemKey));
    record?.marker.openPopup();
  });
}

function showCards({ fitMap = false } = {}) {
  cards.innerHTML = "";
  cardsByItemKey.clear();

  const items = getFilteredItems();
  visibleItems = items;
  count.textContent = `${items.length}件を表示中`;
  renderMarkers(items);

  if (fitMap) {
    fitMapToItems(items);
  }

  if (items.length === 0) {
    cards.innerHTML = '<p class="empty">条件に合うスポットが見つかりませんでした。</p>';
    return;
  }

  for (const item of items) {
    const card = document.createElement("article");
    const itemKey = getItemKey(item);
    card.className = "card";
    card.tabIndex = 0;
    card.setAttribute("aria-label", `${item.title}を地図で表示`);

    const mapLink = item.address ? createMapLink(item.address) : "";
    const telLink = item.tel ? createTelLink(item.tel) : "";

    card.innerHTML = `
      ${item.image_url ? `<img src="${item.image_url}" alt="${item.title}の写真">` : ""}
      <div class="card-body">
        <p class="category category--${getCategoryStyle(item.category)}">${item.category} / ${item.subcategory}</p>
        <h2>${item.title}</h2>
        <p>${item.description}</p>

        <div class="links">
          ${item.fee === "無料" ? '<p class="badge">無料</p>' : ""}
          ${item.address ? `<a href="${mapLink}" target="_blank" rel="noopener noreferrer">地図で検索</a>` : ""}
          ${item.tel ? `<a href="tel:${telLink}">電話する</a>` : ""}
          <a href="${item.page_url}" target="_blank" rel="noopener noreferrer">神山マップで見る</a>
        </div>
      </div>
    `;

    card.addEventListener("click", event => {
      if (!event.target.closest("a")) {
        focusItemOnMap(item);
      }
    });
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        focusItemOnMap(item);
      }
    });

    cardsByItemKey.set(itemKey, card);
    cards.appendChild(card);
  }

  updateSelectionStyles();
}

function showCurrentLocation() {
  if (!("geolocation" in navigator)) {
    mapModeNote.textContent = "このブラウザでは現在地を取得できません。";
    return;
  }

  showCurrentLocationButton.disabled = true;
  showCurrentLocationButton.textContent = "取得中...";

  navigator.geolocation.getCurrentPosition(
    position => {
      const latLng = [position.coords.latitude, position.coords.longitude];

      if (locationMarker) {
        locationMarker.setLatLng(latLng);
      } else {
        locationMarker = L.circleMarker(latLng, {
          radius: 8,
          color: "#fff",
          weight: 3,
          fillColor: "#276ef1",
          fillOpacity: 1
        }).bindPopup("現在地").addTo(map);
      }

      map.setView(latLng, Math.max(map.getZoom(), 14));
      locationMarker.openPopup();
      showCurrentLocationButton.disabled = false;
      showCurrentLocationButton.textContent = "現在地";
    },
    () => {
      mapModeNote.textContent = "現在地を取得できませんでした。ブラウザの位置情報設定をご確認ください。";
      showCurrentLocationButton.disabled = false;
      showCurrentLocationButton.textContent = "現在地";
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

search.addEventListener("input", () => {
  currentKeyword = search.value;
  selectedItemKeys.clear();
  clearActiveRoute();
  showCards();
});

for (const button of mapModeButtons) {
  button.addEventListener("click", () => switchMapMode(button.dataset.mapMode));
}

showAllSpotsButton.addEventListener("click", () => {
  clearActiveRoute();
  fitMapToItems(visibleItems);
});
showCurrentLocationButton.addEventListener("click", showCurrentLocation);

showMap();
loadData();
