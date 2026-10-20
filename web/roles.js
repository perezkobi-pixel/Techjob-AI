/*
 * TechJob AI — tech roles taxonomy.
 * Shared by the web app (window.TJ_ROLES) and the collector (require('../web/roles.js')).
 *
 * Each role:
 *   id   – stable key (stored in the database, do not rename)
 *   he   – Hebrew display name (manager roles start with "מנהל" so typing "מנהל" lists them all)
 *   en   – English titles and synonyms (shown in the combobox and used for text search)
 *   g    – group id (see GROUPS)
 *   re   – regex tested against the job TITLE (English + Hebrew)
 *   desc – optional regex tested against the DESCRIPTION too (used for languages / stacks,
 *          where the title often says only "Software Engineer")
 */
(function (root) {
  const GROUPS = [
    ['dev', 'פיתוח תוכנה'],
    ['infra', 'תשתיות, ענן ו־DevOps'],
    ['qa', 'QA ובדיקות'],
    ['data', 'דאטה ו־AI'],
    ['cyber', 'סייבר ואבטחת מידע'],
    ['product', 'מוצר ועיצוב'],
    ['mgmt', 'ניהול טכנולוגי'],
    ['solutions', 'פתרונות, Presales ותמיכה'],
    ['hw', 'חומרה, אלקטרוניקה ומערכות'],
    ['it', 'IT ומערכות מידע'],
    ['marketing', 'שיווק דיגיטלי, קריאייטיב ותוכן'],
    ['digital', 'משחקים, תלת־ממד ו־XR']
  ];

  const R = (id, he, en, g, re, desc) => ({ id, he, en, g, re, desc: desc || null });

  const ROLES = [
    /* ---------- פיתוח תוכנה ---------- */
    R('software_eng', 'מהנדס/ת תוכנה', ['Software Engineer', 'Software Developer', 'SWE', 'מתכנת/ת'], 'dev',
      /software (engineer|developer)|\bsw\b ?engineer|\bswe\b|developer\b|programmer|מפתח|מתכנת|מהנדס תוכנה|engineer\b.*(r&d|core engineering)|staff engineer|principal engineer|^engineer$/i),
    R('backend', 'מפתח/ת Backend', ['Backend Developer', 'Backend Engineer', 'Server-side'], 'dev', /back[\s-]?end|server[\s-]?side|צד שרת/i),
    R('frontend', 'מפתח/ת Frontend', ['Frontend Developer', 'Frontend Engineer', 'UI Developer'], 'dev', /front[\s-]?end|\bui (engineer|developer)|צד לקוח|design system tech lead/i),
    R('fullstack', 'מפתח/ת Full Stack', ['Full Stack Developer', 'Fullstack Engineer'], 'dev', /full[\s-]?stack|פול ?סטאק/i),
    R('mobile', 'מפתח/ת מובייל', ['Mobile Developer', 'React Native', 'Flutter'], 'dev', /mobile (developer|engineer)|react native|flutter|מובייל/i),
    R('ios', 'מפתח/ת iOS', ['iOS Developer', 'Swift'], 'dev', /\bios\b|swift(ui)?\b/i),
    R('android', 'מפתח/ת Android', ['Android Developer', 'Kotlin'], 'dev', /android|אנדרואיד/i),
    R('embedded', 'מפתח/ת Embedded', ['Embedded Software Engineer', 'Firmware', 'BSP', 'RTOS'], 'dev', /embedded|firmware|\bbsp\b|rtos|משובצ/i),
    R('lowlevel', 'מפתח/ת Low Level / Kernel', ['Kernel Developer', 'Linux Internals', 'Drivers', 'C Developer'], 'dev', /kernel|low[\s-]?level|drivers?\b|linux internals|\(c\)|team leader \(c\)/i),
    R('python', 'מפתח/ת Python', ['Python Developer', 'Django', 'FastAPI'], 'dev', /python|django|fastapi/i, /\bpython\b/i),
    R('java', 'מפתח/ת Java', ['Java Developer', 'Spring', 'JVM'], 'dev', /\bjava\b|spring boot|\bjvm\b/i, /\bjava\b/i),
    R('dotnet', 'מפתח/ת ‎.NET / C#‎', ['.NET Developer', 'C# Developer'], 'dev', /\.net\b|c#|dotnet/i, /\.net\b|\bc#/i),
    R('cpp', 'מפתח/ת C / C++', ['C++ Developer', 'C Developer'], 'dev', /c\+\+|\bcpp\b/i, /c\+\+/i),
    R('golang', 'מפתח/ת Go', ['Go Developer', 'Golang'], 'dev', /\bgolang\b|\bgo (developer|engineer)/i, /\bgolang\b|\bgo\b(?= |,)(?=.*(microservice|backend|concurrency))/i),
    R('node', 'מפתח/ת Node.js', ['Node.js Developer', 'TypeScript Backend'], 'dev', /node\.?\s?js|\bnode\b/i, /node\.?js/i),
    R('react', 'מפתח/ת React', ['React Developer', 'React.js'], 'dev', /\breact\b(?! native)/i, /\breact\b(?! native)/i),
    R('angular', 'מפתח/ת Angular / Vue', ['Angular Developer', 'Vue Developer'], 'dev', /angular|\bvue/i, /angular|vue\.?js/i),
    R('php', 'מפתח/ת PHP', ['PHP Developer', 'Laravel'], 'dev', /\bphp\b|laravel/i, /\bphp\b/i),
    R('ruby', 'מפתח/ת Ruby', ['Ruby on Rails Developer'], 'dev', /\bruby\b|rails/i, /\bruby\b/i),
    R('scala', 'מפתח/ת Scala / Kotlin', ['Scala Developer', 'Kotlin Backend'], 'dev', /\bscala\b/i, /\bscala\b/i),
    R('rust', 'מפתח/ת Rust', ['Rust Developer'], 'dev', /\brust\b/i, /\brust\b/i),
    R('web', 'מפתח/ת Web / WordPress', ['Web Developer', 'WordPress', 'Webmaster'], 'dev', /web (developer|programmer)|wordpress|webmaster|בניית אתרים/i),
    R('architect', 'ארכיטקט/ית תוכנה', ['Software Architect', 'R&D Architect', 'System Architect'], 'dev', /(software|system|technical|r&d|platform|product technical|enterprise) architect|^architect/i),
    R('techlead', 'Tech Lead', ['Tech Lead', 'Staff Engineer', 'Principal Engineer'], 'dev', /tech(nical)? lead|staff (software )?engineer|principal (software )?engineer|principal tech/i),
    R('algo', 'מהנדס/ת אלגוריתמים', ['Algorithm Engineer', 'Algorithm Developer'], 'dev', /algorithm|אלגוריתמ/i),
    R('cv', 'מהנדס/ת ראייה ממוחשבת', ['Computer Vision Engineer', 'Image Processing'], 'data', /computer vision|\bcv engineer|image processing|עיבוד תמונה|ראייה ממוחשבת/i),
    R('integration', 'מהנדס/ת אינטגרציה', ['Integration Engineer', 'Integrations Developer'], 'dev', /integrations? (engineer|developer)|אינטגרציה/i),
    R('devex', 'מהנדס/ת Developer Experience', ['DevEx', 'Developer Productivity', 'Build Engineer'], 'infra', /devex|developer experience|developer productivity|build engineer|release engineer/i),
    R('blockchain', 'מפתח/ת Blockchain / Web3', ['Blockchain Developer', 'Solidity', 'Smart Contracts'], 'dev', /blockchain|web3|solidity|smart contract|crypto engineer/i),
    R('rpa', 'מפתח/ת RPA / Low-code', ['RPA Developer', 'UiPath', 'Power Platform'], 'it', /\brpa\b|uipath|low[\s-]?code|power (apps|automate|platform)/i),
    R('techwriter', 'כותב/ת טכני/ת', ['Technical Writer', 'Documentation Engineer'], 'product', /technical writer|documentation|כתיבה טכנית/i),

    /* ---------- תשתיות, ענן ו-DevOps ---------- */
    R('devops', 'מהנדס/ת DevOps', ['DevOps Engineer', 'CI/CD'], 'infra', /dev ?ops|דבאופס/i),
    R('sre', 'מהנדס/ת SRE', ['Site Reliability Engineer', 'Production Engineer'], 'infra', /\bsre\b|site reliability|production engineer/i),
    R('cloud', 'מהנדס/ת ענן', ['Cloud Engineer', 'Cloud Architect', 'AWS', 'Azure', 'GCP'], 'infra', /cloud (engineer|architect|infrastructure|ops)|\baws\b engineer|azure (engineer|architect)|\bgcp\b|ענן/i),
    R('platform', 'מהנדס/ת Platform / Infrastructure', ['Platform Engineer', 'Infrastructure Engineer'], 'infra', /platform engineer|infrastructure engineer|infra engineer|platform enablement|agent platform|תשתיות/i),
    R('devsecops', 'מהנדס/ת DevSecOps', ['DevSecOps Engineer'], 'cyber', /devsecops/i),
    R('mlops', 'מהנדס/ת MLOps', ['MLOps Engineer', 'ML Platform'], 'data', /mlops|ml platform|ai platform engineer/i),
    R('network', 'מהנדס/ת רשתות', ['Network Engineer', 'NOC', 'Network Architect'], 'infra', /network (engineer|administrator|architect|research)|\bnoc\b|ccnp|ccie|research engineer \(network\)|networking group|רשתות|תקשורת נתונים/i),
    R('sysadmin', 'מנהל/ת מערכות (Linux / Windows)', ['System Administrator', 'IT System Engineer', 'Linux Admin'], 'it', /system(s)? administrator|sysadmin|it system|linux (admin|engineer)|windows (admin|engineer)|vmware|virtualization|storage engineer|מנהל מערכות|מנהלת מערכות/i),
    R('dba', 'DBA / מהנדס/ת מסדי נתונים', ['Database Administrator', 'Database Engineer'], 'infra', /\bdba\b|database (administrator|engineer)|מסדי נתונים/i),

    /* ---------- QA ---------- */
    R('qa_auto', 'מהנדס/ת QA אוטומציה', ['QA Automation Engineer', 'SDET', 'Test Automation'], 'qa', /automation (engineer|developer)|sdet|test automation|qa automation|אוטומציה/i),
    R('qa', 'בודק/ת תוכנה (QA)', ['QA Engineer', 'Manual QA', 'Software Tester'], 'qa', /\bqa\b|quality assurance|tester|test engineer|בודק|בדיקות תוכנה/i),
    R('perf', 'מהנדס/ת בדיקות ביצועים', ['Performance Engineer', 'Load Testing'], 'qa', /performance (engineer|test)|load test/i),
    R('validation', 'מהנדס/ת ולידציה', ['Validation Engineer', 'Verification Engineer'], 'hw', /validation|verification engineer|ולידציה/i),

    /* ---------- דאטה ו-AI ---------- */
    R('data_eng', 'מהנדס/ת דאטה', ['Data Engineer', 'Big Data Engineer', 'ETL Developer'], 'data', /data (engineer|platform|infrastructure)|big data engineer|\betl\b|lakehouse|data pipeline|מהנדס דאטה|דאטה אינג/i),
    R('data_sci', 'מדען/ית נתונים', ['Data Scientist'], 'data', /data scien|מדען נתונים|דאטה סיינט/i),
    R('data_analyst', 'אנליסט/ית דאטה', ['Data Analyst', 'Big Data Analyst', 'Analytics Engineer'], 'data', /data analyst|big data analyst|ml & big data|analytics engineer|cyber data analyst|אנליסט דאטה|אנליסט נתונים/i),
    R('bi', 'מפתח/ת BI', ['BI Developer', 'Business Intelligence', 'Tableau', 'Power BI'], 'data', /\bbi\b|business intelligence|tableau|power bi|looker|business analytics/i),
    R('product_analyst', 'אנליסט/ית מוצר', ['Product Analyst'], 'data', /product analyst|אנליסט מוצר/i),
    R('ml', 'מהנדס/ת Machine Learning', ['ML Engineer', 'Machine Learning Engineer'], 'data', /machine learning|\bml\b (engineer|developer)|applied ml|למידת מכונה/i),
    R('ai_eng', 'מהנדס/ת AI / GenAI', ['AI Engineer', 'GenAI Engineer', 'LLM Engineer', 'Agentic AI'], 'data', /\bai\b (engineer|developer|expert|native)|genai|gen ai|\bllm\b|agentic|ai fluent|with ai experience|בינה מלאכותית/i),
    R('ai_research', 'חוקר/ת AI', ['AI Researcher', 'Research Scientist', 'Applied AI Researcher'], 'data', /(ai|ml|applied ai|applied) researcher|research scientist|ai research/i),
    R('nlp', 'מהנדס/ת NLP', ['NLP Engineer', 'Speech'], 'data', /\bnlp\b|natural language|speech (recognition|engineer)/i),
    R('ai_trainer', 'מאמן/ת AI ותיוג דאטה', ['AI Trainer', 'Data Annotation', 'Prompt Engineer'], 'data', /ai trainer|annotat|prompt engineer|data labeling|תיוג/i),

    /* ---------- סייבר ---------- */
    R('sec_research', 'חוקר/ת סייבר', ['Security Researcher', 'Threat Researcher', 'Vulnerability Researcher', 'Reverse Engineer'], 'cyber',
      /security research|threat (research|detection|intelligence)|vulnerability research|malware|reverse engineer|detection (software )?engineer|חוקר סייבר|חוקר אבטחה/i),
    R('sec_eng', 'מהנדס/ת אבטחת מידע', ['Security Engineer', 'Cyber Engineer', 'IT Security'], 'cyber', /security engineer|cyber (defense )?engineer|it security|אבטחת מידע|מהנדס סייבר/i),
    R('appsec', 'מהנדס/ת Application Security', ['AppSec', 'Product Security'], 'cyber', /application security|appsec|product security/i),
    R('soc', 'אנליסט/ית SOC ותגובה לאירועים', ['SOC Analyst', 'MDR', 'Incident Responder', 'Threat Hunter', 'DFIR'], 'cyber', /\bsoc\b|security analyst|\bmdr\b|threat hunt|incident respon|dfir|forensic|אנליסט סייבר/i),
    R('pentest', 'בודק/ת חדירות (PT)', ['Penetration Tester', 'Red Team', 'Offensive Security'], 'cyber', /penetration|pentest|red team|offensive|ethical hack|בודק חדירות/i),
    R('sec_arch', 'ארכיטקט/ית אבטחת מידע', ['Security Architect'], 'cyber', /security architect/i),
    R('grc', 'GRC ורגולציה באבטחת מידע', ['GRC Specialist', 'Security Compliance', 'Cyber Risk'], 'cyber', /\bgrc\b|security (compliance|governance)|cyber risk|iso ?27001|privacy engineer/i),
    R('cloud_sec', 'מהנדס/ת Cloud Security', ['Cloud Security Engineer'], 'cyber', /cloud security|cspm|cnapp/i),
    R('iam', 'מהנדס/ת IAM', ['Identity & Access Management'], 'cyber', /\biam\b|identity (and|&) access|identity engineer/i),
    R('ciso', 'מנהל/ת אבטחת מידע (CISO)', ['CISO', 'Head of Security', 'Security Manager', 'Director of Security'], 'cyber', /\bciso\b|head of (ai )?security|head of cyber|director of (platform )?security|security manager|devsecops manager|vp security|מנהל אבטחת מידע/i),

    /* ---------- מוצר ועיצוב ---------- */
    R('pm', 'מנהל/ת מוצר', ['Product Manager', 'Product Owner', 'Head of Product'], 'product', /product manager|product owner|head of product|director of product|vp,? product|product lead|product team lead|product associate|מנהל מוצר|מנהלת מוצר/i),
    R('tpm_product', 'מנהל/ת מוצר טכני', ['Technical Product Manager', 'Platform Product Manager'], 'product', /technical product (manager|associate)|platform product|inbound product manager|technical product/i),
    R('ai_pm', 'מנהל/ת מוצר AI', ['AI Product Manager', 'Product Manager, AI'], 'product', /(\bai\b|genai|ml).*product manager|product manager.*(\bai\b|ml\b)/i),
    R('product_ops', 'מנהל/ת Product Operations', ['Product Operations'], 'product', /product op(eration)?s/i),
    R('ux', 'מעצב/ת UX/UI', ['UX/UI Designer', 'Product Designer', 'Interaction Designer'], 'product', /\bux\b|\bui\b designer|ui\/ux|product designer|interaction designer|מעצב ux|מעצבת ux|עיצוב ממשק/i),
    R('ux_research', 'חוקר/ת UX', ['UX Researcher', 'User Researcher'], 'product', /ux research|user research/i),
    R('ux_writer', 'כותב/ת UX', ['UX Writer', 'Content Designer'], 'product', /ux writ|content designer/i),
    R('design_mgr', 'מנהל/ת עיצוב', ['Design Lead', 'Head of Design', 'Design Manager'], 'product', /(?<!chip |board |asic |hardware |physical )design (team )?lead|head of design|director,? product design|(?<!chip |board |asic |hardware |physical )design manager|product design team lead|ux (team )?(lead|manager)/i),
    R('business_analyst', 'מנתח/ת מערכות / Business Analyst', ['Business Analyst', 'System Analyst'], 'product', /business analyst|system(s)? analyst|מנתח מערכות|מנתחת מערכות/i),

    /* ---------- ניהול טכנולוגי ---------- */
    R('team_lead', 'מנהל/ת צוות פיתוח', ['Team Lead', 'Software Team Leader', 'R&D Team Lead'], 'mgmt',
      /(software|engineering|development|r&d|backend|frontend|full ?stack|platform|infrastructure|data platform|production engineering|devex|algorithm)[^,]*team (lead|leader|manager)|team (lead|leader|manager)[^,]*(r&d|engineering|software|\(c\))|engineering team lead|ראש צוות|מנהל צוות/i),
    R('eng_manager', 'מנהל/ת פיתוח (R&D)', ['Engineering Manager', 'R&D Manager', 'Director of Engineering'], 'mgmt', /engineering manager|r&d,? (manager|director|group)|development manager|director of engineering|head of engineering|group (manager|leader)|מנהל פיתוח|מנהלת פיתוח/i),
    R('cto', 'מנהל/ת טכנולוגיות ראשי/ת (CTO / VP R&D)', ['CTO', 'VP R&D', 'VP Engineering', 'R&D Architect Director'], 'mgmt', /\bcto\b(?! office)|vp,? (of )?(r&d|engineering)|chief technology|architect director|סמנכ"?ל (פיתוח|טכנולוגיות)/i),
    R('pm_tech', 'מנהל/ת פרויקטים טכנולוגיים', ['Technical Project Manager', 'Program Manager', 'Delivery Manager', 'PMO'], 'mgmt', /project manager|program manager|\btpm\b|\bpmo\b|delivery manager|מנהל פרויקט|מנהלת פרויקט/i),
    R('scrum', 'Scrum Master / Agile Coach', ['Scrum Master', 'Agile Coach'], 'mgmt', /scrum|agile coach/i),
    R('innovation', 'מנהל/ת חדשנות', ['Innovation Manager', 'Digital Transformation Lead'], 'mgmt', /innovation|transformation|חדשנות/i),
    R('digital_mgr', 'מנהל/ת דיגיטל', ['Digital Manager', 'Head of Digital', 'Chief Digital Officer'], 'mgmt', /digital (manager|director|lead)|head of digital|chief digital|מנהל דיגיטל|מנהלת דיגיטל/i),
    R('devops_mgr', 'מנהל/ת DevOps ותשתיות', ['DevOps Manager', 'Head of Infrastructure', 'Platform Lead'], 'mgmt', /(devops|sre|infrastructure|platform|devex|developer experience)[^,]*(team )?(lead|leader|manager)|head of (devops|infrastructure|platform)/i),
    R('data_mgr', 'מנהל/ת דאטה ואנליטיקה', ['Head of Data', 'Data Science Manager', 'Director of Analytics'], 'mgmt', /head of (data|analytics)|data (science )?(team )?(lead|manager)|director of (data|analytics|business analytics)|data scientist team manager|data platform engineering team/i),
    R('ai_mgr', 'מנהל/ת AI', ['Head of AI', 'AI Team Lead', 'AI Group Manager'], 'mgmt', /head of ai\b|ai (team |platform team )?(lead|manager)|director.*\bai\b|manager.*\bai\b|ai agentic frameworks/i),
    R('qa_mgr', 'מנהל/ת QA', ['QA Manager', 'QA Team Lead', 'Head of QA'], 'mgmt', /qa (team )?(lead|leader|manager)|head of qa|quality (engineering )?manager|מנהל qa/i),
    R('it_mgr', 'מנהל/ת IT', ['IT Manager', 'Head of IT', 'CIO'], 'mgmt', /it manager|head of it|it director|\bcio\b|it team lead|מנהל it|מנהל מערכות מידע/i),
    R('product_mgr_lead', 'מנהל/ת קבוצת מוצר', ['Director of Product', 'Head of Product', 'Group Product Manager'], 'mgmt', /director of product|head of product|group product manager|vp,? product|principal product manager/i),

    /* ---------- פתרונות, Presales ותמיכה ---------- */
    R('presales', 'מהנדס/ת Presales / Solutions', ['Sales Engineer', 'Solutions Engineer', 'Solutions Architect', 'Presales'], 'solutions', /pre[\s-]?sales|sales engineer|solutions? (engineer|architect|consultant)|field engineer|פריסייל/i),
    R('solutions_mgr', 'מנהל/ת פתרונות', ['Solutions Manager', 'AI Solutions Manager', 'Presales Manager'], 'solutions', /solutions? manager|presales manager|head of solutions/i),
    R('support', 'מהנדס/ת תמיכה טכנית', ['Technical Support Engineer', 'Application Support', 'Tier 3'], 'solutions', /support engineer|technical support|application support|tier [123]|support enablement|product support|תמיכה טכנית/i),
    R('implementation', 'מהנדס/ת הטמעה ואינטגרציה ללקוח', ['Implementation Engineer', 'Professional Services', 'Onboarding Engineer'], 'solutions', /implementation|professional services|onboarding engineer|deployment engineer|customer engineer|הטמעה/i),
    R('tam', 'Technical Account Manager', ['TAM', 'Technical Customer Success'], 'solutions', /technical account manager|\btam\b|technical customer success/i),
    R('it_support', 'תומך/ת IT / Helpdesk', ['IT Support', 'Helpdesk', 'Desktop Support'], 'it', /help ?desk|it support|desktop support|service desk|technician|תומך מחשוב|תמיכת מחשוב/i),

    /* ---------- חומרה, אלקטרוניקה ומערכות ---------- */
    R('hw', 'מהנדס/ת חומרה ואלקטרוניקה', ['Hardware Engineer', 'Board Design', 'Electrical Engineer'], 'hw', /hardware|board design|\bpcb\b|electrical engineer|electronics|מהנדס חשמל|אלקטרוניקה|חומרה/i),
    R('asic', 'מהנדס/ת VLSI / ASIC / FPGA', ['ASIC', 'VLSI', 'FPGA', 'RTL', 'Physical Design'], 'hw', /asic|vlsi|\brtl\b|fpga|chip|silicon|physical design|\bdft\b|analog design|design verification|שבבים/i),
    R('rf', 'מהנדס/ת RF', ['RF Engineer', 'Antenna'], 'hw', /\brf\b|antenna|microwave/i),
    R('dsp', 'מהנדס/ת DSP ועיבוד אותות', ['DSP Engineer', 'Signal Processing'], 'hw', /\bdsp\b|signal processing|עיבוד אותות/i),
    R('systems_eng', 'מהנדס/ת מערכת', ['Systems Engineer', 'System Engineer'], 'hw', /^(senior )?systems? engineer|מהנדס מערכת/i),
    R('mechanical', 'מהנדס/ת מכונות ומכטרוניקה', ['Mechanical Engineer', 'Mechatronics'], 'hw', /mechanical|mechatronic|מכטרוניקה|מהנדס מכונות/i),
    R('robotics', 'מהנדס/ת רובוטיקה ומערכות אוטונומיות', ['Robotics Engineer', 'Autonomous Systems'], 'hw', /robotic|autonomous|motion control|רובוטיקה/i),
    R('optics', 'מהנדס/ת אופטיקה', ['Optical Engineer', 'Photonics'], 'hw', /optic|photonic|laser/i),

    /* ---------- IT ומערכות מידע ---------- */
    R('salesforce', 'מפתח/ת Salesforce / CRM', ['Salesforce Developer', 'CRM Developer', 'Dynamics'], 'it', /salesforce|crm (developer|engineer|admin)|dynamics 365|hubspot/i),
    R('erp', 'מפתח/ת ERP (SAP / Priority)', ['SAP', 'Priority', 'Oracle EBS', 'NetSuite', 'ABAP'], 'it', /\bsap\b|\berp\b|priority|abap|oracle (apps|ebs|erp)|netsuite|workday (developer|analyst)/i),
    R('bizapps', 'מנהל/ת מערכות עסקיות (Business Apps)', ['Business Applications Manager', 'Business Systems'], 'it', /business (applications|systems)|bizapps|business apps|domain operations lead, business applications/i),

    /* ---------- דיגיטל, משחקים ותלת-ממד ---------- */
    R('game_dev', 'מפתח/ת משחקים', ['Game Developer', 'Unity Developer', 'Unreal Developer', 'Gameplay Programmer'], 'digital', /game (developer|engineer|programmer)|gameplay|unity (developer|engineer)|unreal|מפתח משחקים/i),
    R('game_design', 'מעצב/ת משחקים', ['Game Designer', 'Level Designer'], 'digital', /game design|level design/i),
    R('tech_artist', 'Technical Artist', ['Technical Artist', 'Shader Artist'], 'digital', /technical artist|tech art|shader/i),
    R('artist3d', 'אנימטור/ית ואמן/ית תלת־ממד', ['3D Artist', 'Animator', 'VFX', 'Rigging'], 'digital', /\b3d\b|animator|animation|rigging|modeler|cg artist|vfx|houdini|תלת.?ממד|אנימציה/i),
    R('motion', 'מעצב/ת Motion', ['Motion Designer', 'After Effects'], 'digital', /motion design|motion graphic|מושן/i),
    R('xr', 'מפתח/ת VR / AR / XR', ['VR Developer', 'AR Developer', 'XR'], 'digital', /\bvr\b|\bar\b (developer|engineer)|\bxr\b|virtual reality|augmented reality|מציאות מדומה/i),
    R('simulation', 'מפתח/ת סימולטורים', ['Simulation Engineer', 'Simulator Developer'], 'digital', /simulat|סימולטור|סימולציה/i),
    R('creative_tech', 'מנהל/ת טכנולוגיה קריאייטיב', ['Creative Technologist', 'Creative Technology Lead'], 'digital', /creative technolog/i),
    R('concept_art', 'אמן/ית משחקים (2D / Concept / UI)', ['Game Artist', 'Concept Artist', 'UI Artist', '2D Artist'], 'digital', /concept art|2d artist|game artist|ui artist|character artist|environment artist/i),
    R('sound', 'מעצב/ת סאונד', ['Sound Designer', 'Audio Designer'], 'digital', /sound design|audio (designer|engineer)|סאונד/i),
    R('liveops', 'מנהל/ת LiveOps ומוניטיזציה', ['LiveOps Manager', 'Monetization', 'Game Economy'], 'digital', /live ?ops|monetization|game economy|economy design/i),
    R('elearning', 'מפתח/ת הדרכה ו־e-Learning', ['Instructional Designer', 'e-Learning Developer'], 'digital', /instructional design|e-?learning|לומדות|פיתוח הדרכה/i),

    /* ---------- שיווק דיגיטלי, קריאייטיב ותוכן ---------- */
    R('art_director', 'ארט דירקטור/ית', ['Art Director', 'Senior Art Director'], 'marketing', /art direct|ארט דירקטור|ארט-דירקטור/i),
    R('creative_dir', 'מנהל/ת קריאייטיב (Creative Director)', ['Creative Director', 'Head of Creative', 'Creative Lead'], 'marketing', /creative (director|lead|manager)|head of creative|קריאייטיב דירקטור|מנהל קריאייטיב|מנהלת קריאייטיב/i),
    R('visual_design', 'מעצב/ת גרפי/ת ומיתוג', ['Graphic Designer', 'Brand Designer', 'Visual Designer'], 'marketing', /brand designer|visual designer|graphic designer|marketing designer|מעצב גרפי|מעצבת גרפית|גרפיקאי/i),
    R('web_designer', 'מעצב/ת אתרים ודפי נחיתה', ['Web Designer', 'Landing Pages', 'Webflow'], 'marketing', /web designer|landing page|webflow|מעצב אתרים|עיצוב אתרים|דפי נחיתה/i),
    R('illustrator', 'מאייר/ת', ['Illustrator'], 'marketing', /illustrat|מאייר/i),
    R('video', 'עורך/ת וידאו ומפיק/ת תוכן', ['Video Editor', 'Video Producer', 'Content Creator'], 'marketing', /video (editor|producer|creator|designer)|content creator|עורך וידאו|עורכת וידאו|עריכת וידאו/i),
    R('marcom', 'מנהל/ת מרקום (Marcom)', ['Marketing Communications Manager', 'Marcom'], 'marketing', /marcom|marketing communication|מרקום|תקשורת שיווקית/i),
    R('pmm', 'מנהל/ת שיווק מוצר (PMM)', ['Product Marketing Manager', 'PMM'], 'marketing', /product marketing|\bpmm\b|שיווק מוצר/i),
    R('marketing_mgr', 'מנהל/ת שיווק', ['Marketing Manager', 'Head of Marketing', 'VP Marketing', 'CMO'], 'marketing', /marketing (manager|director|lead)|head of marketing|vp,? marketing|\bcmo\b|מנהל שיווק|מנהלת שיווק|סמנכ"?ל שיווק/i),
    R('brand', 'מנהל/ת מותג', ['Brand Manager', 'Brand Marketing'], 'marketing', /brand (manager|lead|marketing|strategist)|מנהל מותג|מנהלת מותג/i),
    R('digital_marketing', 'מנהל/ת שיווק דיגיטלי', ['Digital Marketing Manager', 'Online Marketing', 'MarTech'], 'marketing', /digital marketing|online marketing|marketing technolog|martech|שיווק דיגיטלי|שיווק באינטרנט/i),
    R('ppc', 'מנהל/ת קמפיינים (PPC / Performance)', ['PPC Manager', 'Performance Marketing', 'Paid Media', 'Media Buyer'], 'marketing', /\bppc\b|\bsem\b|performance marketing|paid (media|social|acquisition|search)|media buy|campaign manager|קמפיינר|מנהל קמפיינים|מנהלת קמפיינים|קניית מדיה/i),
    R('seo', 'מומחה/ית SEO', ['SEO Specialist', 'SEO Manager'], 'marketing', /\bseo\b|קידום אורגני/i),
    R('ua', 'מנהל/ת User Acquisition', ['User Acquisition Manager', 'UA', 'ASO'], 'marketing', /user acquisition|\bua\b (manager|specialist|lead|analyst)|\baso\b|app store optim/i),
    R('growth', 'מנהל/ת Growth', ['Growth Manager', 'Growth Marketing', 'Growth Lead'], 'marketing', /\bgrowth\b|צמיחה/i),
    R('demand_gen', 'מנהל/ת Demand Generation', ['Demand Generation', 'Lead Generation'], 'marketing', /demand gen|lead gen/i),
    R('crm_mkt', 'מנהל/ת CRM ואוטומציה שיווקית', ['CRM Manager', 'Lifecycle Marketing', 'Marketing Automation', 'Marketing Ops'], 'marketing', /crm (manager|marketing|specialist|lead)|lifecycle|marketing automation|retention marketing|email marketing|marketing op(eration)?s|marketo|מנהל crm|מנהלת crm/i),
    R('content', 'מנהל/ת תוכן וכתיבה שיווקית', ['Content Manager', 'Content Writer', 'Content Marketing'], 'marketing', /content (manager|writer|marketing|strategist|lead|specialist)|כותב תוכן|כותבת תוכן|מנהל תוכן|מנהלת תוכן/i),
    R('copywriter', 'קופירייטר/ית', ['Copywriter'], 'marketing', /copywrit|קופירייט/i),
    R('social', 'מנהל/ת סושיאל וקהילה', ['Social Media Manager', 'Community Manager'], 'marketing', /social media|community manager|סושיאל|רשתות חברתיות|מנהל קהילה|מנהלת קהילה/i),
    R('adops', 'מנהל/ת Ad Operations ו־AdTech', ['Ad Operations', 'Programmatic', 'AdTech'], 'marketing', /ad ?op(eration)?s?\b|programmatic|adtech|ad trafficking/i),
    R('ecommerce', 'מנהל/ת אי־קומרס', ['E-commerce Manager', 'Online Store Manager'], 'marketing', /e-?commerce|אי.?קומרס|סחר מקוון|חנות אונליין/i),
    R('affiliate', 'מנהל/ת שותפים ואפיליאייט', ['Affiliate Manager', 'Partner Marketing'], 'marketing', /affiliate|partner marketing|אפיליאייט/i),
    R('mkt_analyst', 'אנליסט/ית שיווק', ['Marketing Analyst', 'Marketing Data Analyst'], 'marketing', /marketing (analyst|analytics|data)|אנליסט שיווק|אנליסטית שיווק/i),

    /* ---------- extra engineering roles ---------- */
    R('fae', 'מהנדס/ת FAE / Application', ['Field Application Engineer', 'Application Engineer'], 'hw', /field application|\bfae\b|application engineer/i),
    R('process_eng', 'מהנדס/ת תהליך ותפוקה (Process / Yield)', ['Process Engineer', 'Yield Engineer', 'Metrology'], 'hw', /process (engineer|integration|development)|\byield\b|lithograph|metrology|\betch\b|מהנדס תהליך/i),
    R('hw_test', 'מהנדס/ת בדיקות חומרה (Post-Silicon / ATE)', ['Post-Silicon Validation', 'ATE Test Engineer', 'Production Test'], 'hw', /post.?silicon|\bate\b|production test|product test engineer|hardware test/i),
    R('quantum', 'מהנדס/ת קוונטים', ['Quantum Engineer', 'Quantum Software'], 'dev', /quantum|קוונט/i),
    R('finops', 'מהנדס/ת FinOps', ['FinOps', 'Cloud Cost'], 'infra', /finops|cloud cost/i),
    R('bioinfo', 'ביואינפורמטיקאי/ת', ['Bioinformatician', 'Computational Biologist'], 'data', /bioinformatic|computational biolog|ביואינפורמטיק/i),
    R('data_gov', 'Data Governance ואיכות נתונים', ['Data Governance', 'Data Quality', 'Data Steward'], 'data', /data (governance|quality|steward)/i),
    R('fraud', 'אנליסט/ית הונאות ו־Trust & Safety', ['Fraud Analyst', 'Risk Analyst', 'Trust & Safety'], 'cyber', /fraud (analyst|research|investigat|data|manager)|risk analyst|trust (and|&) safety|הונאות/i),
    R('devrel', 'Developer Relations', ['Developer Advocate', 'DevRel', 'Evangelist'], 'solutions', /developer (relations|advocate|evangelist)|devrel/i),
    R('csm', 'מנהל/ת Customer Success', ['Customer Success Manager', 'CSM'], 'solutions', /customer success|הצלחת לקוח/i)
  ];

  const ROLE = Object.fromEntries(ROLES.map(r => [r.id, r]));
  const api = { GROUPS, ROLES, ROLE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TJ_ROLES = api;
})(typeof self !== 'undefined' ? self : this);
