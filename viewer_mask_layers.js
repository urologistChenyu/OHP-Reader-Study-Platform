/* OHP mask-bounded axial viewer. Loaded AFTER the original inline script.
 * No fetch, no volume preload, no clinical/model/authentication changes.
 * state.full_slice_index is an ARRAY POSITION; record.full_slice_index is SOURCE Z.
 */
(function () {
  'use strict';
  const VERSION = 'OHP_MASK_AXIAL_V1';
  let generation = 0;
  let request = null;
  let saveTimer = null;
  const byId = id => document.getElementById(id);

  function selectedItem(c) {
    if (!c || !Array.isArray(c.full_images) || !c.full_images.length)
      throw new Error("The current case has no CT slice manifest.");
    const item = c.full_images[fullIndex];
    if (!Number.isInteger(fullIndex) || !item || !Number.isInteger(item.slice_index) ||
        typeof item.file !== 'string' || !item.file || /^data:/i.test(item.file))
      throw new Error("Invalid CT slice index or explicit image path.");
    return item;
  }

  function representativePosition(c) {
    const pos = c.full_images.findIndex(item => item.slice_index === c.representative_slice_index);
    if (pos < 0) throw new Error("The representative slice is not in the CT manifest.");
    return pos;
  }

  function cancelPending() {
    generation++;
    if (request && request.image) {
      request.image.onload = null;
      request.image.onerror = null;
    }
    request = null;
  }

  function cancelSave() {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = null;
  }

  function syncState(c) {
    const item = selectedItem(c);
    state.viewer_version = VERSION;
    state.viewer_case_id = c.case_id;
    state.case_id = c.case_id;
    state.full_slice_index = fullIndex;
    state.full_slice_z = item.slice_index;
    state.full_slice_file = item.file;
    state.ct_stack_slice_count = c.full_images.length;
    state.slice_index_base = 0;
    state.view_mode = viewerMode;
  }

  function beginCase(c) {
    cancelSave();
    cancelPending();
    if (!c) return; // Original washout/completion guards still own the flow.
    fullIndex = representativePosition(c);
    viewerMode = 'full';
    viewerZoom = 1;
    syncState(c);
  }

  function restoreViewer(c, isAI) {
    const marked = state.viewer_version === VERSION &&
      state.viewer_case_id === c.case_id && state.case_id === c.case_id;
    let pos = representativePosition(c);
    if (marked) {
      // Source Z is authoritative on reload; never interpret legacy index 0 as Z 0.
      if (Number.isInteger(state.full_slice_z)) {
        const found = c.full_images.findIndex(item => item.slice_index === state.full_slice_z);
        if (found >= 0) pos = found;
      } else if (Number.isInteger(state.full_slice_index) &&
                 state.full_slice_index >= 0 && state.full_slice_index < c.full_images.length) {
        pos = state.full_slice_index;
      }
    }
    fullIndex = pos;
    viewerMode = marked && state.view_mode === 'context' ? 'context' : 'full';
    viewerZoom = 1;
    syncState(c);
  }

  function saveSoon(c) {
    // Initial renderViewer runs before original restoreDraft: do not capture blank DOM here.
    cancelSave();
    const owner = state;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      if (state === owner && !state.completed && currentCase() &&
          currentCase().case_id === c.case_id) {
        captureDraft();
        checkpoint(); // Accounts active time normally; never starts a new case.
      }
    }, 180);
  }

  function imageSpec(c, isAI) {
    const item = selectedItem(c);
    if (viewerMode === 'context') return {file:c.context_image, z:c.representative_slice_index,
      title:'Enlarged context · Representative slice · Source z=' + c.representative_slice_index + ' (zero-based)'};
    return {file:item.file, z:item.slice_index,
      title:'Axial CT · Slice ' + (fullIndex + 1) + '/' + c.full_images.length +
        ' · Source z=' + item.slice_index + ' (zero-based) · Radiological orientation'};
  }

  function setSubmitEnabled(enabled) {
    const form = byId('judge');
    if (form) form.querySelectorAll('button').forEach(button => {
      if (button.type === 'submit') button.disabled = !enabled || Boolean(state && state.paused);
    });
  }

  function updateStatus(kind, message) {
    const el = byId('sliceLoadStatus');
    if (el) { el.dataset.status = kind; el.textContent = message; }
    const retry = byId('sliceRetry');
    if (retry) retry.hidden = kind !== 'error';
  }

  function syncControls(c, isAI) {
    const enabled = viewerMode === 'full' && !state.paused;
    const range = byId('sliceRange');
    range.min = '0'; range.max = String(c.full_images.length - 1);
    range.value = String(fullIndex); range.disabled = !enabled;
    byId('slicePrev').disabled = !enabled || fullIndex === 0;
    byId('sliceNext').disabled = !enabled || fullIndex === c.full_images.length - 1;
    byId('sliceRepresentative').disabled = !enabled || fullIndex === representativePosition(c);
    byId('sliceCount').textContent = "Selected CT slice " + (fullIndex + 1) + '/' + c.full_images.length +
      " · Source z=" + selectedItem(c).slice_index + " (zero-based) · Mask range [" +
      c.mask_z_min + ', ' + c.mask_z_max + "] (inclusive)";
    byId('sliceModeNote').textContent = viewerMode === 'full' ?
      "Axial CT slices cover the tumour mask; red indicates the contour. Arrow keys: one slice; Page Up/Down: ten slices; Home/End: first/last slice." :
      "This view uses the fixed representative slice. Return to full CT to resume slice navigation.";
    byId('contextBtn').textContent = viewerMode === 'context' ? "Return to CT" : "Enlarged context";
    byId('contextBtn').disabled = Boolean(state.paused);
    const retry = byId('sliceRetry');
    retry.disabled = Boolean(state.paused);
  }

  function editable(target) {
    return Boolean(target && (target.isContentEditable ||
      target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')));
  }

  function canNavigate(c, region) {
    return Boolean(state && !state.paused && !state.completed && viewerMode === 'full' &&
      currentCase() && currentCase().case_id === c.case_id && region.isConnected);
  }

  function setSlice(pos) {
    const c = state && currentCase();
    const region = byId('ctSliceRegion');
    if (!c || !region || !canNavigate(c, region)) return false;
    const next = Math.max(0, Math.min(c.full_images.length - 1, Math.trunc(Number(pos))));
    if (!Number.isInteger(next) || next === fullIndex) return false;
    captureDraft();
    fullIndex = next;
    syncState(c);
    renderViewer(c, state.phase === 'ai_assisted');
    saveSoon(c);
    return true;
  }

  function installControls(c) {
    const image = byId('caseImage');
    if (!image) return;
    const region = image.parentElement;
    region.id = 'ctSliceRegion'; region.tabIndex = 0;
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', "CT viewer: focus here to navigate with the arrow keys");
    if (!byId('sliceControls')) {
      const controls = document.createElement('div');
      controls.id = 'sliceControls'; controls.style.cssText = 'padding:10px 0;display:grid;gap:8px';
      controls.innerHTML = "<div class=\"buttonrow\"><button type=\"button\" class=\"ghost\" id=\"slicePrev\">Previous slice</button>" +
        "<button type=\"button\" class=\"ghost\" id=\"sliceNext\">Next slice</button>" +
        "<button type=\"button\" class=\"ghost\" id=\"sliceRepresentative\">Representative slice</button>" +
        "<button type=\"button\" class=\"ghost\" id=\"sliceRetry\" hidden>Retry loading</button></div>" +
        '<label for="sliceRange" id="sliceCount"></label>' +
        "<input id=\"sliceRange\" type=\"range\" step=\"1\" aria-label=\"Axial CT slice within the tumour mask\">" +
        '<div id="sliceModeNote" class="micro"></div>' +
        '<div id="sliceLoadStatus" class="micro" role="status" aria-live="polite"></div>';
      region.insertAdjacentElement('afterend', controls);
      byId('slicePrev').onclick = () => setSlice(fullIndex - 1);
      byId('sliceNext').onclick = () => setSlice(fullIndex + 1);
      byId('sliceRepresentative').onclick = () => setSlice(representativePosition(c));
      byId('sliceRange').oninput = event => setSlice(Number(event.target.value));
      byId('sliceRetry').onclick = retry;
      const caption = region.closest('.viewer').querySelector('.caption');
      if (caption) caption.textContent = "CT navigation covers the mask-bounded axial slices. The enlarged context uses the representative slice. Red marks the tumour contour.";
    }
    if (!region.dataset.maskBound) {
      region.dataset.maskBound = '1';
      region.addEventListener('pointerdown', event => {
        if (!editable(event.target)) region.focus({preventScroll:true});
      });
      region.addEventListener('keydown', event => {
        if (!canNavigate(c, region) || !region.contains(document.activeElement) ||
            editable(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const offsets = {ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1,PageUp:-10,PageDown:10};
        let pos;
        if (Object.prototype.hasOwnProperty.call(offsets, event.key)) pos = fullIndex + offsets[event.key];
        else if (event.key === 'Home') pos = 0;
        else if (event.key === 'End') pos = c.full_images.length - 1;
        else return;
        event.preventDefault(); setSlice(pos);
      });
      let wheelAccum = 0, wheelDirection = 0, lastWheelAt = 0, lastWheelStepAt = -Infinity;
      region.addEventListener('wheel', event => {
        if (!canNavigate(c, region) || editable(event.target) || event.ctrlKey ||
            event.metaKey || event.altKey || event.shiftKey || !event.deltaY) {
          wheelAccum = 0; // Ctrl/pinch zoom and non-CT interactions keep native behavior.
          return;
        }
        event.preventDefault();
        const now = Date.now();
        const direction = event.deltaY > 0 ? 1 : -1;
        // Normalize line/page units; a normal deltaY=120 wheel still advances one layer.
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (region.clientHeight || 480) : 1;
        if (direction !== wheelDirection || now - lastWheelAt > 160) wheelAccum = 0;
        wheelDirection = direction; lastWheelAt = now;
        wheelAccum = Math.min(30, wheelAccum + Math.abs(event.deltaY) * unit);
        if (wheelAccum < 30 || now - lastWheelStepAt < 50) return;
        wheelAccum = 0; lastWheelStepAt = now; // No residual jump or queued trailing timer.
        setSlice(fullIndex + direction);
      }, {passive:false});
    }
  }

  function matches(r) {
    if (!r || request !== r || generation !== r.token || state !== r.owner ||
        !state || state.completed || !currentCase() || currentCase().case_id !== r.caseId ||
        viewerMode !== r.mode || byId('caseImage') !== r.image || !r.image.isConnected) return false;
    const item = selectedItem(currentCase());
    return item.file === r.selectedFile && item.slice_index === r.selectedZ &&
      (r.image.currentSrc || r.image.src) === r.url;
  }

  function renderMaskViewer(c, isAI) {
    if (!state || !byId('caseImage')) return;
    if (!Number.isInteger(fullIndex) || fullIndex < 0 || fullIndex >= c.full_images.length)
      fullIndex = representativePosition(c);
    installControls(c);
    const spec = imageSpec(c, isAI);
    syncState(c); syncControls(c, isAI);
    const old = byId('caseImage');
    if (request && request.owner === state && request.caseId === c.case_id &&
        request.mode === viewerMode && request.file === spec.file &&
        request.selectedFile === selectedItem(c).file && request.image === old &&
        (request.status === 'loading' || request.status === 'ready')) {
      old.style.transform = 'scale(' + viewerZoom + ')';
      setSubmitEnabled(request.status === 'ready');
      saveSoon(c);
      return;
    }
    cancelPending();
    setSubmitEnabled(false);
    const image = document.createElement('img');
    image.id = 'caseImage'; image.alt = spec.title;
    image.style.transform = 'scale(' + viewerZoom + ')';
    image.style.visibility = 'hidden';
    image.setAttribute('aria-busy', 'true');
    old.onload = null; old.onerror = null; old.removeAttribute('src');
    old.replaceWith(image); // Only the image changes; draft controls/focus/timer remain intact.
    byId('viewLabel').textContent = "Loading · " + spec.title;
    updateStatus('loading', "Loading image. Submission is disabled until loading completes.");
    let url;
    try {
      if (typeof spec.file !== 'string' || !spec.file || /^data:/i.test(spec.file))
        throw new Error("The image path is missing.");
      url = new URL(spec.file, document.baseURI).href;
    } catch (_) {
      updateStatus('error', "Invalid image path. Check the offline package and retry.");
      byId('viewLabel').textContent = "Loading failed · " + spec.title;
      return;
    }
    const item = selectedItem(c);
    const r = {token:generation,owner:state,caseId:c.case_id,mode:viewerMode,
      file:spec.file,url,image,status:'loading',selectedFile:item.file,selectedZ:item.slice_index,
      displayedZ:spec.z};
    request = r;
    image.onload = () => {
      if (!matches(r) || !image.complete || image.naturalWidth <= 0) return;
      r.status = 'ready'; image.style.visibility = 'visible';
      image.setAttribute('aria-busy', 'false');
      byId('viewLabel').textContent = spec.title;
      updateStatus('ready', "Image loaded · " + spec.file);
      setSubmitEnabled(true);
    };
    image.onerror = () => {
      if (!matches(r)) return;
      r.status = 'error'; image.style.visibility = 'hidden';
      image.onload = null; image.onerror = null; image.removeAttribute('src');
      image.setAttribute('aria-busy', 'false');
      byId('viewLabel').textContent = "Loading failed · " + spec.title;
      updateStatus('error', "Image loading failed; the previous image was cleared. Submission is disabled. Select Retry loading.");
      setSubmitEnabled(false);
    };
    image.src = url; // Only this explicit manifest item; no prefetch/cache of the stack.
    saveSoon(c);
  }

  function retry() {
    if (!state || state.paused || state.completed || !currentCase()) return false;
    cancelPending();
    renderViewer(currentCase(), state.phase === 'ai_assisted');
    return true;
  }

  function requireReady(c, isAI) {
    const item = selectedItem(c);
    const spec = imageSpec(c, isAI);
    if (!matches(request) || request.status !== 'ready' || request.file !== spec.file ||
        !request.image.complete || request.image.naturalWidth <= 0)
      throw new Error("The current image has not loaded successfully. Wait or retry before submitting.");
    return item; // Both record Z and record file MUST come from this very same object.
  }

  function recordFields(c, item) {
    return {viewer_version:VERSION,ct_stack_slice_count:c.full_images.length,slice_index_base:0,
      full_slice_array_position:fullIndex,representative_slice_index:c.representative_slice_index,
      mask_z_min:c.mask_z_min,mask_z_max:c.mask_z_max,
      displayed_image_ref:request.file,displayed_slice_index:request.displayedZ};
  }

  window.OHP_MASK_VIEWER_VERSION = VERSION;
  window.maskBeginCase = beginCase;
  window.maskRestoreViewer = restoreViewer;
  window.maskRenderViewer = renderMaskViewer;
  window.maskRequireReady = requireReady;
  window.maskRecordFields = recordFields;
  window.OHPMaskViewer = Object.freeze({version:VERSION,selectedItem,representativePosition,
    setSlice,retry,requireReady,recordFields,
    snapshot:() => ({version:VERSION,case_id:state && state.viewer_case_id,mode:viewerMode,
      array_position:fullIndex,source_z:state && state.full_slice_z,
      file:state && state.full_slice_file,status:request ? request.status : 'idle',
      displayed_file:request && request.file,displayed_z:request && request.displayedZ,
      token:generation})});
})();
