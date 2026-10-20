// Israeli locations → region. English and Hebrew spellings, normalised (lowercase, no quotes/dashes).
// Regions: north, haifa, sharon, center, jerusalem, shfela, south
const CITIES = {
  north: ['yokneam', 'yoqneam', 'יקנעם', 'nazareth', 'נצרת', 'nof hagalil', 'nazareth illit', 'נוף הגליל', 'karmiel', 'carmiel', 'כרמיאל', 'nahariya', 'נהריה',
    'acre', 'akko', 'עכו', 'tiberias', 'טבריה', 'afula', 'עפולה', 'kiryat shmona', 'קריית שמונה', 'maalot', 'מעלות', 'migdal haemek', 'מגדל העמק', 'tefen', 'תפן',
    'misgav', 'משגב', 'safed', 'zefat', 'צפת', 'katzrin', 'קצרין', 'rosh pina', 'ראש פינה', 'northern district', 'מחוז צפון', 'galilee', 'גליל'],
  haifa: ['haifa', 'חיפה', 'kiryat motzkin', 'kiryat bialik', 'kiryat ata', 'kiryat yam', 'krayot', 'קריות', 'קריית אתא', 'קריית ביאליק', 'קריית מוצקין',
    'nesher', 'נשר', 'tirat carmel', 'טירת כרמל', 'caesarea', 'קיסריה', 'haifa district', 'מחוז חיפה', 'matam', 'מת"ם', 'zichron yaakov', 'זכרון יעקב'],
  sharon: ['netanya', 'נתניה', 'herzliya', 'herzlia', 'הרצליה', 'raanana', 'רעננה', 'kfar saba', 'כפר סבא', 'hod hasharon', 'הוד השרון', 'ramat hasharon', 'רמת השרון',
    'kfar yona', 'כפר יונה', 'even yehuda', 'אבן יהודה', 'kadima', 'קדימה', 'hadera', 'חדרה', 'tel mond', 'תל מונד', 'pardes hanna', 'פרדס חנה', 'sharon', 'שרון'],
  center: ['tel aviv', 'tel-aviv', 'תל אביב', 'ramat gan', 'רמת גן', 'givatayim', 'givataim', 'גבעתיים', 'bnei brak', 'בני ברק', 'petah tikva', 'petach tikva',
    'petah tiqva', 'פתח תקווה', 'פתח תקוה', 'holon', 'חולון', 'bat yam', 'בת ים', 'rishon lezion', 'rishon le zion', 'ראשון לציון', 'or yehuda', 'אור יהודה',
    'yehud', 'יהוד', 'kiryat ono', 'קריית אונו', 'airport city', 'איירפורט סיטי', 'lod', 'לוד', 'ramla', 'רמלה', 'rosh haayin', 'rosh haain', 'ראש העין',
    'shoham', 'שוהם', 'ganei tikva', 'גני תקווה', 'azor', 'אזור', 'kfar kasem', 'elad', 'אלעד', 'tel aviv district', 'central district', 'מחוז מרכז', 'מחוז תל אביב', 'center', 'מרכז'],
  jerusalem: ['jerusalem', 'ירושלים', 'mevaseret', 'מבשרת', 'beit shemesh', 'בית שמש', 'modiin', 'מודיעין', 'har hotzvim', 'הר חוצבים', 'jerusalem district', 'מחוז ירושלים', 'maale adumim', 'מעלה אדומים'],
  shfela: ['rehovot', 'רחובות', 'ness ziona', 'nes ziona', 'נס ציונה', 'yavne', 'יבנה', 'ashdod', 'אשדוד', 'kiryat gat', 'קריית גת', 'gedera', 'גדרה',
    'kiryat ekron', 'mazkeret batya', 'kiryat malachi', 'קריית מלאכי', 'shfela', 'שפלה'],
  south: ['beer sheva', 'beersheba', 'beer-sheva', 'be er sheva', 'באר שבע', 'ashkelon', 'אשקלון', 'dimona', 'דימונה', 'eilat', 'אילת', 'sderot', 'שדרות',
    'ofakim', 'אופקים', 'netivot', 'נתיבות', 'omer', 'עומר', 'yeruham', 'ירוחם', 'arad', 'ערד', 'southern district', 'מחוז דרום', 'negev', 'נגב']
};
const ISRAEL = /israel|ישראל|\bisr\b|\bil\b/i;
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[‘’'`"״׳]/g, '').replace(/[-–_]/g, ' ').replace(/\s+/g, ' ').trim();

// Pretty city name for display (first match wins; Hebrew label)
const CITY_LABEL = [
  ['tel aviv', 'תל אביב'], ['herzliya', 'הרצליה'], ['herzlia', 'הרצליה'], ['haifa', 'חיפה'], ['jerusalem', 'ירושלים'], ['petah tikva', 'פתח תקווה'], ['petach tikva', 'פתח תקווה'],
  ['ramat gan', 'רמת גן'], ['givatayim', 'גבעתיים'], ['givataim', 'גבעתיים'], ['bnei brak', 'בני ברק'], ['beer sheva', 'באר שבע'], ['beersheba', 'באר שבע'], ['yokneam', 'יקנעם'],
  ['yoqneam', 'יקנעם'], ['netanya', 'נתניה'], ['raanana', 'רעננה'], ['kfar saba', 'כפר סבא'], ['rehovot', 'רחובות'], ['hod hasharon', 'הוד השרון'], ['or yehuda', 'אור יהודה'],
  ['caesarea', 'קיסריה'], ['modiin', 'מודיעין'], ['rosh haayin', 'ראש העין'], ['airport city', 'איירפורט סיטי'], ['holon', 'חולון'], ['ness ziona', 'נס ציונה'], ['nes ziona', 'נס ציונה'],
  ['rishon', 'ראשון לציון'], ['ashdod', 'אשדוד'], ['ashkelon', 'אשקלון'], ['nazareth', 'נצרת'], ['karmiel', 'כרמיאל'], ['carmiel', 'כרמיאל'], ['nahariya', 'נהריה'], ['afula', 'עפולה'],
  ['tiberias', 'טבריה'], ['hadera', 'חדרה'], ['lod', 'לוד'], ['yehud', 'יהוד'], ['kiryat ono', 'קריית אונו'], ['ramat hasharon', 'רמת השרון'], ['misgav', 'משגב'], ['tefen', 'תפן'],
  ['migdal haemek', 'מגדל העמק'], ['yavne', 'יבנה'], ['kiryat gat', 'קריית גת'], ['eilat', 'אילת'], ['dimona', 'דימונה'], ['beit shemesh', 'בית שמש'], ['mevaseret', 'מבשרת ציון'],
  ['shoham', 'שוהם'], ['tel aviv district', 'מחוז תל אביב']
];

function labelFor(cn) {
  for (const [k, v] of CITY_LABEL) { if (cn.includes(k) || k.includes(cn)) return v; }
  return /[\u0590-\u05FF]/.test(cn) ? cn : cn.replace(/\b\w/g, m => m.toUpperCase());
}

function locate(locText) {
  // "X, Tel Aviv District" names a district, not the city of Tel Aviv
  const t = norm(locText).replace(/tel aviv district/g, '#district#');
  const hits = [];
  for (const [r, list] of Object.entries(CITIES)) {
    for (const c of list) {
      const cn = norm(c);
      if (cn.length < 3) continue;
      const i = t.indexOf(cn);
      if (i < 0) continue;
      const isDistrict = /district|מחוז|^center$|^מרכז$|^sharon$|^שרון$|negev|נגב|galilee|גליל|shfela|שפלה/.test(cn);
      hits.push({ r, cn, i, isDistrict });
    }
  }
  // the first city mentioned wins; districts only when no city is named
  hits.sort((a, b) => (a.isDistrict - b.isDistrict) || (a.i - b.i) || (b.cn.length - a.cn.length));
  const best = hits[0];
  let region = best ? best.r : null;
  let city = best && !best.isDistrict ? labelFor(best.cn) : null;
  if (!region && t.includes('#district#')) { region = 'center'; city = 'מחוז תל אביב'; }
  const isIL = ISRAEL.test(locText || '');
  return { inIsrael: !!region || isIL, region, city: city || (region ? REGION_LABEL[region] : (isIL ? 'ישראל' : null)) };
}
const REGION_LABEL = { north: 'צפון', haifa: 'חיפה והקריות', sharon: 'שרון', center: 'מרכז', jerusalem: 'ירושלים', shfela: 'שפלה', south: 'דרום' };

module.exports = { locate, norm, CITIES };
