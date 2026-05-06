function h(hex) {
  const x = hex.replace('#', '');
  return { r: parseInt(x.slice(0, 2), 16) / 255, g: parseInt(x.slice(2, 4), 16) / 255, b: parseInt(x.slice(4, 6), 16) / 255 };
}
const ids = [];
function track(n) {
  ids.push(n.id);
  return n;
}
const F = {
  interR: { family: 'Inter', style: 'Regular' },
  interM: { family: 'Inter', style: 'Medium' },
  interSb: { family: 'Inter', style: 'Semi Bold' },
  interB: { family: 'Inter', style: 'Bold' },
};
await figma.loadFontAsync(F.interR);
await figma.loadFontAsync(F.interM);
await figma.loadFontAsync(F.interSb);
await figma.loadFontAsync(F.interB);

const page = figma.root.children.find((p) => p.name === 'Logs Screen') || figma.root.children[0];
await figma.setCurrentPageAsync(page);

function solidPaint(c) {
  return [{ type: 'SOLID', color: c }];
}
function txt(content, size, font, col) {
  const t = track(figma.createText());
  t.fontName = font;
  t.fontSize = size;
  t.fills = solidPaint(col);
  t.characters = content;
  return t;
}
function frame(name, mode, w) {
  const f = track(figma.createFrame());
  f.name = name;
  f.layoutMode = mode;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = mode === 'VERTICAL' ? 'FIXED' : 'AUTO';
  if (w) f.resize(w, 1);
  f.fills = [];
  return f;
}
function hFrame(name, w) {
  const f = frame(name, 'HORIZONTAL', w);
  f.primaryAxisAlignItems = 'CENTER';
  f.counterAxisAlignItems = 'CENTER';
  f.itemSpacing = 0;
  f.layoutAlign = 'STRETCH';
  return f;
}
function vFrame(name, w) {
  const f = frame(name, 'VERTICAL', w);
  f.primaryAxisAlignItems = 'MIN';
  f.counterAxisAlignItems = 'MIN';
  f.itemSpacing = 0;
  f.layoutAlign = 'STRETCH';
  return f;
}
function divider(w) {
  const r = track(figma.createRectangle());
  r.name = 'Divider';
  r.resize(w, 1);
  r.fills = solidPaint(h('#E5E7EB'));
  r.layoutAlign = 'STRETCH';
  return r;
}
function macroCol(label, goal, ringBg, emoji) {
  const col = vFrame('Macro: ' + label, 110);
  col.primaryAxisAlignItems = 'CENTER';
  col.counterAxisAlignItems = 'CENTER';
  col.itemSpacing = 8;
  const ringWrap = track(figma.createFrame());
  ringWrap.name = 'Ring';
  ringWrap.resize(80, 80);
  ringWrap.fills = [];
  ringWrap.layoutMode = 'NONE';
  const el = track(figma.createEllipse());
  el.resize(80, 80);
  el.x = 0;
  el.y = 0;
  el.fills = [];
  el.strokes = [{ type: 'SOLID', color: ringBg }];
  el.strokeWeight = 8;
  el.strokeAlign = 'CENTER';
  ringWrap.appendChild(el);
  const icon = txt(emoji, 22, F.interM, h('#101828'));
  icon.x = 28;
  icon.y = 26;
  ringWrap.appendChild(icon);
  col.appendChild(ringWrap);
  const line = hFrame('Macro line', 110);
  line.primaryAxisAlignItems = 'CENTER';
  line.itemSpacing = 2;
  line.appendChild(txt('0g', 14, F.interB, h('#101828')));
  line.appendChild(txt(' / ' + goal, 14, F.interR, h('#6A7282')));
  col.appendChild(line);
  const lab = txt(label, 12, F.interR, h('#6A7282'));
  lab.textAlignHorizontal = 'CENTER';
  col.appendChild(lab);
  return col;
}
function dayCol(day, num, selected) {
  const c = vFrame(day + ' ' + num, 44);
  c.primaryAxisAlignItems = 'CENTER';
  c.itemSpacing = 4;
  c.paddingTop = 6;
  c.paddingBottom = 6;
  c.paddingLeft = 4;
  c.paddingRight = 4;
  if (selected) {
    c.fills = solidPaint(h('#000000'));
    c.cornerRadius = 999;
    c.appendChild(txt(day, 10, F.interSb, h('#FFFFFF')));
    c.appendChild(txt(String(num), 12, F.interB, h('#FFFFFF')));
  } else {
    c.fills = [];
    c.appendChild(txt(day, 10, F.interR, h('#6B7280')));
    c.appendChild(txt(String(num), 12, F.interSb, h('#000000')));
  }
  return c;
}
function mealRow(title, subtitle, iconBg, iconHex, emoji) {
  const row = hFrame('Meal: ' + title, 358);
  row.paddingLeft = 12;
  row.paddingRight = 12;
  row.paddingTop = 10;
  row.paddingBottom = 10;
  row.primaryAxisAlignItems = 'CENTER';
  row.counterAxisAlignItems = 'CENTER';
  row.itemSpacing = 12;
  row.fills = solidPaint(h('#F9FAFB'));
  row.cornerRadius = 12;
  row.layoutAlign = 'STRETCH';
  const iw = track(figma.createFrame());
  iw.resize(40, 40);
  iw.fills = [];
  iw.layoutMode = 'NONE';
  const circle = track(figma.createEllipse());
  circle.resize(40, 40);
  circle.x = 0;
  circle.y = 0;
  circle.fills = solidPaint(iconBg);
  iw.appendChild(circle);
  const icon = txt(emoji, 18, F.interR, h(iconHex));
  icon.x = 10;
  icon.y = 8;
  iw.appendChild(icon);
  row.appendChild(iw);
  const mid = vFrame('Text', 200);
  mid.itemSpacing = 2;
  mid.appendChild(txt(title, 15, F.interSb, h('#111827')));
  mid.appendChild(txt(subtitle, 12, F.interR, h('#6B7280')));
  row.appendChild(mid);
  mid.layoutGrow = 1;
  const pw = track(figma.createFrame());
  pw.resize(32, 32);
  pw.fills = [];
  pw.layoutMode = 'NONE';
  const plusBg = track(figma.createEllipse());
  plusBg.resize(32, 32);
  plusBg.x = 0;
  plusBg.y = 0;
  plusBg.fills = solidPaint(h('#E5E7EB'));
  pw.appendChild(plusBg);
  const plus = txt('+', 18, F.interSb, h('#111827'));
  plus.x = 10;
  plus.y = 4;
  pw.appendChild(plus);
  row.appendChild(pw);
  return row;
}

