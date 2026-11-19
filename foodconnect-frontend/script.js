const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');

menuToggle.addEventListener('click', () => {
  const isOpen = mainNav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  menuToggle.textContent = isOpen ? '✕' : '☰';
});

mainNav.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    mainNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.textContent = '☰';
    mainNav.querySelectorAll('a').forEach(item => item.classList.remove('active'));
    link.classList.add('active');
  });
});

const searchInput = document.getElementById('foodSearch');
const categoryFilter = document.getElementById('categoryFilter');
const foodCards = [...document.querySelectorAll('.food-card')];
const emptyState = document.getElementById('emptyState');

function filterDonations() {
  const query = searchInput.value.trim().toLowerCase();
  const category = categoryFilter.value;
  let visibleCount = 0;

  foodCards.forEach(card => {
    const searchableText = `${card.dataset.search} ${card.textContent}`.toLowerCase();
    const matchesSearch = searchableText.includes(query);
    const matchesCategory = category === 'all' || card.dataset.category === category;
    const visible = matchesSearch && matchesCategory;
    card.hidden = !visible;
    if (visible) visibleCount++;
  });

  emptyState.hidden = visibleCount !== 0;
}

searchInput.addEventListener('input', filterDonations);
categoryFilter.addEventListener('change', filterDonations);

// Demo interactions: authentication and request actions lead to the registration area.
document.querySelectorAll('a[href="#register"], a[href="#login"]').forEach(link => {
  link.addEventListener('click', event => {
    event.preventDefault();
    const action = link.getAttribute('href') === '#login' ? 'Login' : 'Registration';
    showToast(`${action} page can be connected to your Node.js / Express backend.`);
  });
});

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove('show'), 3000);
}
