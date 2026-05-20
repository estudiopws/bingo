const infoModal = document.getElementById('info-modal');
const infoModalTitle = document.getElementById('info-modal-title');
const infoModalBody = document.getElementById('info-modal-body');

let triggerElement = null;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(event) {
  if (event.key !== 'Tab') return;
  const focusable = Array.from(infoModal.querySelectorAll(FOCUSABLE));
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function openSettingsModal({ title, bodyHtml, trigger }) {
  triggerElement = trigger || document.activeElement;
  infoModalTitle.textContent = title;
  infoModalBody.innerHTML = bodyHtml;
  infoModal.classList.add('is-open');
  infoModal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('overflow-hidden');
  infoModal.addEventListener('keydown', trapFocus);
  // Focus first focusable inside modal
  const first = infoModal.querySelector(FOCUSABLE);
  if (first) first.focus();
}

export function closeSettingsModal() {
  infoModal.classList.remove('is-open');
  infoModal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('overflow-hidden');
  infoModal.removeEventListener('keydown', trapFocus);
  if (triggerElement) {
    triggerElement.focus();
    triggerElement = null;
  }
}
