// PetScore app.js
// Sign-in (email + GitHub), username setup, feed with ratings and comments,
// photo upload with visibility, settings and change password.

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = window.PETSCORE_CONFIG;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const BUCKET = "pet-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const FILE_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const VISIBILITY_LABELS = { nobody: "Only me", friends: "Specific people", everyone: "Everyone" };

const $ = (id) => document.getElementById(id);

// ---------- State ----------
let currentUser = null;       // Supabase auth user
let currentProfile = null;    // { id, username }
let profilesById = {};        // id -> username
let selectedFriends = new Set();
let authMode = "signin";      // "signin" or "signup"
let sessionToken = 0;
let previewUrl = null;

// ---------- Small helpers ----------
function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  if (opts.on) for (const [k, v] of Object.entries(opts.on)) node.addEventListener(k, v);
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function showMsg(node, text, type) {
  node.textContent = text;
  node.className = "msg " + type;
  node.hidden = false;
}

function clearMsg(node) {
  node.hidden = true;
  node.textContent = "";
}

function showOnly(name) {
  $("screen-auth").hidden = name !== "auth";
  $("screen-username").hidden = name !== "username";
  $("screen-app").hidden = name !== "app";
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : "Enter a valid email address.";
}

function validatePassword(password) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password needs at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password needs at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password needs at least one number.";
  return null;
}

function validateUsername(name) {
  return /^[A-Za-z0-9_]{3,20}$/.test(name)
    ? null
    : "Username must be 3 to 20 characters: letters, numbers, and underscores.";
}

function friendlyError(error) {
  const text = (error && error.message) || "Something went wrong. Try again.";
  if (/invalid login credentials/i.test(text)) return "Wrong email or password.";
  if (/email not confirmed/i.test(text)) return "Confirm your email first, using the link we sent you.";
  if (/already registered/i.test(text)) return "That email already has an account. Sign in instead.";
  if (/rate limit/i.test(text)) return "Too many attempts. Wait a few minutes and try again.";
  if (/different from the old password/i.test(text)) return "Your new password must be different from the old one.";
  return text;
}

function appUrl() {
  return new URL("./", window.location.href).href;
}

// ---------- Screen 1: Sign in / Sign up ----------
function setAuthMode(mode) {
  authMode = mode;
  clearMsg($("auth-message"));
  if (mode === "signin") {
    $("auth-title").textContent = "Sign in";
    $("auth-submit").textContent = "Sign in";
    $("auth-switch-text").textContent = "New here?";
    $("auth-switch").textContent = "Create an account";
    $("auth-password").autocomplete = "current-password";
    $("auth-hint").hidden = true;
  } else {
    $("auth-title").textContent = "Create your account";
    $("auth-submit").textContent = "Create account";
    $("auth-switch-text").textContent = "Already have an account?";
    $("auth-switch").textContent = "Sign in";
    $("auth-password").autocomplete = "new-password";
    $("auth-hint").hidden = false;
  }
}

async function handleAuthSubmit() {
  const msg = $("auth-message");
  clearMsg(msg);
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;

  const emailError = validateEmail(email);
  if (emailError) return showMsg(msg, emailError, "error");

  if (authMode === "signup") {
    const passwordError = validatePassword(password);
    if (passwordError) return showMsg(msg, passwordError, "error");
  } else if (!password) {
    return showMsg(msg, "Enter your password.", "error");
  }

  $("auth-submit").disabled = true;
  try {
    if (authMode === "signin") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) showMsg(msg, friendlyError(error), "error");
    } else {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: appUrl() }
      });
      if (error) {
        showMsg(msg, friendlyError(error), "error");
      } else if (!data.session) {
        setAuthMode("signin");
        showMsg(msg, "Account created. Check your email for a confirmation link, then sign in.", "ok");
      }
    }
  } catch (err) {
    showMsg(msg, friendlyError(err), "error");
  } finally {
    $("auth-submit").disabled = false;
  }
}

