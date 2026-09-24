// FitNova Manager · lógica común de interfaz

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('open');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('open');
}

// Cierra el modal al pulsar fuera de su contenido
document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

// Cambio de pestañas: agrupa por atributo data-tab-group
function switchTab(group, tabId) {
  document.querySelectorAll(`[data-tab-group="${group}"]`).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll(`[data-tab-panel-group="${group}"]`).forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.tabPanel === tabId);
  });
}

// Resalta en la barra superior el enlace correspondiente a la página actual
document.addEventListener('DOMContentLoaded', () => {
  const current = document.body.dataset.view;
  if (!current) return;
  document.querySelectorAll('.topbar-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.view === current);
  });
});
