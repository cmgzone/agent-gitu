/* Build the static marketing pages. No framework or browser runtime dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const config = require('./site.config.json');
const pkg = require('./package.json');
const root = __dirname;
const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name, cls = '') => {
  const shapes = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    diagonal: '<path d="M7 17 17 7M7 7h10v10"/>',
    check: '<path d="m5 12 4 4 10-10"/>',
    code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 16"/>',
    team: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-15a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v1"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 6 9 7 9-7"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Zm0 0v6h6M8 14h8M8 17h5"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18"/>',
    github:
      '<path d="M9 19c-4 1-4-2-6-2m12 4v-4c0-1 .1-2-1-3 3-.3 6-1.5 6-5 0-1-.4-2-1-3 .3-1 .3-2-.2-3-2 0-3 1-4 1a12 12 0 0 0-6 0c-1 0-2-1-4-1-.5 1-.5 2-.2 3-.6 1-1 2-1 3 0 3.5 3 4.7 6 5-1 1-1 2-1 3v4"/>',
  };
  return `<svg class="icon ${cls}" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="¶»§q«^w­uï§!j»Ø[ˆ™YH‰ØÛÛ™šYË›ÜšYÚ[ŸKÙÝÛ›ØYš[ÚXY›ÙOÛÛ[YHÈH™YH™ÝÛ›ØYš[YÙ[Ú]HÝÛ›ØYÏØO‹ÜØ›ÙOÚ[—˜ŠNÂ™œËÜš]Qš[TÞ[˜Êˆ]š›Ú[Š›ÛÝ	Íš[	ÊKˆØÝ[Y[
Âˆš[Nˆ	Íš[	Ëˆ]Nˆ	ÔYÙH›Ý›Ý[™8 %YÙ[Ú]IËˆ\ØÜš\[ÛŽˆ	Ô™]\›ˆÈHYÙ[Ú]HÛÜšÜÜXÙHÙXœÚ]K‰Ëˆ›ÙNˆÙXÝ[ÛˆÛ\ÜÏHÜ˜\YÙKZ\›ÈYÙKZ\›Ë\Ú[\H‰Ù^YXœ›ÝÊ	ÍÈHÓPSUÕT‰Ê_OO“]8 &\Èš[™œÜ[ˆÛ\ÜÏH˜›YK]^ž[Ý\ˆØ^H˜XÚËÜÜ[ÚOÛ\ÜÏHš\›ËY\ØÜš\[Ûˆ•\ÈYÙH\Û¸ &]\™Kˆ[Ý\ˆ™^YXHÝ[\ËÜ‰Û[šÊ	Ú[™^š[	Ë	Ð˜XÚÈÈHÛÜšÜÜXÙIÊ_OÜÙXÝ[Û˜ˆJBˆœ™\XÙJ	Ú[™^›ÛÝËX^Z[XYÙK\™]šY]Î›\™ÙIË	Û›Ú[™^›ÛÝÉÊBˆœ™\XÙJÊ™YŸÜ˜ÊOHŠÈZÏÎŸßÊJ×ˆ—JÊH‹ÙË	ÉOH‹Éˆ‰ÊKŠNÂ˜ÛÛœÛÛK›ÙÊZ[	ÜYÙ\Ë›[™ÝHÑSÈYÙ\ËÚ][X\›Ø›ÝË[™˜[˜XÚÈYÙ\È›Üˆ	ØÛÛ™šYË›ÜšYÚ[ŸK˜
NÂ