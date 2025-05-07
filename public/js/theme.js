// Theme toggle functionality
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  
  // Update the theme attribute
  document.documentElement.setAttribute('data-theme', newTheme);
  
  // Update the theme toggle button icon
  const themeIcon = document.querySelector('.theme-toggle i');
  if (themeIcon) {
    themeIcon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }

  // Send the theme update to the server
  fetch('/update-theme', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ theme: newTheme })
  })
  .then(response => response.json())
  .then(data => {
    if (!data.success) {
      console.error('Failed to update theme:', data.error);
      // Revert the theme if the update failed
      document.documentElement.setAttribute('data-theme', currentTheme);
      if (themeIcon) {
        themeIcon.className = currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      }
    }
  })
  .catch(error => {
    console.error('Error updating theme:', error);
    // Revert the theme if there was an error
    document.documentElement.setAttribute('data-theme', currentTheme);
    if (themeIcon) {
      themeIcon.className = currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
    }
  });
}

// Initialize theme on page load
document.addEventListener('DOMContentLoaded', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const themeIcon = document.querySelector('.theme-toggle i');
  if (themeIcon) {
    themeIcon.className = currentTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
  }
}); 