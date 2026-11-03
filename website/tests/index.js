// Entry shim so `node --test website/tests/` works on this Node build, where a
// directory argument is executed as a single module instead of being expanded.
// It simply loads the CommonJS suites below.
import './support-ticket.test.cjs';
import './news-prerender.test.cjs';
import './sitemap-build.test.cjs';
