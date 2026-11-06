import { useEffect } from 'react';

// Gives every cell of .dashboard-table inside `ref` a data-label taken from its column
// heading, so CSS can turn each row into a labelled card on phones. Watches the DOM, so
// tables that appear later (tab switches, loaded data) are labelled too.
// `ready`: pass false while the container isn't rendered yet (e.g. a loading screen).
export default function useResponsiveTables(ref, ready = true) {
  useEffect(() => {
    const root = ref.current;
    if (!ready || !root) return undefined;

    let frame = null;
    const label = () => {
      frame = null;
      root.querySelectorAll('table.dashboard-table').forEach(table => {
        const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent.trim());
        if (heads.length === 0) return;
        table.querySelectorAll('tbody tr').forEach(tr => {
          [...tr.children].forEach((td, i) => {
            const text = td.colSpan > 1 ? '' : (heads[i] || '');
            if (td.getAttribute('data-label') !== text) td.setAttribute('data-label', text);
          });
        });
      });
    };
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(label); };

    label();
    const observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [ref, ready]);
}
