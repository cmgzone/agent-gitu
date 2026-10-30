// Entry shim so `node --test website/tests/` works on this Node build, where a
// directory argument is executed as a single module instead of being expanded.
// It simply loads the support-ticket suite (a CommonJS file).
import './support-ticket.test.cjs';
