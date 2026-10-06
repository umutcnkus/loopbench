// Line icons for the system gallery (44x44, currentColor).
const svg = (body) => `<svg viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const icons = {
  default: svg('<rect x="8" y="8" width="28" height="28" rx="4"/>'),
  cartpole: svg('<path d="M4 34h36"/><rect x="13" y="26" width="16" height="7" rx="1.5"/><path d="M21 26L28 7"/><circle cx="28" cy="7" r="2.5" fill="currentColor"/>'),
  doublependulum: svg('<path d="M4 36h36"/><rect x="14" y="29" width="14" height="6" rx="1.5"/><path d="M21 29l-5-11 9-12"/><circle cx="16" cy="18" r="1.8" fill="currentColor"/><circle cx="25" cy="6" r="2.4" fill="currentColor"/>'),
  furuta: svg('<ellipse cx="22" cy="33" rx="12" ry="4"/><path d="M22 33V24"/><path d="M22 24l12-4"/><path d="M34 20l-3-13"/><circle cx="31" cy="7" r="2.2" fill="currentColor"/>'),
  ballplate: svg('<path d="M6 26l16-7 16 7-16 7z"/><circle cx="24" cy="21" r="3.2" fill="currentColor"/><path d="M22 33v6M15 37h14"/>'),
  ballbeam: svg('<path d="M5 27l34-8"/><circle cx="27" cy="18.5" r="3.2" fill="currentColor"/><path d="M22 24v12M16 36h12"/>'),
  quadrotor: svg('<path d="M12 12l20 20M32 12L12 32"/><circle cx="11" cy="11" r="5"/><circle cx="33" cy="11" r="5"/><circle cx="11" cy="33" r="5"/><circle cx="33" cy="33" r="5"/><rect x="18" y="18" width="8" height="8" rx="2" fill="currentColor"/>'),
  segway: svg('<path d="M4 38h36"/><circle cx="22" cy="31" r="6"/><rect x="18" y="6" width="9" height="20" rx="2" transform="rotate(8 22 16)"/>'),
  arm: svg('<path d="M6 38h20"/><rect x="11" y="31" width="10" height="7" rx="1"/><path d="M16 31l8-13 11 5"/><circle cx="16" cy="31" r="2.2"/><circle cx="24" cy="18" r="2.2"/><path d="M35 23l3-3M35 23l3 3"/>'),
  maglev: svg('<rect x="13" y="4" width="18" height="12" rx="2"/><path d="M16 8h12M16 12h12"/><circle cx="22" cy="25" r="5" fill="currentColor"/><path d="M22 34v6M16 40h12"/>'),
  crane: svg('<path d="M5 40V8h34v32"/><path d="M5 8h34"/><rect x="18" y="6" width="8" height="5" rx="1"/><path d="M22 11v15"/><rect x="17" y="26" width="10" height="8" rx="1" fill="currentColor"/>'),
  spacecraft: svg('<rect x="17" y="17" width="10" height="10" rx="1.5"/><path d="M4 18h11v8H4zM29 18h11v8H29z"/><path d="M22 17v-6"/><circle cx="22" cy="9" r="2.5"/>'),
  rocket: svg('<path d="M22 4c4 5 5 12 4 20h-8c-1-8 0-15 4-20z"/><path d="M18 24l-4 8h16l-4-8"/><path d="M20 35l2 6 2-6"/>'),
};
