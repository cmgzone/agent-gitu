import { HOME_CSS, HOME_CHARACTER_HTML, HOME_WORKSPACE_JS } from './ui-home.js';
import { UI_MODEL_CATALOG_JS } from './ui-model-catalog.js';
import { UI_MOTION_JS } from './ui-motion.js';
import { CHAT_SURFACE_CSS, CHAT_SURFACE_JS } from './ui-chat-surface.js';
import { UI_BUTTON_CSS, UI_BUTTON_JS } from './ui-buttons.js';
import { UI_SEARCH_CSS } from './ui-search.js';
import { WORKSPACE_SEARCH_CSS, WORKSPACE_SEARCH_JS } from './ui-workspace-search.js';
import { COWORK_GALLERY_CSS, COWORK_GALLERY_JS } from './ui-gallery.js';
import { COWORK_PROFILE_CSS, COWORK_PROFILE_JS } from './ui-cowork-profile.js';
import { COWORK_DASHBOARD_CSS, COWORK_DASHBOARD_JS } from './ui-cowork-dashboard.js';
import { REPORT_DETAILS_CSS, REPORT_DETAILS_JS } from './ui-report-details.js';
import { ACTIVITY_CSS, ACTIVITY_MARK_HTML } from './ui-activity.js';
import { UI_APPROACH_JS } from './ui-approach.js';
import { SUBAGENT_CSS, SUBAGENT_JS } from './ui-subagents.js';
import { UI_RESPONSE_JS } from './ui-response.js';
import { CUSTOM_CONNECTION_CSS, CUSTOM_CONNECTION_JS } from './ui-custom-connection.js';
import { UI_CONNECTIONS_JS } from './ui-connections.js';
import { CONNECTED_APPS_CSS, CONNECTED_APPS_JS } from './ui-connected-apps.js';
import { COWORK_CSS, COWORK_JS } from './ui-cowork.js';
import { FILE_UPLOAD_JS } from './ui-files.js';
import { COMPANY_CSS, COMPANY_JS } from './ui-companies.js';
import { COMPANY_CONNECTIONS_JS } from './ui-company-connections.js';
import { COMPANY_WALLETS_JS } from './ui-company-wallets.js';
import { VOICE_CSS, VOICE_JS } from './ui-voice.js';
import { OUTPUT_CSS, OUTPUT_JS } from './ui-outputs.js';
import { CHAT_CREDENTIAL_HELPERS_JS } from './credential-chat.js';
import { UI_THEME_CSS, UI_THEME_BOOTSTRAP, UI_THEME_JS } from './ui-theme.js';
import { ONBOARDING_CSS, ONBOARDING_HTML, ONBOARDING_JS } from './ui-onboarding.js';

import { UI_ASSETS } from './ui-assets.js';
import { renderUiDocument } from './ui-template.js';

export const UI_HTML = renderUiDocument(UI_ASSETS, {
  UI_THEME_BOOTSTRAP,
  HOME_CSS,
  ACTIVITY_CSS,
  COWORK_CSS,
  COMPANY_CSS,
  VOICE_CSS,
  OUTPUT_CSS,
  CONNECTED_APPS_CSS,
  CUSTOM_CONNECTION_CSS,
  UI_THEME_CSS,
  ONBOARDING_CSS,
  UI_BUTTON_CSS,
  UI_SEARCH_CSS,
  COWORK_GALLERY_CSS,
  COWORK_PROFILE_CSS,
  REPORT_DETAILS_CSS,
  COWORK_DASHBOARD_CSS,
  CHAT_SURFACE_CSS,
  WORKSPACE_SEARCH_CSS,
  SUBAGENT_CSS,
  ONBOARDING_HTML,
  UI_MOTION_JS,
  CHAT_SURFACE_JS,
  WORKSPACE_SEARCH_JS,
  UI_APPROACH_JS,
  UI_RESPONSE_JS,
  UI_CONNECTIONS_JS,
  CONNECTED_APPS_JS,
  CUSTOM_CONNECTION_JS,
  CHAT_CREDENTIAL_HELPERS_JS,
  UI_MODEL_CATALOG_JS,
  UI_THEME_JS,
  HOME_CHARACTER_JSON: JSON.stringify(HOME_CHARACTER_HTML),
  ACTIVITY_MARK_HTML,
  COWORK_JS,
  FILE_UPLOAD_JS,
  COMPANY_JS,
  COMPANY_CONNECTIONS_JS,
  COMPANY_WALLETS_JS,
  VOICE_JS,
  COWORK_GALLERY_JS,
  COWORK_PROFILE_JS,
  COWORK_DASHBOARD_JS,
  HOME_WORKSPACE_JS,
  REPORT_DETAILS_JS,
  SUBAGENT_JS,
  OUTPUT_JS,
  ONBOARDING_JS,
  UI_BUTTON_JS,
});
