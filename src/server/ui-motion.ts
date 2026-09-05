// Shared by the shipped UI and deterministic streaming tests. No HTML parsing
// happens on incoming model text; only the newly revealed tail is animated.
export const UI_MOTION_JS = String.raw`
  var liveTextSinks = new Set();
  var liveTextFrame = 0;
  var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');

  function settleTextTail(sink) {
    var state = sink._liveText;
    if (state && state.tail) {
      state.base.appendData(state.tail.textContent);
      state.tail.remove();
      state.tail = null;
    }
  }
  function flushStreamText(sink) {
    if (!sink) return;
    var state = sink._liveText;
    if (state) {
      settleTextTail(sink);
      state.base.appendData(state.pending);
      state.pending = '';
      liveTextSinks.delete(sink);
    }
    sink.classList.remove('text-streaming');
    if (!liveTextSinks.size && liveTextFrame) {
      cancelAnimationFrame(liveTextFrame);
      liveTextFrame = 0;
    }
  }
  function flushLiveText() {
    liveTextSinks.forEach(function (sink) { flushStreamText(sink); });
  }
  function revealLiveText(now) {
    liveTextFrame = 0;
    var stream = $('stream');
    var follow = stream && stream.dataset.follow !== 'false';
    liveTextSinks.forEach(function (sink) {
      var state = sink._liveText;
      if (!sink.isConnected) { flushStreamText(sink); return; }
      if (now - state.last < 30) return;
      settleTextTail(sink);
      // Catch up within 180ms, regardless of provider burst size. Small
      // deltas appear on the next frame without a synthetic typing delay.
      var count = now - state.since >= 180 ? state.pending.length : Math.max(12, Math.ceil(state.pending.length * .35));
      var boundary = state.pending.slice(count, count + 24).search(/\s/);
      if (boundary >= 0) count += boundary + 1;
      // Never reveal half of a UTF-16 surrogate pair.
      if (/[\uD800-\uDBFF]/.test(state.pending.charAt(count - 1))) count++;
      var chunk = state.pending.slice(0, count);
      state.pending = state.pending.slice(count);
      state.tail = document.createElement('span');
      state.tail.className = 'text-arrival';
      state.tail.textContent = chunk;
      sink.appendChild(state.tail);
      state.last = now;
      if (!state.pending) liveTextSinks.delete(sink);
    });
    if (follow && stream) stickScroll(stream, true);
    if (liveTextSinks.size) liveTextFrame = requestAnimationFrame(revealLiveText);
  }
  function queueStreamText(sink, chunk, instant) {
    if (!sink || !chunk) return;
    var state = sink._liveText;
    if (!state) {
      var base = document.createTextNode(sink.textContent || '');
      sink.textContent = '';
      sink.appendChild(base);
      state = sink._liveText = { base: base, tail: null, pending: '', since: 0, last: -Infinity };
    }
    if (!state.pending) state.since = performance.now();
    state.pending += chunk;
    sink.classList.add('text-streaming');
    liveTextSinks.add(sink);
    if (instant || motionPreference.matches || document.hidden) {
      flushStreamText(sink);
      var stream = $('stream');
      if (stream) stickScroll(stream);
      return;
    }
    if (!liveTextFrame) liveTextFrame = requestAnimationFrame(revealLiveText);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) flushLiveText();
  });
  motionPreference.addEventListener('change', function () {
    if (motionPreference.matches) flushLiveText();
  });
`;
