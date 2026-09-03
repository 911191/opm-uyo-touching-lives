/* OPM UYO TOUCHING LIVES — database-driven training skills for apply.html */
(function () {
  "use strict";
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  async function loadSkills() {
    const select = document.querySelector('select[name="preferred_skill"], select[name="training_program"], #preferred_skill, #trainingProgram, #training-program');
    if (!select) return;
    try {
      const r = await fetch('/api/public/data?resource=training-skills', { headers: { Accept: 'application/json' }, cache: 'no-store' });
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.error || ('HTTP ' + r.status));
      const previous = select.value;
      select.innerHTML = '<option value="">Select a training program</option>' +
        (Array.isArray(d.items) ? d.items : []).map(x => `<option value="${esc(x.name)}">${esc(x.name)}</option>`).join('');
      if ([...select.options].some(o => o.value === previous)) select.value = previous;
    } catch (e) {
      console.error('Training skills load failed:', e);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadSkills);
  else loadSkills();
})();
