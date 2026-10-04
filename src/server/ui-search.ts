// Search uses the Cowork sidebar treatment in every view, independently of layout.
export const UI_SEARCH_CSS = String.raw`
  :root { --search-radius: 8px; --search-padding-block: 6px; --search-padding-inline: 10px; --search-font-size: 12px; }
  :is(input[type="search"], input[placeholder^="Search"], #modelFilter, #skSearch, .model-menu input) {
    box-sizing: border-box;
    min-width: 0;
    min-height: 32px;
    background: var(--card2);
    border: 1px solid var(--border2);
    border-radius: var(--search-radius);
    color: var(--text);
    padding: var(--search-padding-block) var(--search-padding-inline);
    font: inherit;
    font-size: var(--search-font-size);
  }
  :is(input[type="search"], input[placeholder^="Search"], #modelFilter, #skSearch, .model-menu input):focus {
    outline: none;
    border-color: var(--accent);
  }
`;
