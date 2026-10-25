const movies = [
  {
    id: "past-lives",
    title: "Past Lives",
    year: 2023,
    genre: "Drama",
    rating: "8.0",
    image: "photo-1470252649378-9c29740c9fa8",
    imagePosition: "center 55%",
    runtime: "1h 45m",
    description:
      "Two deeply connected childhood friends are wrested apart after one family moves away. Decades later, they reunite for one fateful week and reckon with what could have been.",
  },
  {
    id: "perfect-days",
    title: "Perfect Days",
    year: 2023,
    genre: "Drama",
    rating: "7.9",
    image: "photo-1441974231531-c6227db76b6e",
    imagePosition: "center 50%",
    runtime: "2h 4m",
    description:
      "Hirayama finds quiet beauty in the everyday rituals of his neatly structured life in Tokyo, until a series of unexpected encounters slowly reveal his past.",
  },
  {
    id: "into-the-wild",
    title: "Into the Wild",
    year: 2007,
    genre: "Adventure",
    rating: "8.0",
    image: "photo-1464822759023-fed622ff2c3b",
    imagePosition: "center 45%",
    runtime: "2h 28m",
    description:
      "After graduating, a young man abandons his possessions and sets off on a journey through the American wilderness in search of meaning and freedom.",
  },
  {
    id: "interstellar",
    title: "Interstellar",
    year: 2014,
    genre: "Sci-Fi",
    rating: "8.7",
    image: "photo-1446776811953-b23d57bd21aa",
    imagePosition: "center 55%",
    runtime: "2h 49m",
    description:
      "With Earth's future hanging in the balance, a team of explorers travels beyond this galaxy to discover whether mankind has a future among the stars.",
  },
  {
    id: "little-miss-sunshine",
    title: "Little Miss Sunshine",
    year: 2006,
    genre: "Comedy",
    rating: "7.8",
    image: "photo-1500530855697-b586d89ba3ee",
    imagePosition: "center 50%",
    runtime: "1h 41m",
    description:
      "A delightfully mismatched family piles into their old van for a cross-country trip to support the youngest member's unlikely beauty pageant dream.",
  },
  {
    id: "spirited-away",
    title: "Spirited Away",
    year: 2001,
    genre: "Animation",
    rating: "8.6",
    image: "photo-1518709268805-4e9042af9f23",
    imagePosition: "center 50%",
    runtime: "2h 5m",
    description:
      "A sullen girl wanders into a world ruled by gods, witches, and spirits, where she must find the courage to save her parents and return home.",
  },
  {
    id: "the-secret-life",
    title: "The Secret Life of Walter Mitty",
    year: 2013,
    genre: "Adventure",
    rating: "7.3",
    image: "photo-1500534623283-312aade485b7",
    imagePosition: "center 45%",
    runtime: "1h 54m",
    description:
      "A daydreaming photo editor steps out of his ordinary life and embarks on an extraordinary global adventure to find a missing photograph.",
  },
  {
    id: "hunt-for-the-wilderpeople",
    title: "Hunt for the Wilderpeople",
    year: 2016,
    genre: "Comedy",
    rating: "7.8",
    image: "photo-1470770841072-f978cf4d019e",
    imagePosition: "center 60%",
    runtime: "1h 41m",
    description:
      "A rebellious city kid and his gruff foster uncle become the subjects of a nationwide manhunt after getting lost in the New Zealand bush.",
  },
];

const imageUrl = (image, width = 700) =>
  `https://images.unsplash.com/${image}?auto=format&fit=crop&w=${width}&q=80`;
const featuredMovie = movies[2];
const movieList = document.querySelector("#movie-list");
const searchInput = document.querySelector("#movie-search");
const genreButtons = [...document.querySelectorAll(".genre-chip")];
const watchlistFilter = document.querySelector("#watchlist-filter");
const watchlistCount = document.querySelector("#watchlist-count");
const resultsTitle = document.querySelector("#results-title");
const resultsCount = document.querySelector("#results-count");
const emptyState = document.querySelector("#empty-state");
const dialog = document.querySelector("#movie-dialog");
const savedMovies = new Set(loadWatchlist());
let selectedGenre = "All";
let showWatchlist = false;

function loadWatchlist() {
  try {
    const stored = JSON.parse(localStorage.getItem("stillframe-watchlist") || "[]");
    return Array.isArray(stored) ? stored.filter((id) => movies.some((movie) => movie.id === id)) : [];
  } catch (error) {
    console.error("Could not read the saved watchlist.", error);
    return [];
  }
}

function saveWatchlist() {
  try {
    localStorage.setItem("stillframe-watchlist", JSON.stringify([...savedMovies]));
  } catch (error) {
    console.error("Could not save the watchlist.", error);
  }
  updateWatchlistCount();
}

function updateWatchlistCount() {
  watchlistCount.textContent = String(savedMovies.size);
}