async function handleGitHubSignIn() {
  const msg = $("auth-message");
  clearMsg(msg);
  const { error } = await sb.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: appUrl() }
  });
  if (error) showMsg(msg, friendlyError(error), "error");
}

async function handleSignOut() {
  await sb.auth.signOut();
}

// ---------- Session handling ----------
async function handleSession(session) {
  const token = ++sessionToken;

  if (!session) {
    currentUser = null;
    currentProfile = null;
    profilesById = {};
    selectedFriends = new Set();
    $("feed-list").replaceChildren();
    showOnly("auth");
    return;
  }

  // Same signed-in person and already set up: just keep the fresh user object.
  if (currentUser && currentProfile && currentUser.id === session.user.id) {
    currentUser = session.user;
    return;
  }

  currentUser = session.user;
  const { data, error } = await sb
    .from("profiles")
    .select("id, username")
    .eq("id", currentUser.id)
    .maybeSingle();
  if (token !== sessionToken) return;

  if (error) {
    showOnly("auth");
    showMsg($("auth-message"), "Could not load your profile: " + error.message, "error");
    return;
  }
  if (!data) {
    clearMsg($("username-message"));
    showOnly("username");
    return;
  }
  currentProfile = data;
  await enterApp();
}

async function enterApp() {
  showOnly("app");
  $("nav-user").textContent = currentProfile.username;
  setView("feed");
}

// ---------- Screen 2: Username setup ----------
async function saveNewUsername() {
  const msg = $("username-message");
  clearMsg(msg);
  const name = $("username-input").value.trim();
  const problem = validateUsername(name);
  if (problem) return showMsg(msg, problem, "error");

  $("username-save").disabled = true;
  const { data, error } = await sb
    .from("profiles")
    .insert({ id: currentUser.id, username: name })
    .select("id, username")
    .single();
  $("username-save").disabled = false;

  if (error) {
    showMsg(msg, error.code === "23505" ? "That username is taken. Try another." : error.message, "error");
    return;
  }
  currentProfile = data;
  await enterApp();
}

// ---------- Navigation ----------
function setView(name) {
  for (const view of ["feed", "upload", "settings"]) {
    $("view-" + view).hidden = view !== name;
  }
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === name);
  });
  if (name === "feed") loadFeed();
  if (name === "upload") loadProfiles().then(renderFriendList);
  if (name === "settings") fillSettings();
}

async function loadProfiles() {
  const { data, error } = await sb.from("profiles").select("id, username");
  if (error || !data) return;
  profilesById = {};
  data.forEach((p) => { profilesById[p.id] = p.username; });
}

// ---------- Screen 3: Feed ----------
function formatAverage(ratings) {
  const scores = ratings.map((r) => r.rating).filter((n) => typeof n === "number");
  if (scores.length === 0) return null;
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { value: mean.toFixed(1), count: scores.length };
}

function usernameFor(id) {
  return profilesById[id] || "someone";
}

async function loadFeed() {
  const status = $("feed-status");
  status.textContent = "Loading photos...";
  status.hidden = false;

  await loadProfiles();

  const { data: photos, error } = await sb
    .from("photos")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    status.textContent = "Could not load the feed: " + error.message;
    return;
  }
  if (!photos || photos.length === 0) {
    $("feed-list").replaceChildren();
    status.textContent = "No photos yet. Post the first pet from the Post a pet tab.";
    return;
  }

  const ids = photos.map((p) => p.id);
  const paths = photos.map((p) => p.image_url);
  const [ratingsRes, urlsRes] = await Promise.all([
    sb.from("ratings_and_comments").select("*").in("photo_id", ids).order("created_at", { ascending: true }),
    sb.storage.from(BUCKET).createSignedUrls(paths, 3600)
  ]);

  const ratingsByPhoto = {};
  (ratingsRes.data || []).forEach((r) => {
    (ratingsByPhoto[r.photo_id] = ratingsByPhoto[r.photo_id] || []).push(r);
  });
  const urlByPath = {};
  (urlsRes.data || []).forEach((u) => { if (u.signedUrl) urlByPath[u.path] = u.signedUrl; });

  const cards = photos.map((p) => renderPost(p, ratingsByPhoto[p.id] || [], urlByPath[p.image_url]));
  $("feed-list").replaceChildren(...cards);
  status.hidden = true;
}

