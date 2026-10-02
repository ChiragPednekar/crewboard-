// Apply the saved theme before first paint (dark is the default).
// A file rather than an inline <script> so the Content-Security-Policy can stay strict.
try {
  if (localStorage.getItem('crewboard-theme') === 'light') document.documentElement.classList.remove('dark');
} catch (e) {
  /* storage blocked: keep dark */
}