function renderMovies() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const visibleMovies = movies.filter((movie) => {
    const matchesGenre = selectedGenre === "All" || movie.genre === selectedGenre;
    const matchesQuery = `${movie.title} ${movie.genre} ${movie.year}`.toLocaleLowerCase().includes(query);
    const matchesWatchlist = !showWatchlist || savedMovies.has(movie.id);
    return matchesGenre && matchesQuery && matchesWatchlist;
  });

  movieList.innerHTML = visibleMovies
    .map((movie) => {
      const isSaved = savedMovies.has(movie.id);
      return `
        <article class="movie-card">
          <div class="poster-wrap">
            <img
              class="poster-image"
              src="${imageUrl(movie.image)}"
              alt="${movie.title} — ${movie.genre.toLowerCase()} film"
              loading="lazy"
              style="object-position: ${movie.imagePosition}"
            />
            <span class="rating"><span aria-hidden="true">★</span> ${movie.rating}</span>
            <button
              class="save-button${isSaved ? " is-saved" : ""}"
              type="button"
              data-save="${movie.id}"
              aria-label="${isSaved ? "Remove" : "Add"} ${movie.title} ${isSaved ? "from" : "to"} watchlist"
              aria-pressed="${isSaved}"
            >${isSaved ? "♥" : "♡"}</button>
            <span class="poster-genre">${movie.genre}</span>
          </div>
          <div class="movie-info">
            <h4 class="movie-title" data-details="${movie.id}" tabindex="0" role="button">${movie.title}</h4>
            <span class="movie-year">${movie.year}</span>
          </div>
          <p class="movie-subtitle">${movie.runtime} <span aria-hidden="true">·</span> A Hex Movies pick</p>
        </article>`;
    })
    .join("");

  resultsCount.textContent = `${visibleMovies.length} ${visibleMovies.length === 1 ? "film" : "films"}`;
  emptyState.hidden = visibleMovies.length > 0;
  movieList.hidden = visibleMovies.length === 0;
  resultsTitle.textContent = showWatchlist ? "Your watchlist" : "Handpicked for you";
}

function toggleSavedMovie(id) {
  if (savedMovies.has(id)) {
    savedMovies.delete(id);
  } else {
    savedMovies.add(id);
  }
  saveWatchlist();
  renderMovies();
  updateFeaturedButton();
  updateDialogButton(id);
}

function updateFeaturedButton() {
  const isSaved = savedMovies.has(featuredMovie.id);
  document.querySelector("#featured-save").innerHTML = isSaved
    ? '<span aria-hidden="true">✓</span> Added to watchlist'
    : '<span aria-hidden="true">＋</span> Add to watchlist';
}

function updateDialogButton(id) {
  if (dialog.dataset.movieId !== id) return;
  const isSaved = savedMovies.has(id);
  document.querySelector("#dialog-save").textContent = isSaved
    ? "✓ Added to watchlist"
    : "＋ Add to watchlist";
}

function setWatchlistMode(enabled) {
  showWatchlist = enabled;
  if (enabled) {
    selectedGenre = "All";
    searchInput.value = "";
    genreButtons.forEach((button) => {
      const isSelected = button.dataset.genre === "All";
      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-pressed", String(isSelected));
    });
  }
  watchlistFilter.setAttribute("aria-pressed", String(enabled));
  renderMovies();
}

function openMovieDetails(movie) {
  document.querySelector("#dialog-image").src = imageUrl(movie.image, 900);
  document.querySelector("#dialog-image").alt = `${movie.title} landscape`;
  document.querySelector("#dialog-kicker").textContent = `${movie.genre} · A STILLFRAME PICK`;
  document.querySelector("#dialog-title").textContent = movie.title;
  document.querySelector("#dialog-meta").textContent = `${movie.year}  ·  ${movie.runtime}  ·  ★ ${movie.rating}`;
  document.querySelector("#dialog-description").textContent = movie.description;
  dialog.dataset.movieId = movie.id;
  updateDialogButton(movie.id);
  dialog.showModal();
}

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

searchInput.addEventListener("input", renderMovies);

watchlistFilter.addEventListener("click", () => {
  setWatchlistMode(!showWatchlist);
  if (showWatchlist) {
    document.querySelector("#movie-grid").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

document.querySelector("#nav-watchlist").addEventListener("click", () => {
  setWatchlistMode(true);
});

movieList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const saveButton = target.closest("[data-save]");
  if (saveButton instanceof HTMLButtonElement) {
    toggleSavedMovie(saveButton.dataset.save);
    return;
  }
  const detailsTarget = target.closest("[data-details]");
  if (detailsTarget instanceof HTMLElement) {
    const movie = movies.find((item) => item.id === detailsTarget.dataset.details);
    if (movie) openMovieDetails(movie);
  }
});

movieList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = event.target;
  if (!(target instanceof HTMLElement) || !target.matches("[data-details]")) return;
  event.preventDefault();
  const movie = movies.find((item) => item.id === target.dataset.details);
  if (movie) openMovieDetails(movie);
});

document.querySelector("#featured-details").addEventListener("click", () => openMovieDetails(featuredMovie));
document.querySelector("#featured-save").addEventListener("click", () => toggleSavedMovie(featuredMovie.id));
document.querySelector("#dialog-save").addEventListener("click", () => toggleSavedMovie(dialog.dataset.movieId));
document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
document.querySelector("#reset-filters").addEventListener("click", () => {
  searchInput.value = "";
  selectedGenre = "All";
  genreButtons.forEach((button) => {
    const isSelected = button.dataset.genre === "All";
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
  setWatchlistMode(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    searchInput.focus();
  }
});

updateWatchlistCount();
updateFeaturedButton();
renderMovies();