function renderPost(photo, ratings, imageUrl) {
  const avg = formatAverage(ratings);
  const mine = ratings.find((r) => r.user_id === currentUser.id);

  // Average score, shown above the image
  const avgBar = el("div", { className: "avg-bar" }, avg
    ? [
        el("span", { className: "avg-num", text: avg.value }),
        el("span", { className: "avg-of", text: "/ 10 average" }),
        el("span", { className: "avg-count", text: avg.count + (avg.count === 1 ? " rating" : " ratings") })
      ]
    : [el("span", { className: "avg-of", text: "Not rated yet" })]);

  const image = imageUrl
    ? el("img", { className: "photo", attrs: { src: imageUrl, alt: photo.pet_name, loading: "lazy" } })
    : el("div", { className: "photo-missing", text: "Photo unavailable" });

  // Title, meta, caption
  const body = el("div", { className: "post-body" });
  if (photo.user_id === currentUser.id) {
    body.append(el("button", {
      className: "delete-btn", text: "Delete", attrs: { type: "button" },
      on: { click: () => deletePost(photo) }
    }));
  }
  body.append(el("h3", { className: "post-title", text: photo.pet_name }));
  body.append(el("p", {
    className: "meta",
    text: "by " + usernameFor(photo.user_id) + " \u00b7 " + VISIBILITY_LABELS[photo.visibility] +
      " \u00b7 " + new Date(photo.created_at).toLocaleDateString()
  }));
  if (photo.caption) body.append(el("p", { className: "caption", text: photo.caption }));

  // Individual scores and comments
  if (ratings.length > 0) {
    const list = el("ul", { className: "scores" });
    ratings.forEach((r) => {
      const row = el("li", {}, [
        el("strong", { text: usernameFor(r.user_id) }),
        el("span", { className: "score-pill", text: r.rating + "/10" })
      ]);
      if (r.comment) row.append(document.createTextNode(r.comment));
      list.append(row);
    });
    body.append(list);
  }

  // Rating and comment bar
  const slider = el("input", {
    attrs: { type: "range", min: "1", max: "10", step: "1", value: String(mine ? mine.rating : 5), "aria-label": "Your score from 1 to 10" }
  });
  const out = el("span", { className: "rate-out", text: slider.value });
  slider.addEventListener("input", () => { out.textContent = slider.value; });
  const comment = el("input", {
    attrs: { type: "text", maxlength: "300", placeholder: "Add a comment (optional)", "aria-label": "Comment" }
  });
  if (mine && mine.comment) comment.value = mine.comment;
  const note = el("div", { className: "msg", attrs: { role: "alert" } });
  note.hidden = true;
  const submit = el("button", {
    className: "primary", text: mine ? "Update my rating" : "Submit rating", attrs: { type: "button" }
  });
  submit.addEventListener("click", () => submitRating(photo.id, Number(slider.value), comment.value.trim(), submit, note));

  body.append(el("div", { className: "rate-form" }, [
    el("div", { className: "rate-row" }, [slider, out]),
    comment,
    note,
    submit
  ]));

  return el("article", { className: "card post" }, [avgBar, image, body]);
}

async function submitRating(photoId, rating, comment, button, note) {
  clearMsg(note);
  button.disabled = true;
  const { error } = await sb.from("ratings_and_comments").upsert(
    [{ photo_id: photoId, user_id: currentUser.id, rating, comment: comment || null }],
    { onConflict: "photo_id,user_id" }
  );
  button.disabled = false;
  if (error) return showMsg(note, "Could not save your rating: " + error.message, "error");
  loadFeed();
}

