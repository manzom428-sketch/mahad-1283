// PetScore app.js
// Step 1: email + password sign-in, sign-up, persistent session, sign-out.

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = window.PETSCORE_CONFIG;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

// ---------- Elements ----------
const screenAuth = document.getElementById("screen-auth");
const screenHome = document.getElementById("screen-home");
const authTitle = document.getElementById("auth-title");
const authMessage = document.getElementById("auth-message");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authHint = document.getElementById("auth-hint");
const authSubmit = document.getElementById("auth-submit");
const authSwitch = document.getElementById("auth-switch");
const authSwitchText = document.getElementById("auth-switch-text");
const homeEmail = document.getElementById("home-email");
const signoutBtn = document.getElementById("signout-btn");

let mode = "signin"; // "signin" or "signup"

// ---------- Helpers ----------
function showMessage(text, type) {
  authMessage.textContent = text;
  authMessage.className = "msg " + type;
  authMessage.hidden = false;
}

function clearMessage() {
  authMessage.hidden = true;
  authMessage.textContent = "";
}

function validateEmail(email) {
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  return ok ? null : "Enter a valid email address.";
}

function validatePassword(password) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password)) return "Password needs at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password needs at least one lowercase letter.";
  if (!/[0-9]/.test(password)) return "Password needs at least one number.";
  return null;
}

function friendlyError(error) {
  const text = (error && error.message) || "Something went wrong. Try again.";
  if (/invalid login credentials/i.test(text)) return "Wrong email or password.";
  if (/email not confirmed/i.test(text)) return "Confirm your email first, using the link we sent you.";
  if (/already registered/i.test(text)) return "That email already has an account. Sign in instead.";
  if (/rate limit/i.test(text)) return "Too many attempts. Wait a few minutes and try again.";
  return text;
}

function setMode(newMode) {
  mode = newMode;
  clearMessage();
  if (mode === "signin") {
    authTitle.textContent = "Sign in";
    authSubmit.textContent = "Sign in";
    authSwitchText.textContent = "New here?";
    authSwitch.textContent = "Create an account";
    authPassword.autocomplete = "current-password";
    authHint.hidden = true;
  } else {
    authTitle.textContent = "Create your account";
    authSubmit.textContent = "Create account";
    authSwitchText.textContent = "Already have an account?";
    authSwitch.textContent = "Sign in";
    authPassword.autocomplete = "new-password";
    authHint.hidden = false;
  }
}

function showScreen(session) {
  if (session) {
    homeEmail.textContent = session.user.email || "";
    screenAuth.hidden = true;
    screenHome.hidden = false;
  } else {
    screenHome.hidden = true;
    screenAuth.hidden = false;
  }
}

// ---------- Auth actions ----------
async function handleSubmit() {
  clearMessage();
  const email = authEmail.value.trim();
  const password = authPassword.value;

  const emailError = validateEmail(email);
  if (emailError) return showMessage(emailError, "error");

  if (mode === "signup") {
    const passwordError = validatePassword(password);
    if (passwordError) return showMessage(passwordError, "error");
  } else if (!password) {
    return showMessage("Enter your password.", "error");
  }

  authSubmit.disabled = true;
  try {
    if (mode === "signin") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) showMessage(friendlyError(error), "error");
      // On success, onAuthStateChange switches the screen.
    } else {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) {
        showMessage(friendlyError(error), "error");
      } else if (!data.session) {
        // Email confirmation is turned on in Supabase.
        showMessage("Account created. Check your email for a confirmation link, then sign in.", "ok");
        setMode("signin");
        showMessage("Account created. Check your email for a confirmation link, then sign in.", "ok");
      }
      // If a session came back, onAuthStateChange switches the screen.
    }
  } catch (err) {
    showMessage(friendlyError(err), "error");
  } finally {
    authSubmit.disabled = false;
  }
}

async function handleSignOut() {
  await sb.auth.signOut();
}

// ---------- Wire up events ----------
authSubmit.addEventListener("click", handleSubmit);
authSwitch.addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));
signoutBtn.addEventListener("click", handleSignOut);
[authEmail, authPassword].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSubmit();
  });
});

// ---------- Session handling ----------
sb.auth.onAuthStateChange((_event, session) => {
  showScreen(session);
});

(async function init() {
  const { data } = await sb.auth.getSession();
  showScreen(data.session);
})();