const screen = track(figma.createFrame());
screen.name = 'Logs — baseline';
screen.resize(390, 860);
screen.x = 40;
screen.y = 40;
screen.fills = solidPaint(h('#FFFFFF'));
screen.layoutMode = 'VERTICAL';
screen.primaryAxisSizingMode = 'FIXED';
screen.counterAxisSizingMode = 'FIXED';
screen.itemSpacing = 0;
page.appendChild(screen);

const status = hFrame('Status bar', 390);
status.resize(390, 54);
status.paddingLeft = 24;
status.paddingRight = 24;
status.primaryAxisAlignItems = 'SPACE_BETWEEN';
status.counterAxisAlignItems = 'CENTER';
status.layoutAlign = 'STRETCH';
status.appendChild(txt('2:51', 15, F.interSb, h('#000000')));
const island = track(figma.createRectangle());
island.resize(126, 36);
island.cornerRadius = 20;
island.fills = solidPaint(h('#000000'));
status.appendChild(island);
status.appendChild(txt('100%', 12, F.interR, h('#000000')));
screen.appendChild(status);

const header = hFrame('Header', 390);
header.paddingLeft = 16;
header.paddingRight = 16;
header.paddingTop = 12;
header.paddingBottom = 12;
header.primaryAxisAlignItems = 'SPACE_BETWEEN';
header.counterAxisAlignItems = 'MIN';
header.itemSpacing = 16;
header.layoutAlign = 'STRETCH';
const headerLeft = vFrame('Title + date', 200);
headerLeft.itemSpacing = 6;
headerLeft.appendChild(txt('Logs', 22, F.interB, h('#101828')));
const dateRow = hFrame('Date row', 200);
dateRow.itemSpacing = 8;
dateRow.primaryAxisAlignItems = 'CENTER';
const cal = track(figma.createRectangle());
cal.resize(14, 14);
cal.cornerRadius = 2;
cal.strokes = [{ type: 'SOLID', color: h('#4A5565') }];
cal.strokeWeight = 1.5;
cal.fills = [];
dateRow.appendChild(cal);
dateRow.appendChild(txt('Tuesday, March 24', 14, F.interR, h('#4A5565')));
headerLeft.appendChild(dateRow);
header.appendChild(headerLeft);
headerLeft.layoutGrow = 1;
const headerRight = vFrame('Calories', 120);
headerRight.primaryAxisAlignItems = 'MAX';
headerRight.counterAxisAlignItems = 'MAX';
headerRight.itemSpacing = 2;
const calRow = hFrame('Calories row', 120);
calRow.primaryAxisAlignItems = 'MAX';
calRow.itemSpacing = 0;
calRow.appendChild(txt('0', 24, F.interSb, h('#101828')));
calRow.appendChild(txt(' / 3161', 16, F.interR, h('#6A7282')));
headerRight.appendChild(calRow);
headerRight.appendChild(txt('calories', 12, F.interR, h('#6A7282')));
header.appendChild(headerRight);
screen.appendChild(header);

