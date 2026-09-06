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
      return parsed.hostname && /^(https?:)$/.test(parsed.protocol) ? destination : '';
    } catch (_) { return ''; }
  }
  function responseInline(text, depth) {
    if ((depth || 0) > 8) return responseEscape(text);
    var html = '', i = 0;
    while (i < text.length) {
      var char = text.charAt(i), match, end;
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
          html += '<strong>' + responseInline(text.slice(i + 2, end), (depth || 0) + 1) + '</strong>';
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
              html += '<a href="' + responseEscape(href) + '" target="_blank" rel="noopener noreferrer">' + responseInline(match[1], (depth || 0) + 1) + '</a>';
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
          html += '<li>' + responseInline(content) + '</li>';
          item = i < lines.length ? responseListItem(lines[i]) : null;
        } while (item && /^\d/.test(item[2]) === ordered);
        html += '</' + listTag + '>';
      } else {
        var paragraph = [line]; i++;
        while (i < lines.length && !responseBlockStart(lines[i])) paragraph.push(lines[i++]);
        html += '<p>' + responseInline(paragraph.join('\n')) + '</p>';
      }
    }
    return html;
  }
`;
