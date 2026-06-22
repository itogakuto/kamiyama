const buttons = document.querySelector("#buttons");
const cards = document.querySelector("#cards");
const count = document.querySelector("#count");
const search = document.querySelector("#search");

let data = [];
let currentCategory = "すべて";
let currentKeyword = "";

async function loadData() {
  try {
    const response = await fetch("./data.json");
    data = await response.json();

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

loadData();