const week = hFrame('Week', 390);
week.paddingLeft = 12;
week.paddingRight = 12;
week.paddingTop = 8;
week.paddingBottom = 12;
week.itemSpacing = 6;
week.primaryAxisAlignItems = 'SPACE_BETWEEN';
week.counterAxisAlignItems = 'CENTER';
week.layoutAlign = 'STRETCH';
const days = [
  ['SUN', 22],
  ['MON', 23],
  ['TUE', 24],
  ['WED', 25],
  ['THU', 26],
  ['FRI', 27],
  ['SAT', 28],
];
for (let i = 0; i < days.length; i++) {
  const [d, n] = days[i];
  week.appendChild(dayCol(d, n, d === 'TUE' && n === 24));
}
screen.appendChild(week);
screen.appendChild(divider(390));

const macroRow = hFrame('Macro row', 390);
macroRow.paddingLeft = 16;
macroRow.paddingRight = 16;
macroRow.paddingTop = 12;
macroRow.paddingBottom = 8;
macroRow.itemSpacing = 12;
macroRow.primaryAxisAlignItems = 'CENTER';
macroRow.counterAxisAlignItems = 'CENTER';
macroRow.layoutAlign = 'STRETCH';
macroRow.appendChild(macroCol('Protein', '195g', h('#FFE2E2'), '💪'));
macroRow.appendChild(macroCol('Carbs', '398g', h('#FEF9C2'), '🌾'));
macroRow.appendChild(macroCol('Fat', '88g', h('#E9D5FF'), '💧'));
screen.appendChild(macroRow);

const water = vFrame('Water', 390);
water.paddingLeft = 16;
water.paddingRight = 16;
water.paddingTop = 16;
water.paddingBottom = 8;
water.itemSpacing = 12;
water.layoutAlign = 'STRETCH';
const wh = hFrame('Water header', 358);
wh.primaryAxisAlignItems = 'SPACE_BETWEEN';
wh.appendChild(txt('Water', 16, F.interSb, h('#101828')));
wh.appendChild(txt('0 / 8 glasses', 14, F.interR, h('#6A7282')));
water.appendChild(wh);
const glasses = hFrame('Glasses', 358);
glasses.primaryAxisAlignItems = 'SPACE_BETWEEN';
for (let i = 0; i < 8; i++) {
  const gw = track(figma.createFrame());
  gw.resize(32, 32);
  gw.fills = [];
  gw.layoutMode = 'NONE';
  const g = track(figma.createEllipse());
  g.resize(32, 32);
  g.x = 0;
  g.y = 0;
  g.fills = solidPaint(h('#E3F2FD'));
  gw.appendChild(g);
  const drop = txt('💧', 14, F.interR, h('#2196F3'));
  drop.x = 8;
  drop.y = 6;
  gw.appendChild(drop);
  glasses.appendChild(gw);
}
water.appendChild(glasses);
screen.appendChild(water);
screen.appendChild(divider(390));

