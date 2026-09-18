// Small, safe prose renderer for finalized responses. Live deltas remain text.
export const UI_RESPONSE_JS = String.raw`
  function responseEscape(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }
  function responseLink(destination) {
    if (!/^https?:\/\//i.test(destination) || /[\u0000-\u0020\u007f<>"\\]/.test(destination)) return '';
    try {
      var parsed = new URL(destination);
      // The host must be a real hostname: URL() happily accepts junk like ")" or
      // "example.com/" as a host, which would otherwise become a dead link.
      if (!/^(https?:)$/.test(parsed.protocol)) return '';
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(parsed.hostname)) return '';
      return destination;
    } catch (_) { return ''; }
  }
  // Map a video-page URL to its embeddable player URL. Only well-known hosts are
  // recognised; anything else returns '' and the link stays a plain <a>. The ID
  // is matched against a strict charset so no query/fragment can smuggle markup.
  function responseVideoEmbed(destination) {
    var href = responseLink(destination);
    if (!href) return '';
    try {
      var u = new URL(href);
      var host = u.hostname.toLowerCase().replace(/^www\./, '');
      var id = '';
      if (host === 'youtu.be') id = u.pathname.slice(1);
      else if (host === 'youtube.com' || host === 'm.youtube.com') {
        if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
        else { var m = /^\/(embed|shorts|live)\/([^\/?#]+)/.exec(u.pathname); if (m) id = m[2]; }
      } else if (host === 'vimeo.com') { var v = /^\/(\d+)/.exec(u.pathname); if (v) id = v[1]; }
      id = String(id || '');
      if (host === 'vimeo.com') {
        return /^\d{6,12}$/.test(id) ? 'https://player.vimeo.com/video/' + id : '';
      }
      return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? 'https://www.youtube-nocookie.com/embed/' + id : '';
    } catch (_) { return ''; }
  }
  function responseInline(text, depth, inLink) {
    if ((depth || 0) > 8) return responseEscape(text);
    var html = '', i = 0;
    while (i < text.length) {
      var char = text.charAt(i), match, end;
      // A bare http(s) URL in prose is a link too, not just markdown [text](url).
      // Skipped inside an existing <a> label: anchors cannot nest.
      if (!inLink && (char === 'h' || char === 'H')) {
        // Match the WHOLE non-whitespace token, then validate it. Truncating at a
        // quote would turn a hostile URL into a link to its innocent-looking
        // prefix; an invalid token must produce no link at all. A markdown link
        // destination (immediately after "](") is the markdown branch's job, so
        // this fallback leaves it alone.
        match = text.slice(Math.max(0, i - 2), i) === '](' ? null : /^https?:\/\/\S+/i.exec(text.slice(i));
        if (match) {
          var bare = match[0].replace(/[.,;:!?]+$/, '');
          if (bare.split('(').length < bare.split(')').length) bare = bare.replace(/\)+$/, '');
          var bareHref = responseLink(bare);
          if (bareHref) {
            html += '<a href="' + responseEscape(bareHref) + '" target="_blank" rel="noopener noreferrer">' + responseEscape(bare) + '</a>';
            i += bare.length; continue;
          }
        }
      }
      if (char === String.fromCharCode(96)) {
        match = /^\x60+/.exec(text.slice(i));
        var marker = match[0];
        end = text.indexOf(marker, i + marker.length);
        if (end >= 0) {
          html += '<code>' + responseEscape(text.slice(i + marker.length, end)) + '</code>';
          i = end + marker.length; continue;
        }
      }
      if (text.slice(i, i + 2) === '**') {
        end = text.indexOf('**', i + 2);
        if (end > i + 2) {
          html += '<strong>' + responseInline(text.slice(i + 2, end), (depth || 0) + 1, inLink) + '</strong>';
          i = end + 2; continue;
        }
      }
      if (char === '[') {
        match = /^\[([^\]\n]+)\]\(([^\n]*)/.exec(text.slice(i));
        if (match) {
          var begin = i + match[1].length + 3, cursor = begin, balance = 1;
          while (cursor < text.length && text.charAt(cursor) !== '\n') {
            if (text.charAt(cursor) === '(') balance++;
            if (text.charAt(cursor) === ')' && --balance === 0) break;
            cursor++;
          }
          if (balance === 0) {
            var destination = text.slice(begin, cursor);
            var href = responseLink(destination);
            if (href) {
              html += '<a href="' + responseEscape(href) + '" target="_blank" rel="noopener noreferrer">' + responseInline(match[1], (depth || 0) + 1, true) + '</a>';
              i = cursor + 1; continue;
            }
          }
        }
      }
      html += char === '\n' ? '<br>' : responseEscape(char);
      i++;
    }
    return html;
  }
  function responseListItem(line) {
    return /^([ \t]*)([-+*]|\d+[.)])[ \t]+(.*)$/.exec(line);
  }
  // Video links in finalized prose become a real inline player under the
  // paragraph. Inline-code spans are stripped first so a URL quoted as code
  // stays literal text rather than embedding.
  function responseEmbeds(text) {
    var visible = String(text || '').replace(/\x60[^\x60\n]*\x60/g, ' ');
    var seen = {}, html = '';
    (visible.match(/https?:\/\/[^\s<>"')]+/g) || []).forEach(function (candidate) {
      var embed = responseVideoEmbed(candidate);
      if (!embed || seen[embed]) return;
      seen[embed] = true;
      html += '<div class="response-embed"><iframe src="' + responseEscape(embed) +
        '" title="Embedded video" loading="lazy" allowfullscreen ' +
        'referrerpolicy="strict-origin-when-cross-origin" ' +
        'sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"></iframe></div>';
    });
    return html;
  }
  function responseFence(line) {
    return /^ {0,3}(\x60{3,}|~{3,})([^\n]*)$/.exec(line);
  }
  function responseBlockStart(line) {
    return !line.trim() || responseFence(line) || /^ {0,3}#{1,6}[ \t]+/.test(line) || responseListItem(line);
  }
  function renderResponseText(value) {
    var lines = String(value == null ? '' : value).replace(/\r\n?/g, '\n').split('\n');
    var html = '', i = 0;
    while (i < lines.length) {
      var line = lines[i], fence = responseFence(line), heading, item;
      if (!line.trim()) { i++; continue; }
      if (fence) {
        var body = [], closed = false, language = fence[2].trim();
        i++;
        while (i < lines.length) {
          var close = /^ {0,3}(\x60+|~+)\s*$/.exec(lines[i]);
          if (close && close[1].charAt(0) === fence[1].charAt(0) && close[1].length >= fence[1].length) {
            closed = true; i++; break;
          }
          body.push(lines[i++]);
        }
        html += '<div class="response-code">' + (language ? '<div class="response-code-language">' + responseEscape(language) + '</div>' : '')
          + '<pre><code>' + responseEscape(body.join('\n') + (closed && body.length ? '\n' : '')) + '</code></pre></div>';
      } else if ((heading = /^ {0,3}(#{1,6})[ \t]+(.*)$/.exec(line))) {
        var level = heading[1].length;
        html += '<h' + level + '>' + responseInline(heading[2]) + '</h' + level + '>'; i++;
      } else if ((item = responseListItem(line))) {
        var ordered = /^\d/.test(item[2]), listTag = ordered ? 'ol' : 'ul';
        var start = ordered ? Number.parseInt(item[2], 10) : 1;
        html += '<' + listTag + (ordered && start !== 1 ? ' start="' + start + '"' : '') + '>';
        do {
          var content = item[3]; i++;
          while (i < lines.length && /^[ \t]+\S/.test(lines[i]) && !responseBlockStart(lines[i])) content += '\n' + lines[i++].trimStart();
          html += '<li>' + responseInline(content) + responseEmbeds(content) + '</li>';
          item = i < lines.length ? responseListItem(lines[i]) : null;
        } while (item && /^\d/.test(item[2]) === ordered);
        html += '</' + listTag + '>';
      } else {
        var paragraph = [line]; i++;
        while (i < lines.length && !responseBlockStart(lines[i])) paragraph.push(lines[i++]);
        var paragraphText = paragraph.join('\n');
        html += '<p>' + responseInline(paragraphText) + '</p>' + responseEmbeds(paragraphText);
      }
    }
    return html;
  }
`;
