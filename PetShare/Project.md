# PetScore

Build 2 plan: CONFIRMED by Build 2 Planner on October 6, 2026.

## What the app does and who it's for
PetScore is a social pet photo-sharing app built for classmates and pet owners. Users can upload pictures of their pets, rate photos on a 1–10 scale, leave comments, and control who gets to see their posts (Nobody, Friends, or Everyone).

## Sign-in
- Email and password sign-in with client-side validation and Supabase auth.
- Sign in with GitHub via Supabase OAuth.
- Password policy enforced in Supabase: minimum 8 characters, at least one uppercase letter, one lowercase letter, and one number.
- Persistent sessions across refreshes and sign-out functionality.
- Dedicated change-password page for email users.

## Tables
- `profiles`: `id` (references auth.users), `username` (unique text), `created_at`
- `photos`: `id`, `user_id` (references profiles.id), `image_url`, `pet_name`, `caption`, `visibility` ('nobody', 'friends', 'everyone'), `created_at`
- `ratings_and_comments`: `id`, `photo_id` (references photos.id), `user_id` (references profiles.id), `rating` (integer 1–10), `comment` (text), `created_at`
- `friendships`: `id`, `user_id` (references profiles.id), `friend_id` (references profiles.id), `created_at`

## Who can see what
- `profiles`: All authenticated users can read usernames to enable search and friend selection. Users can only edit their own profile.
- `photos`: 
  - 'nobody': Only the owner (`user_id = auth.uid()`) can view, edit, or delete.
  - 'friends': Only the owner and users listed in mutual `friendships` can view.
  - 'everyone': All authenticated users can view.
- `ratings_and_comments`: Visible to any user allowed to view the associated photo. Users can only insert or edit their own comments/ratings.
- `friendships`: Users can view, create, or delete their own friendship connections.

## Buckets
- Bucket Name: `pet-photos`
- Allowed file types: `.jpg`, `.jpeg`, `.png`, `.webp`
- Max file size: 5 MB per upload
- File visibility matches post visibility rules via Storage RLS policies.

## Screens
1. **Screen 1: Sign In / Sign Up** — Email/Password login, GitHub login, and link to sign up.
2. **Screen 2: Username Setup** — Modal or screen prompt on first login to choose a unique username.
3. **Screen 3: Main Feed** — Displays accessible pet photos with average 1–10 scores, individual user scores, comments, and a comment/rating input bar.
4. **Screen 4: Upload & Post** — Image file picker, pet name input, caption, and visibility selector (Nobody, Friends, Everyone with username search to pick friends).
5. **Screen 5: Settings / Change Password** — Profile management and password reset form for email users.

## Code files
- `index.html`: The HTML structure and CSS styles for all screens and UI components. Loads `config.js` before `app.js`.
- `app.js`: All JavaScript logic, including Supabase client calls, authentication handlers, storage uploads, and UI interactions.
- `config.js`: Contains only the Supabase project URL and publishable key.

## Rules for every chat
- This app uses exactly three code files: index.html, app.js, config.js. Do not create more.
- index.html contains the HTML and CSS, and loads config.js before app.js.
- config.js contains only the Supabase URL and the publishable key.
- When you change code, name the file and give me the whole file, not a snippet.
- Change nothing I did not ask you to change.
- Never put a secret key in any file.

## Addresses
- GitHub Pages URL: to fill in

## Secrets
- GitHub client secret: in Supabase dashboard only (under Authentication -> Providers -> GitHub). Never in code or repository.

## Where we are right now
Planning complete, nothing built yet.

## NOT doing, on purpose
- Password reset via email (Build 3 / Requires custom SMTP server due to free tier limits).
- AI pet breed detection (Build 4 / AI integrations).

## Next thing I want to add
Set up Supabase sign-in settings, then email + password sign-in.

## Change log
- October 6, 2026: Planning session with Build 2 Planner. Plan confirmed.