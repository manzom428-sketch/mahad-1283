// Initialize Supabase Client
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI Elements
const authSection = document.getElementById("auth-section");
const appSection = document.getElementById("app-section");
const authForm = document.getElementById("auth-form");
const formTitle = document.getElementById("form-title");
const submitBtn = document.getElementById("submit-btn");
const toggleModeBtn = document.getElementById("toggle-mode-btn");
const messageDiv = document.getElementById("message");
const userEmailSpan = document.getElementById("user-email");
const signoutBtn = document.getElementById("signout-btn");

let isSignUpMode = false;

// Client-side Password Validation
// Minimum 8 characters, at least one uppercase letter, one lowercase letter, and one number
function validatePassword(password) {
  const minLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);

  if (!minLength) return "Password must be at least 8 characters long.";
  if (!hasUpper) return "Password must contain at least one uppercase letter.";
  if (!hasLower) return "Password must contain at least one lowercase letter.";
  if (!hasNumber) return "Password must contain at least one number.";
  
  return null;
}

// Display Feedback Message
function showMessage(text, isError = true) {
  messageDiv.textContent = text;
  messageDiv.className = isError ? "error-message" : "success-message";
}

// Toggle Auth Mode (Sign In / Sign Up)
toggleModeBtn.addEventListener("click", () => {
  isSignUpMode = !isSignUpMode;
  messageDiv.textContent = "";
  
  if (isSignUpMode) {
    formTitle.textContent = "Create a PetScore Account";
    submitBtn.textContent = "Sign Up";
    toggleModeBtn.textContent = "Already have an account? Sign In";
  } else {
    formTitle.textContent = "Sign In to PetScore";
    submitBtn.textContent = "Sign In";
    toggleModeBtn.textContent = "Need an account? Sign Up";
  }
});

// Handle Auth Form Submission
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  messageDiv.textContent = "";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (isSignUpMode) {
    // Validate password policy client-side before submission
    const passwordError = validatePassword(password);
    if (passwordError) {
      showMessage(passwordError, true);
      return;
    }

    // Supabase Sign Up
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
    });

    if (error) {
      showMessage(error.message, true);
    } else {
      showMessage("Sign up successful! You are now logged in.", false);
    }
  } else {
    // Supabase Sign In
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      showMessage(error.message, true);
    }
  }
});

// Handle Sign Out
signoutBtn.addEventListener("click", async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    showMessage(error.message, true);
  }
});

// Render UI Based on Session State
function updateUI(session) {
  if (session) {
    authSection.classList.add("hidden");
    appSection.classList.remove("hidden");
    userEmailSpan.textContent = session.user.email;
  } else {
    authSection.classList.remove("hidden");
    appSection.classList.add("hidden");
    userEmailSpan.textContent = "";
  }
}

// Listen for Session and Auth State Changes
supabaseClient.auth.onAuthStateChange((event, session) => {
  updateUI(session);
});

// Initial Session Check
supabaseClient.auth.getSession().then(({ data: { session } }) => {
  updateUI(session);
});