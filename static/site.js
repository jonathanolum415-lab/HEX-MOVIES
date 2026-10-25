const searchInput = document.querySelector("#movie-search");
const movieCards = [...document.querySelectorAll(".movie-card")];
const genreButtons = [...document.querySelectorAll(".genre-chip")];
const resultsCount = document.querySelector("#results-count");
const emptyState = document.querySelector("#empty-state");
let selectedGenre = "all";

function renderMovies() {
  if (!searchInput || !resultsCount || !emptyState) return;
  const query = searchInput.value.trim().toLocaleLowerCase();
  let visibleCount = 0;

  for (const card of movieCards) {
    const titleMatches = card.dataset.title.includes(query);
    const yearMatches = card.dataset.year.includes(query);
    const genreMatchesSearch = card.dataset.genre.includes(query);
    const genreMatchesFilter =
      selectedGenre === "all" ||
      card.dataset.genre.split(",").some((genre) => genre.trim() === selectedGenre);
    const isVisible =
      (titleMatches || yearMatches || genreMatchesSearch) && genreMatchesFilter;
    card.hidden = !isVisible;
    if (isVisible) visibleCount += 1;
  }

  resultsCount.textContent = `${visibleCount} ${visibleCount === 1 ? "film" : "films"}`;
  emptyState.hidden = visibleCount > 0;
}

searchInput?.addEventListener("input", renderMovies);

genreButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedGenre = button.dataset.genre;
    genreButtons.forEach((chip) => {
      const isSelected = chip === button;
      chip.classList.toggle("is-selected", isSelected);
      chip.setAttribute("aria-pressed", String(isSelected));
    });
    renderMovies();
  });
});

document.querySelector("#reset-filters")?.addEventListener("click", () => {
  searchInput.value = "";
  selectedGenre = "all";
  genreButtons.forEach((button) => {
    const isSelected = button.dataset.genre === "all";
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  renderMovies();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    searchInput?.focus();
  }
});