async function deletePost(photo) {
  if (!window.confirm("Delete " + photo.pet_name + "? This also removes its ratings and comments.")) return;
  await sb.storage.from(BUCKET).remove([photo.image_url]);
  const { error } = await sb.from("photos").delete().eq("id", photo.id);
  if (error) {
    window.alert("Could not delete: " + error.message);
    return;
  }
  loadFeed();
}

// ---------- Screen 4: Upload and post ----------
function currentVisibility() {
  return document.querySelector('input[name="visibility"]:checked').value;
}

function renderFriendList() {
  const query = $("friend-search").value.trim().toLowerCase();
  const people = Object.entries(profilesById)
    .filter(([id, name]) => id !== currentUser.id && name.toLowerCase().includes(query))
    .sort((a, b) => a[1].localeCompare(b[1]))
    .slice(0, 50);

  const rows = people.map(([id, name]) => {
    const box = el("input", { attrs: { type: "checkbox" } });
    box.checked = selectedFriends.has(id);
    box.addEventListener("change", () => {
      if (box.checked) selectedFriends.add(id); else selectedFriends.delete(id);
      updateFriendCount();
    });
    return el("label", { className: "user-row" }, [box, el("span", { text: name })]);
  });

  $("friend-list").replaceChildren(...(rows.length
    ? rows
    : [el("div", { className: "empty-note", text: "No one found. People show up here after they sign in and pick a username." })]));
  updateFriendCount();
}

function updateFriendCount() {
  const n = selectedFriends.size;
  $("friend-count").textContent = n + (n === 1 ? " person selected" : " people selected");
}

function handleFileChoice() {
  const msg = $("upload-message");
  clearMsg(msg);
  const file = $("photo-file").files[0];
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  $("upload-preview").hidden = true;
  if (!file) return;
  if (!FILE_TYPES[file.type]) {
    $("photo-file").value = "";
    return showMsg(msg, "Choose a JPG, PNG, or WebP image.", "error");
  }
  if (file.size > MAX_BYTES) {
    $("photo-file").value = "";
    return showMsg(msg, "That photo is over 5 MB. Choose a smaller one.", "error");
  }
  previewUrl = URL.createObjectURL(file);
  $("upload-preview").src = previewUrl;
  $("upload-preview").hidden = false;
}

async function submitPost() {
  const msg = $("upload-message");
  clearMsg(msg);

  const file = $("photo-file").files[0];
  const petName = $("pet-name").value.trim();
  const caption = $("pet-caption").value.trim();
  const visibility = currentVisibility();

  if (!file) return showMsg(msg, "Choose a photo first.", "error");
  if (!FILE_TYPES[file.type]) return showMsg(msg, "Choose a JPG, PNG, or WebP image.", "error");
  if (file.size > MAX_BYTES) return showMsg(msg, "That photo is over 5 MB.", "error");
  if (!petName) return showMsg(msg, "Enter your pet's name.", "error");
  if (visibility === "friends" && selectedFriends.size === 0) {
    return showMsg(msg, "Pick at least one person who can see this, or choose Everyone or Nobody.", "error");
  }

  $("post-btn").disabled = true;
  const photoId = crypto.randomUUID();
  const path = currentUser.id + "/" + photoId + "." + FILE_TYPES[file.type];

  try {
    const up = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) throw new Error("Upload failed: " + up.error.message);

    const ins = await sb.from("photos").insert({
      id: photoId, user_id: currentUser.id, image_url: path,
      pet_name: petName, caption: caption || null, visibility
    });
    if (ins.error) {
      await sb.storage.from(BUCKET).remove([path]);
      throw new Error("Could not save the post: " + ins.error.message);
    }

    if (visibility === "friends") {
      const rows = [...selectedFriends].map((friendId) => ({
        user_id: currentUser.id, friend_id: friendId, photo_id: photoId
      }));
      const fr = await sb.from("friendships").insert(rows);
      if (fr.error) {
        await sb.from("photos").delete().eq("id", photoId);
        await sb.storage.from(BUCKET).remove([path]);
        throw new Error("Could not save who can see it: " + fr.error.message);
      }
    }

    resetUploadForm();
    setView("feed");
  } catch (err) {
    showMsg(msg, err.message, "error");
  } finally {
    $("post-btn").disabled = false;
  }
}

