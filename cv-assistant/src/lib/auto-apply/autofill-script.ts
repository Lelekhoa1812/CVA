// Browser-side form filler. It runs inside the employer's application page (via the bookmarklet in the user's own
// browser, or via the local dev browser) and fills every field it can map from the prepared pack. It never clicks
// a submit button: the candidate reviews the filled form and submits it themselves.
//
// Kept as a plain JavaScript string so it is not transpiled with framework helpers and can run on any page.

export const AUTOFILL_VERSION = 6;

export const AUTOFILL_FUNCTION = String.raw`async function cvaAutofill(pack) {
  var VERSION = ${AUTOFILL_VERSION};
  var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
  var tokens = function (s) { return norm(s).split(' ').filter(function (t) { return t.length > 1; }); };
  var sim = function (a, b) {
    var A = tokens(a), B = tokens(b);
    if (!A.length || !B.length) return 0;
    var setB = {}; B.forEach(function (t) { setB[t] = 1; });
    var shared = 0; A.forEach(function (t) { if (setB[t]) shared++; });
    return (2 * shared) / (A.length + B.length);
  };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var visible = function (el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); };
  var cssEscape = function (v) { return (window.CSS && CSS.escape) ? CSS.escape(v) : String(v).replace(/(["\\\]\[])/g, '\\$1'); };

  function setValue(el, value, keepFocus) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, 'value');
    el.focus();
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (!keepFocus) el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function labelParts(el) {
    var parts = [];
    if (el.getAttribute('aria-label')) parts.push(el.getAttribute('aria-label'));
    var lb = el.getAttribute('aria-labelledby');
    if (lb) lb.split(/\s+/).forEach(function (id) { var n = document.getElementById(id); if (n) parts.push(n.textContent); });
    if (el.id) { var l = document.querySelector('label[for="' + cssEscape(el.id) + '"]'); if (l) parts.push(l.textContent); }
    var wrap = el.closest('label'); if (wrap) parts.push(wrap.textContent);
    var box = container(el);
    if (box) { var head = box.querySelector('label, legend, .application-label, [class*="label"], [class*="Label"]'); if (head) parts.push(head.textContent); }
    if (el.getAttribute('placeholder')) parts.push(el.getAttribute('placeholder'));
    if (el.name) parts.push(el.name.replace(/[_\[\]]+/g, ' '));
    return parts.map(function (p) { return String(p || '').replace(/\s+/g, ' ').trim(); }).filter(Boolean);
  }
  function labelOf(el) { return labelParts(el).join(' '); }
  function labelScore(el, label) {
    var target = norm(label), best = 0;
    labelParts(el).forEach(function (part) {
      var p = norm(part).replace(/ (required|optional)$/, '');
      var score = p === target ? 1 : sim(part, label);
      if (p && target && (p.indexOf(target) === 0 || target.indexOf(p) === 0) && Math.min(p.length, target.length) >= 4) score = Math.max(score, 0.85);
      if (score > best) best = score;
    });
    return best;
  }

  function container(el) {
    return el.closest('fieldset, .application-question, .field, [class*="_fieldEntry"], [class*="field-wrapper"], [class*="question"], [data-qa], li') || el.parentElement;
  }

  var lastEl = null;
  var CONTROL = 'input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select, [role=combobox]';
  var used = new Set();

  function byName(field) {
    var out = [];
    if (!field.fieldName) return out;
    var esc = cssEscape(field.fieldName);
    document.querySelectorAll('[name="' + esc + '"], [id="' + esc + '"], [name="' + esc + '[]"]').forEach(function (n) { out.push(n); });
    if (!out.length) document.querySelectorAll('[name$="' + esc + '"], [id$="' + esc + '"]').forEach(function (n) { out.push(n); });
    return out.filter(function (n) { return n.matches(CONTROL) || n.matches('input[type=hidden]'); });
  }

  function byLabel(field) {
    var best = null, bestScore = 0;
    document.querySelectorAll(CONTROL).forEach(function (el) {
      if (used.has(el) || !visible(el)) return;
      var score = labelScore(el, field.label);
      if (score > bestScore) { bestScore = score; best = el; }
    });
    return bestScore >= 0.6 ? [best] : [];
  }

  function bestOption(nodes, value, getText) {
    var target = norm(value), best = null, bestScore = 0;
    nodes.forEach(function (n) {
      var text = norm(getText(n));
      if (!text) return;
      var score = text === target ? 2 : (text.indexOf(target) >= 0 || target.indexOf(text) >= 0) ? 1.5 : sim(text, target);
      if (/^(yes|no)$/.test(target) && text.split(' ')[0] === target) score = Math.max(score, 1.8);
      if (score > bestScore) { bestScore = score; best = n; }
    });
    return bestScore >= 0.5 ? best : null;
  }

  // Some React widgets (react-select on Greenhouse) ignore script-dispatched events; call their handlers directly.
  function reactProps(node) {
    if (!node) return null;
    var key = Object.keys(node).find(function (k) { return k.indexOf('__reactProps') === 0; });
    return key ? node[key] : null;
  }
  function reactCall(el, handler, extra) {
    var node = el;
    for (var depth = 0; node && depth < 10; depth++, node = node.parentElement) {
      var props = reactProps(node);
      if (props && typeof props[handler] === 'function') {
        var evt = Object.assign({ target: el, currentTarget: node, nativeEvent: { isComposing: false }, defaultPrevented: false, preventDefault: function () {}, stopPropagation: function () {}, persist: function () {}, button: 0, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }, extra || {});
        try { props[handler](evt); return true; } catch (e) { return false; }
      }
    }
    return false;
  }
  function optionsFor(el) {
    var scoped = el.id ? Array.prototype.slice.call(document.querySelectorAll('[id^="react-select-' + cssEscape(el.id) + '-option"]')) : [];
    if (scoped.length) return scoped;
    var owns = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
    var list = owns ? document.getElementById(owns) : null;
    var pool = list ? list.querySelectorAll('[role=option]') : document.querySelectorAll('[role=listbox] [role=option], [class*="menu"] [role=option], [class*="Menu"] [role=option]');
    return Array.prototype.slice.call(pool).filter(visible);
  }
  function mouse(node, type) {
    node.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons: type === 'mouseup' || type === 'click' ? 0 : 1 }));
  }
  // react-select opens on a mouse press on its control and picks on a mouse press on an option; plain input events and
  // arrow keys are ignored. This sequence works in Chromium, Firefox and WebKit.
  function openSelect(el) {
    var control = el.closest('[class*="control"]') || (el.parentElement && el.parentElement.parentElement) || el;
    el.focus();
    try { control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse', isPrimary: true })); } catch (e) {}
    mouse(control, 'mousedown'); mouse(control, 'mouseup'); mouse(control, 'click');
  }
  function pickOption(option) {
    ['mouseover', 'mousemove', 'mousedown', 'mouseup', 'click'].forEach(function (type) { mouse(option, type); });
  }
  function choose(option) {
    pickOption(option);
    return true;
  }
  async function fillCombobox(el, value) {
    openSelect(el);
    var typed = false;
    for (var i = 0; i < 50; i++) {
      await sleep(160);
      var options = optionsFor(el);
      if (options.length > 60 && !typed) {
        // Long lists (countries, cities): narrow them with the typed text, then pick.
        setValue(el, value, true);
        typed = true;
        continue;
      }
      if (!options.length && i === 3) {
        // Async lists open only once there is text to search for.
        setValue(el, value, true);
        typed = true;
      }
      if (!options.length && i === 10) openSelect(el);
      if (!options.length && i === 12) setValue(el, String(value).split(',')[0], true);
      if (!options.length && i === 20) {
        reactCall(el, 'onChange', { target: el, currentTarget: el });
        reactCall(el, 'onKeyDown', { key: 'ArrowDown', keyCode: 40 });
      }
      var hit = bestOption(options, value, function (n) { return n.textContent; });
      if (hit) { choose(hit); await sleep(150); return true; }
    }
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return false;
  }

  function clickChoice(box, value) {
    if (!box) return false;
    var choices = Array.prototype.slice.call(box.querySelectorAll('input[type=radio], input[type=checkbox], button, [role=radio], [role=checkbox], label')).filter(visible);
    var hit = bestOption(choices, value, function (n) {
      if (n.matches('input')) return labelOf(n) + ' ' + (n.value || '');
      return n.textContent;
    });
    if (!hit) return false;
    if (hit.matches('label')) { var inner = hit.querySelector('input'); if (inner) hit = inner; }
    if (hit.matches('input[type=checkbox]') && hit.checked) return true;
    hit.click();
    return true;
  }

  async function fill(field) {
    var value = String(field.value || '');
    if (!value || field.type === 'file') return 'skipped';
    var nodes = byName(field);
    if (!nodes.length) nodes = byLabel(field);
    if (!nodes.length) return 'missing';
    var el = nodes[0];
    lastEl = el;
    nodes.forEach(function (n) { used.add(n); });
    var box = container(el);

    if (el.matches('input[type=radio], input[type=checkbox]') || (el.matches('input[type=hidden]') && box)) {
      var group = box ? box : el.parentElement;
      if (field.type === 'multiselect') {
        var ok = false;
        value.split('|').forEach(function (v) { ok = clickChoice(group, v.trim()) || ok; });
        return ok ? 'filled' : 'missing';
      }
      return clickChoice(group, value) ? 'filled' : 'missing';
    }
    if (el.matches('select')) {
      var opt = bestOption(Array.prototype.slice.call(el.options), value, function (o) { return o.textContent + ' ' + o.value; });
      if (!opt) return 'missing';
      setValue(el, opt.value);
      return 'filled';
    }
    if (el.getAttribute('role') === 'combobox' || (el.closest('[class*="select"]') && field.options && field.options.length)) {
      return (await fillCombobox(el, value)) ? 'filled' : 'partial';
    }
    if ((field.type === 'boolean' || (field.options && field.options.length)) && box) {
      var buttons = box.querySelectorAll('button, [role=radio], input[type=radio]');
      if (buttons.length) return clickChoice(box, value) ? 'filled' : 'missing';
    }
    setValue(el, value);
    return 'filled';
  }

  var results = [];
  for (var i = 0; i < pack.fields.length; i++) {
    var f = pack.fields[i];
    var status;
    lastEl = null;
    try { status = await fill(f); } catch (e) { status = 'error'; }
    var target = lastEl;
    results.push({ label: f.label, status: status, type: f.type, required: f.required, value: f.value, el: target });
    if (status !== 'filled' && target && f.value) { var box0 = container(target) || target; box0.style.outline = '2px solid rgba(245,158,11,.9)'; box0.style.outlineOffset = '2px'; }
    await sleep(40);
  }

  document.querySelectorAll(CONTROL).forEach(function (el) {
    if (used.has(el)) el.style.outline = '2px solid rgba(34,197,94,.85)';
  });

  var filled = results.filter(function (r) { return r.status === 'filled'; }).length;
  var esc = function (v) { return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  var toPick = results.filter(function (r) { return r.status !== 'filled' && r.status !== 'skipped' && r.value; });
  var attach = results.filter(function (r) { return r.type === 'file'; });
  var needAnswer = results.filter(function (r) { return r.status === 'skipped' && r.required && r.type !== 'file' && !r.value; });
  var old = document.getElementById('cva-autofill-panel'); if (old) old.remove();
  var panel = document.createElement('div');
  panel.id = 'cva-autofill-panel';
  panel.setAttribute('role', 'status');
  panel.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:380px;max-height:70vh;overflow:auto;background:#0f172a;color:#f8fafc;border:1px solid #334155;border-radius:14px;padding:14px 16px;font:13px/1.45 system-ui,sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.35)';
  var html = '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><strong>CV Assistant autofill</strong><button id="cva-close" style="background:none;border:0;color:#94a3b8;font-size:16px;cursor:pointer" aria-label="Close">×</button></div>';
  html += '<div style="margin-top:6px">Filled ' + filled + ' of ' + results.length + ' fields' + (pack.job && pack.job.title ? ' for ' + esc(pack.job.title) : '') + '.</div>';
  if (toPick.length) {
    html += '<div style="margin-top:8px;color:#fbbf24">Pick these dropdowns (highlighted on the page):</div><ul style="margin:4px 0 0 16px;padding:0">';
    toPick.forEach(function (t) { html += '<li><span style="color:#cbd5e1">' + esc(t.label) + '</span><br><strong>' + esc(String(t.value).slice(0, 120)) + '</strong></li>'; });
    html += '</ul>';
  }
  if (needAnswer.length) {
    html += '<div style="margin-top:8px;color:#fbbf24">Needs your answer:</div><ul style="margin:4px 0 0 16px;padding:0">';
    needAnswer.forEach(function (t) { html += '<li>' + esc(t.label) + '</li>'; });
    html += '</ul>';
  }
  if (attach.length) html += '<div style="margin-top:8px;color:#fbbf24">Attach your resume' + (attach.length > 1 ? ' and cover letter' : '') + ' using the site\'s upload button.</div>';
  html += '<div style="margin-top:8px;color:#94a3b8">Review every field, complete any CAPTCHA, then press the site\'s Submit button yourself.</div>';
  if (pack.coverLetter) html += '<button id="cva-copy-cl" style="margin-top:10px;background:#38bdf8;color:#0f172a;border:0;border-radius:999px;padding:6px 12px;font-weight:600;cursor:pointer">Copy cover letter</button>';
  panel.innerHTML = html;
  document.body.appendChild(panel);
  document.getElementById('cva-close').onclick = function () { panel.remove(); };
  var copy = document.getElementById('cva-copy-cl');
  if (copy) copy.onclick = function () { navigator.clipboard.writeText(pack.coverLetter).then(function () { copy.textContent = 'Copied'; }); };
  return { version: VERSION, filled: filled, total: results.length, results: results.map(function (r) { return { label: r.label, status: r.status, type: r.type, required: r.required }; }) };
}`;

/**
 * Bookmarklet: reads the autofill pack from the page URL fragment (#cva=...), which never leaves the browser, or
 * falls back to the clipboard / a paste prompt, then runs the filler.
 */
export function buildBookmarklet() {
  const body = `(async function(){var cvaAutofill=${AUTOFILL_FUNCTION};var t='';var h=location.hash||'';if(h.indexOf('#cva=')===0){try{var b=atob(decodeURIComponent(h.slice(5)).replace(/-/g,'+').replace(/_/g,'/'));var u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);t=new TextDecoder().decode(u);}catch(e){}}if(!t){try{t=await navigator.clipboard.readText();}catch(e){}}if(!t||t.indexOf('cva-autofill')<0){t=prompt('Paste the autofill pack copied from CV Assistant');}if(!t)return;var p;try{p=JSON.parse(t);}catch(e){alert('That is not a CV Assistant autofill pack. Open the form again from Auto Apply.');return;}if(p.kind!=='cva-autofill'){alert('That is not a CV Assistant autofill pack.');return;}await cvaAutofill(p);})();`;
  return `javascript:${encodeURIComponent(body)}`;
}
