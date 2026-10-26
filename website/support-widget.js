(() => {
  'use strict';

  const prohibited = /(?:password|passwd|passcode|api[ _-]?key|access[ _-]?token|private[ _-]?key|one[ -]?time[ -]?code|otp|credit card|payment card|-----begin)/i;
  const outOfScope = /(?:sales|pricing|quote|refund|chargeback|legal advice|financial advice|delete my account|account deletion|infrastructure|coolify|deployment|deploy|write code|code changes)/i;
  const problemSignal = /(?:can't|cannot|unable|not working|error|fail(?:ed|s|ure)?|broken|bug|issue|problem|stuck|crash|slow|missing|blank|unavailable|incorrect|unexpected|doesn't|does not|won't|will not)/i;
  const root = document.createElement('aside');
  root.className = 'support-widget';
  root.innerHTML = `
    <button class="support-launcher" type="button" aria-expanded="false" aria-controls="support-panel">
      <span class="support-launcher-dot" aria-hidden="true"></span>
      Pikpam Support
    </button>
    <section id="support-panel" class="support-panel" role="dialog" aria-labelledby="support-title" hidden>
      <div class="support-panel-header">
        <div>
          <p class="eyebrow">CUSTOMER PROBLEM INTAKE</p>
          <h2 id="support-title">How can we help?</h2>
        </div>
        <button class="support-close" type="button" aria-label="Close support chat">Ã—</button>
      </div>
      <p class="support-intro">This chat is for problems with a Pikpam website or service. We collect only the details needed for support to investigate.</p>
      <p class="support-boundary"><strong>Keep secrets out:</strong> never send passwords, API keys, payment cards, one-time codes, private keys, or other confidential data.</p>
      <form class="support-form" novalidate>
        <label>Name <input name="name" autocomplete="name" required maxlength="100"></label>
        <label>Con¶»§q«^w·éÈZ®Â–b‚FFæ6öç6VçB’°¢6WE7FGW2‚uÆV6R6öæf—&ÒF†R&—f7’æB7W÷'B×W6Ræ÷F–6RârÂvW'&÷"r“°¢&WGW&ã°¢Ğ¢7V&Ö—BæF—6&ÆVBÒG'VS°¢6WE7FGW2‚u6VæF–ær–÷W"&ö&ÆVÒ6V7W&VÇ(
br“°¢G'’°¢6öç7B&W7öç6RÒv—BfWF6‚‚rö’÷7W÷'BrÂ°¢ÖWF†öC¢uõ5BrÀ¢†VFW'3¢²v6öçFVçB×G—Rs¢vÆ–6F–öâö§6öârÒÀ¢&öG“¢¥4ôâç7G&–æv–g’‡²ââæFFÂ&WVW7EG—S¢wvV'6—FR×&ö&ÆVÒrÒ’À¢Ò“°¢6öç7B&W7VÇBÒv—B&W7öç6Ræ§6öâ‚’æ6F6‚‚‚’Óâ‡·Ò’“°¢–b‚&W7öç6Ræö²’F‡&÷ræWrW'&÷"‡&W7VÇBæÖW76vRÇÂu7W÷'B—2FV×÷&&–Ç’Væf–Æ&ÆRâr“°¢f÷&Òç&W6WB‚“°¢6WE7FGW2‡&W7VÇBæÖW76vRÇÂu–÷W"&ö&ÆVÒv27V&Ö—GFVBFò–·Ò7W÷'BârÂw7V66W72r“°¢Ò6F6‚†W'&÷"’°¢6WE7FGW2†W'&÷"æÖW76vRÇÂu7W÷'B—2FV×÷&&–Ç’Væf–Æ&ÆRâÆV6RG'’v–âÆFW"ârÂvW'&÷"r“°¢Òf–æÆÇ’°¢7V&Ö—BæF—6&ÆVBÒfÇ6S°¢Ğ¢Ò“°§Ò’‚“°