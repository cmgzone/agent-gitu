import { loadEnvironment } from './environment.js';

// The CLI imports this before modules that read configuration during startup.
loadEnvironment();
