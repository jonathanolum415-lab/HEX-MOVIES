import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.4.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  getAuth,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js";

const sampleMovies = [
  ["past-lives", "Past Lives", 2023, "Drama", 8.0, "1h 45m", "photo-1470252649378-9c29740c9fa8", "Two deeply connected childhood friends are wrested apart after one family moves away. Decades later, they reunite for one fateful week and reckon with what could have been."],
  ["perfect-days", "Perfect Days", 2023, "Drama", 7.9, "2h 4m", "photo-1441974231531-c6227db76b6e", "Hirayama finds quiet beauty in the everyday rituals of his neatly structured life in Tokyo, until a series of unexpected encounters slowly reveal his past."],
  ["into-the-wild", "Into the Wild", 2007, "Adventure", 8.0, "2h 28m", "photo-1464822759023-fed622ff2c3b", "After graduating, a young man abandons his possessions and sets off on a journey through the American wilderness in search of meaning and freedom."],
  ["interstellar", "Interstellar", 2014, "Sci-Fi", 8.7, "2h 49m", "photo-1446776811953-b23d57bd21aa", "With Earth's future hanging in the balance, a team of explorers travels beyond this galaxy to discover whether mankind has a future among the stars."],
  ["little-miss-sunshine", "Little Miss Sunshine", 2006, "Comedy", 7.8, "1h 41m", "photo-1500530855697-b586d89ba3ee", "A delightfully mismatched family piles into their old van for a cross-country trip to support the youngest member's unlikely beauty pageant dream."],
  ["spirited-away", "Spirited Away", 2001, "Animation", 8.6, "2h 5m", "photo-1518709268805-4e9042af9f23", "A sullen girl wanders into a world ruled by gods, witches, and spirits, where she must find the courage to save her parents and return home."],
  ["the-secret-life", "The Secret Life of Walter Mitty", 2013, "Adventure", 7.3, "1h 54m", "photo-1500534623283-312aade485b7", "A daydreaming photo editor steps out of his ordinary life and embarks on an extraordinary global adventure to find a missing photograph."],
  ["hunt-for-the-wilderpeople", "Hunt for the Wilderpeople", 2016, "Comedy", 7.8, "1h 41m", "photo-1470770841072-f978cf4d019e", "A rebellious city kid and his gruff foster uncle become the subjects of a nationwide manhunt after getting lost in the New Zealand bush."],
].map(([id, title, year, genre, rating, runtime, image, description]) => ({ id, title, year, genre, rating, runtime, image, description }));

const $ = (selector) => document.querySelector(selector);
const els = {
  list: $("#movie-list"), search: $("#movie-search"), status: $("#service-status"),
  watchlist: $("#watchlist-filter"), watchCount: $("#watchlist-count"),
  resultsTitle: $("#results-title"), resultsCount: $("#results-count"), empty: $("#empty-state"),
  dialog: $("#movie-dialog"), authDialog: $("#auth-dialog"), account: $("#account-button"),
  admin: $("#admin-panel"), adminMessage: $("#admin-message"), authMessage: $("#auth-message"),
};
let movies = sampleMovies;
let selectedGenre = "All";
let onlyWatchlist = false;
let savedMovies = new Set(readLocalWatchlist());
let currentUser = null;
let isAdmin = false;
let authMode = "signin";
let db = null;
let auth = null;
let firebaseReady = false;
let pendingSaveId = null;