const meals = vFrame('Meals', 390);
meals.paddingLeft = 16;
meals.paddingRight = 16;
meals.paddingTop = 12;
meals.paddingBottom = 8;
meals.itemSpacing = 10;
meals.layoutAlign = 'STRETCH';
meals.appendChild(mealRow('Breakfast', 'No meals logged', h('#FFF4E6'), '#FF6B35', '☕'));
meals.appendChild(mealRow('Lunch', 'No meals logged', h('#FEF3C7'), '#F59E0B', '☀️'));
meals.appendChild(mealRow('Dinner', 'No meals logged', h('#E0E7FF'), '#4F46E5', '🌙'));
meals.appendChild(mealRow('Snacks', 'No meals logged', h('#DCFCE7'), '#16A34A', '🍎'));
meals.appendChild(mealRow('Activities', 'No activities logged', h('#F2DEFF'), '#7C3AED', '🏋️'));
screen.appendChild(meals);
meals.layoutGrow = 1;

const bottom = track(figma.createFrame());
bottom.name = 'Bottom chrome';
bottom.resize(390, 96);
bottom.fills = [];
bottom.layoutMode = 'NONE';
bottom.layoutAlign = 'STRETCH';
const tabPill = track(figma.createFrame());
tabPill.name = 'Tab bar';
tabPill.resize(244, 56);
tabPill.x = (390 - 244) / 2;
tabPill.y = 12;
tabPill.fills = solidPaint(h('#FFFFFF'));
tabPill.cornerRadius = 999;
tabPill.layoutMode = 'HORIZONTAL';
tabPill.paddingLeft = 16;
tabPill.paddingRight = 16;
tabPill.paddingTop = 10;
tabPill.paddingBottom = 10;
tabPill.itemSpacing = 4;
tabPill.primaryAxisAlignItems = 'CENTER';
tabPill.counterAxisAlignItems = 'CENTER';
function tabItem(label, active) {
  const t = vFrame(label, 60);
  t.primaryAxisAlignItems = 'CENTER';
  t.itemSpacing = 4;
  t.paddingLeft = 10;
  t.paddingRight = 10;
  const icMap = { Logs: '📋', Stats: '📊', Profile: '👤' };
  const ic = icMap[label] || '•';
  const col = active ? h('#000000') : h('#6B7280');
  t.appendChild(txt(ic, 16, F.interR, col));
  t.appendChild(txt(label, 11, active ? F.interSb : F.interR, col));
  return t;
}
tabPill.appendChild(tabItem('Logs', true));
tabPill.appendChild(tabItem('Stats', false));
tabPill.appendChild(tabItem('Profile', false));
bottom.appendChild(tabPill);
const fabGroup = track(figma.createFrame());
fabGroup.name = 'FAB';
fabGroup.resize(56, 56);
fabGroup.x = 390 - 16 - 56;
fabGroup.y = 20;
fabGroup.fills = [];
fabGroup.layoutMode = 'NONE';
const fab = track(figma.createEllipse());
fab.resize(56, 56);
fab.x = 0;
fab.y = 0;
fab.fills = solidPaint(h('#000000'));
fabGroup.appendChild(fab);
const fabIcon = txt('💬', 20, F.interR, h('#FFFFFF'));
fabIcon.x = 16;
fabIcon.y = 14;
fabGroup.appendChild(fabIcon);
bottom.appendChild(fabGroup);
screen.appendChild(bottom);

return {
  createdNodeIds: ids,
  screenId: screen.id,
  message: 'Logs baseline frame created',
};