function resetUploadForm() {
  $("photo-file").value = "";
  $("pet-name").value = "";
  $("pet-caption").value = "";
  $("friend-search").value = "";
  document.querySelector('input[name="visibility"][value="everyone"]').checked = true;
  $("friend-picker").hidden = true;
  selectedFriends = new Set();
  if (previewUrl) { URL.revokeObjectURL(previewUrl); previewUrl = null; }
  $("upload-preview").hidden = true;
}

// ---------- Screen 5: Settings and change password ----------
function isEmailUser() {
  return (currentUser.identities || []).some((i) => i.provider === "email");
}

function fillSettings() {
  clearMsg($("settings-message"));
  clearMsg($("password-message"));
  $("settings-email").textContent = currentUser.email
    ? "Signed in as " + currentUser.email
    : "Signed in with GitHub";
  $("settings-username").value = currentProfile.username;
  $("password-card").hidden = !isEmailUser();
}

async function saveSettingsUsername() {
  const msg = $("settings-message");
  clearMsg(msg);
  const name = $("settings-username").value.trim();
  const problem = validateUsername(name);
  if (problem) return showMsg(msg, problem, "error");
  if (name === currentProfile.username) return showMsg(msg, "That is already your username.", "ok");

  $("settings-save").disabled = true;
  const { data, error } = await sb
    .from("profiles")
    .update({ username: name })
    .eq("id", currentUser.id)
    .select("id, username")
    .single();
  $("settings-save").disabled = false;

  if (error) {
    return showMsg(msg, error.code === "23505" ? "That username is taken. Try another." : error.message, "error");
  }
  currentProfile = data;
  $("nav-user").textContent = data.username;
  showMsg(msg, "Username updated.", "ok");
}

async function changePassword() {
  const msg = $("password-message");
  clearMsg(msg);
  const next = $("new-password").value;
  const confirm = $("confirm-password").value;
  const problem = validatePassword(next);
  if (problem) return showMsg(msg, problem, "error");
  if (next !== confirm) return showMsg(msg, "The two passwords do not match.", "error");

  $("password-save").disabled = true;
  const { error } = await sb.auth.updateUser({ password: next });
  $("password-save").disabled = false;

  if (error) return showMsg(msg, friendlyError(error), "error");
  $("new-password").value = "";
  $("confirm-password").value = "";
  showMsg(msg, "Password updated.", "ok");
}

// ---------- Wire up events ----------
$("auth-submit").addEventListener("click", handleAuthSubmit);
$("github-btn").addEventListener("click", handleGitHubSignIn);
$("auth-switch").addEventListener("click", () => setAuthMode(authMode === "signin" ? "signup" : "signin"));
[$("auth-email"), $("auth-password")].forEach((input) => {
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") handleAuthSubmit(); });
});

$("username-save").addEventListener("click", saveNewUsername);
$("username-input").addEventListener("keydown", (e) => { if (e.key === "Enter") saveNewUsername(); });
$("username-signout").addEventListener("click", handleSignOut);

$("signout-btn").addEventListener("click", handleSignOut);
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

$("photo-file").addEventListener("change", handleFileChoice);
$("friend-search").addEventListener("input", renderFriendList);
document.querySelectorAll('input[name="visibility"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    $("friend-picker").hidden = currentVisibility() !== "friends";
  });
});
$("post-btn").addEventListener("click", submitPost);

$("settings-save").addEventListener("click", saveSettingsUsername);
$("password-save").addEventListener("click", changePassword);

// ---------- Start ----------
setAuthMode("signin");
sb.auth.onAuthStateChange((_event, session) => {
  // Run outside the callback so Supabase calls inside handleSession cannot deadlock.
  setTimeout(() => handleSession(session), 0);
});