function readLocalWatchlist() {
  try { const value = JSON.parse(localStorage.getItem("hex-movies-watchlist") || "[]"); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function validHttps(value) {
  try { return new URL(value).protocol === "https:" ? value : ""; } catch { return ""; }
}
function posterFor(movie) {
  return validHttps(movie.imageUrl || "") || `https://images.unsplash.com/${encodeURIComponent(movie.image || "photo-1489599849927-2ee91cede3ba")}?auto=format&fit=crop&w=700&q=80`;
}
function announce(message, kind = "info") {
  els.status.textContent = message;
  els.status.dataset.kind = kind;
  els.status.hidden = !message;
}
function setMessage(element, message) { element.textContent = message; }

function renderMovies() {
  const query = els.search.value.trim().toLocaleLowerCase();
  const visible = movies.filter((movie) => {
    const text = `${movie.title} ${movie.genre} ${movie.year}`.toLocaleLowerCase();
    return (selectedGenre === "All" || movie.genre === selectedGenre) && text.includes(query) && (!onlyWatchlist || savedMovies.has(movie.id));
  });
  els.resultsTitle.textContent = onlyWatchlist ? "Saved for later" : selectedGenre === "All" ? "Handpicked for you" : `${selectedGenre} films`;
  els.resultsCount.textContent = `${visible.length} ${visible.length === 1 ? "film" : "films"}`;
  els.empty.hidden = visible.length > 0;
  els.list.innerHTML = visible.map((movie) => {
    const id = escapeHTML(movie.id);
    const title = escapeHTML(movie.title);
    const genre = escapeHTML(movie.genre || "Film");
    const saved = savedMovies.has(movie.id);
    const adminActions = isAdmin ? `<div class="card-admin"><button type="button" data-edit="${id}">Edit</button><button type="button" data-delete="${id}">Remove</button></div>` : "";
    return `<article class="movie-card">
      <div class="poster-wrap"><img class="poster-image" src="${escapeHTML(posterFor(movie))}" alt="${title} poster" loading="lazy" />
        <span class="rating"><span aria-hidden="true">★</span> ${escapeHTML(movie.rating ?? "—")}</span>
        <button class="save-button${saved ? " is-saved" : ""}" type="button" data-save="${id}" aria-label="${saved ? "Remove" : "Add"} ${title} ${saved ? "from" : "to"} watchlist" aria-pressed="${saved}">${saved ? "♥" : "♡"}</button>
        <span class="poster-genre">${genre}</span>
      </div>
      <div class="movie-info"><h4 class="movie-title" data-details="${id}" tabindex="0" role="button">${title}</h4><span class="movie-year">${escapeHTML(movie.year ?? "")}</span></div>
      <p class="movie-subtitle">${escapeHTML(movie.runtime || "A Hex Movies pick")} <span aria-hidden="true">·</span> A Hex Movies pick</p>${adminActions}
    </article>`;
  }).join("");
  els.watchCount.textContent = String(savedMovies.size);
  const featured = movies.find((movie) => movie.id === "into-the-wild") || movies[0];
  if (featured) {
    $("#featured-details").onclick = () => openMovie(featured.id);
    $("#featured-save").onclick = () => toggleSaved(featured.id);
  }
}

function openMovie(id) {
  const movie = movies.find((item) => item.id === id);
  if (!movie) return;
  $("#dialog-image").src = posterFor(movie);
  $("#dialog-image").alt = `${movie.title} poster`;
  $("#dialog-kicker").textContent = `${movie.genre || "Film"} · ${movie.year || ""}`;
  $("#dialog-title").textContent = movie.title;
  $("#dialog-meta").textContent = `${movie.runtime || "Runtime unavailable"} · ★ ${movie.rating ?? "—"}`;
  $("#dialog-description").textContent = movie.description || "A story waiting to be discovered.";
  const save = $("#dialog-save");
  save.dataset.save = movie.id;
  save.textContent = savedMovies.has(movie.id) ? "♥ Saved to watchlist" : "♡ Add to watchlist";
  const watch = $("#dialog-watch");
  const url = validHttps(movie.videoUrl || "");
  watch.href = url;
  watch.hidden = !url;
  els.dialog.showModal();
}

async function toggleSaved(id) {
  if (firebaseReady && !currentUser) {
    pendingSaveId = id;
    openAuth("signin");
    return;
  }
  const next = new Set(savedMovies);
  if (next.has(id)) next.delete(id); else next.add(id);
  try {
    if (firebaseReady && currentUser) {
      const ref = doc(db, "users", currentUser.uid, "watchlist", id);
      if (next.has(id)) await setDoc(ref, { movieId: id, addedAt: serverTimestamp() }); else await deleteDoc(ref);
    } else {
      localStorage.setItem("hex-movies-watchlist", JSON.stringify([...next]));
    }
    savedMovies = next;
    renderMovies();
    if (els.dialog.open) openMovie(id);
  } catch (error) { announce(readableError(error), "error"); }
}

function readableError(error) {
  const messages = {
    "auth/email-already-in-use": "An account already uses that email.",
    "auth/invalid-credential": "That email and password do not match.",
    "auth/weak-password": "Choose a longer password.",
    "auth/too-many-requests": "Please wait a moment and try again.",
    "permission-denied": "This action is not allowed for this account.",
  };
  return messages[error?.code] || error?.message || "Something went wrong. Please try again.";
}

function openAuth(mode) {
  authMode = mode;
  const creating = mode === "signup";
  $("#auth-title").innerHTML = creating ? "Join the screening<span>.</span>" : "Welcome back<span>.</span>";
  $("#auth-copy").textContent = creating ? "Create a viewer account to keep your watchlist with you." : "Sign in to keep your watchlist with you.";
  $("#auth-submit").textContent = creating ? "Create viewer account" : "Sign in";
  $("#auth-password").autocomplete = creating ? "new-password" : "current-password";
  $("#auth-toggle").textContent = creating ? "Already have an account? Sign in →" : "New here? Create a viewer account →";
  setMessage(els.authMessage, "");
  if (!els.authDialog.open) els.authDialog.showModal();
}

async function loadCatalog() {
  const snapshot = await getDocs(collection(db, "movies"));
  if (snapshot.empty) { movies = sampleMovies; return; }
  movies = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  movies.sort((a, b) => Number(b.featured) - Number(a.featured) || String(a.title).localeCompare(String(b.title)));
}
async function loadWatchlist() {
  if (!currentUser) { savedMovies = new Set(readLocalWatchlist()); return; }
  const snapshot = await getDocs(collection(db, "users", currentUser.uid, "watchlist"));
  savedMovies = new Set(snapshot.docs.map((entry) => entry.id));
}
async function refreshAdmin() {
  if (!currentUser) { isAdmin = false; els.admin.hidden = true; return; }
  const adminDoc = await getDoc(doc(db, "admins", currentUser.uid));
  isAdmin = adminDoc.exists() && adminDoc.data().role === "owner";
  els.admin.hidden = !isAdmin;
}
async function syncUser(user) {
  currentUser = user;
  if (!user) {
    isAdmin = false;
    els.admin.hidden = true;
    els.account.textContent = "Sign in";
    savedMovies = new Set(readLocalWatchlist());
    renderMovies();
    return;
  }
  els.account.textContent = `Sign out · ${user.email || "viewer"}`;
  try {
    await Promise.all([loadWatchlist(), refreshAdmin()]);
    renderMovies();
    if (pendingSaveId) { const id = pendingSaveId; pendingSaveId = null; await toggleSaved(id); }
    announce(isAdmin ? "Signed in as the private library owner." : "Your watchlist is synced to your account.");
  } catch (error) { announce(readableError(error), "error"); }
}

async function saveMovie(event) {
  event.preventDefault();
  if (!isAdmin) return;
  const id = $("#movie-id").value;
  const previous = movies.find((movie) => movie.id === id);
  const fields = {
    title: $("#movie-title").value.trim(), genre: $("#movie-genre").value.trim(),
    year: Number($("#movie-year").value), rating: Number($("#movie-rating").value || 0),
    runtime: $("#movie-runtime").value.trim(), imageUrl: validHttps($("#movie-image").value.trim()),
    videoUrl: validHttps($("#movie-video").value.trim()), description: $("#movie-description").value.trim(),
    featured: previous?.featured === true,
  };
  if (!fields.title || !fields.genre || !Number.isInteger(fields.year)) { setMessage(els.adminMessage, "Add a title, genre, and valid year."); return; }
  try {
    const movieRef = id ? doc(db, "movies", id) : doc(collection(db, "movies"));
    await setDoc(movieRef, { ...fields, createdAt: previous?.createdAt || serverTimestamp(), updatedAt: serverTimestamp() });
    await loadCatalog(); renderMovies(); resetMovieForm();
    setMessage(els.adminMessage, "Film saved to the library.");
  } catch (error) { setMessage(els.adminMessage, readableError(error)); }
}
function resetMovieForm() {
  $("#movie-form").reset(); $("#movie-id").value = "";
  $("#movie-submit").textContent = "Add film"; $("#movie-cancel").hidden = true;
}
function editMovie(id) {
  const movie = movies.find((item) => item.id === id);
  if (!movie) return;
  $("#movie-id").value = movie.id; $("#movie-title").value = movie.title || "";
  $("#movie-genre").value = movie.genre || ""; $("#movie-year").value = movie.year || "";
  $("#movie-rating").value = movie.rating ?? ""; $("#movie-runtime").value = movie.runtime || "";
  $("#movie-image").value = movie.imageUrl || ""; $("#movie-video").value = movie.videoUrl || "";
  $("#movie-description").value = movie.description || "";
  $("#movie-submit").textContent = "Save changes"; $("#movie-cancel").hidden = false;
  $("#admin-panel").scrollIntoView({ behavior: "smooth" });
}

function bindEvents() {
  els.search.addEventListener("input", renderMovies);
  document.querySelectorAll(".genre-chip").forEach((button) => button.addEventListener("click", () => {
    selectedGenre = button.dataset.genre;
    document.querySelectorAll(".genre-chip").forEach((chip) => { const selected = chip === button; chip.classList.toggle("is-selected", selected); chip.setAttribute("aria-pressed", String(selected)); });
    renderMovies();
  }));
  els.watchlist.addEventListener("click", () => { onlyWatchlist = !onlyWatchlist; els.watchlist.setAttribute("aria-pressed", String(onlyWatchlist)); els.watchlist.classList.toggle("is-selected", onlyWatchlist); renderMovies(); });
  $("#nav-watchlist").addEventListener("click", (event) => { event.preventDefault(); onlyWatchlist = true; els.watchlist.setAttribute("aria-pressed", "true"); renderMovies(); $("#movie-grid").scrollIntoView({ behavior: "smooth" }); });
  $("#reset-filters").addEventListener("click", () => { selectedGenre = "All"; onlyWatchlist = false; els.search.value = ""; els.watchlist.setAttribute("aria-pressed", "false"); document.querySelector('[data-genre="All"]').click(); });
  $("#dialog-close").addEventListener("click", () => els.dialog.close());
  $("#auth-close").addEventListener("click", () => els.authDialog.close());
  $("#auth-toggle").addEventListener("click", () => openAuth(authMode === "signin" ? "signup" : "signin"));
  els.account.addEventListener("click", async () => { if (!firebaseReady) { announce("Add your Firebase web configuration to enable accounts.", "error"); return; } if (currentUser) await signOut(auth); else openAuth("signin"); });
  $("#auth-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!firebaseReady) { setMessage(els.authMessage, "Firebase is not configured for this app yet."); return; }
    const email = $("#auth-email").value.trim(); const password = $("#auth-password").value;
    try {
      if (authMode === "signup") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", credential.user.uid), { uid: credential.user.uid, displayName: email.split("@")[0].slice(0, 40), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      } else await signInWithEmailAndPassword(auth, email, password);
      els.authDialog.close();
    } catch (error) { setMessage(els.authMessage, readableError(error)); }
  });
  $("#movie-form").addEventListener("submit", saveMovie);
  $("#movie-cancel").addEventListener("click", resetMovieForm);
  els.list.addEventListener("click", async (event) => {
    const save = event.target.closest("[data-save]"); if (save) { await toggleSaved(save.dataset.save); return; }
    const edit = event.target.closest("[data-edit]"); if (edit && isAdmin) { editMovie(edit.dataset.edit); return; }
    const remove = event.target.closest("[data-delete]");
    if (remove && isAdmin) {
      const id = remove.dataset.delete;
      try { await deleteDoc(doc(db, "movies", id)); movies = movies.filter((movie) => movie.id !== id); renderMovies(); }
      catch (error) { announce(readableError(error), "error"); }
      return;
    }
    const details = event.target.closest("[data-details]"); if (details) openMovie(details.dataset.details);
  });
  els.list.addEventListener("keydown", (event) => { if ((event.key === "Enter" || event.key === " ") && event.target.matches("[data-details]")) { event.preventDefault(); openMovie(event.target.dataset.details); } });
  $("#dialog-save").addEventListener("click", (event) => toggleSaved(event.currentTarget.dataset.save));
  document.addEventListener("keydown", (event) => { if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) { event.preventDefault(); els.search.focus(); } });
}

bindEvents();
renderMovies();
const configured = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== "REPLACE_WITH_FIREBASE_WEB_CONFIG";
if (!configured) {
  announce("Preview mode: add the Firebase web app settings to connect accounts and the shared movie library.");
} else {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app); auth = getAuth(app); firebaseReady = true;
    onAuthStateChanged(auth, async (user) => {
      try { await loadCatalog(); } catch (error) { announce(readableError(error), "error"); }
      await syncUser(user);
      if (!user) renderMovies();
    });
    announce("Connecting to your movie library…");
  } catch (error) { announce(`Firebase could not start: ${readableError(error)}`, "error"); }
}
