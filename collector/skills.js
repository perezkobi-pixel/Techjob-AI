// Skill / technology dictionary. Matched against title + description to give each job a skills list,
// which the app compares with the user's profile skills.
const SKILLS = [
  ['Python', /\bpython\b/i], ['Java', /\bjava\b(?!script)/i], ['JavaScript', /javascript|\bjs\b/i], ['TypeScript', /typescript/i],
  ['Node.js', /node\.?\s?js/i], ['React', /\breact\b(?! native)/i], ['React Native', /react native/i], ['Angular', /angular/i], ['Vue', /\bvue/i],
  ['C#', /c#|\.net\b/i], ['C++', /c\+\+/i], ['C', /\bc\b(?![#+])(?=[\s,/)]).{0,40}(linux|embedded|kernel|low.level)/i], ['Go', /\bgolang\b|\bgo\b(?=[\s,/]+(microservices|developer|engineer))/i],
  ['Rust', /\brust\b/i], ['Scala', /\bscala\b/i], ['Kotlin', /kotlin/i], ['Swift', /\bswift\b/i], ['PHP', /\bphp\b/i], ['Ruby', /\bruby\b/i],
  ['SQL', /\bsql\b|postgres|mysql/i], ['PostgreSQL', /postgres/i], ['MongoDB', /mongo/i], ['Redis', /\bredis\b/i], ['Elasticsearch', /elastic|opensearch/i],
  ['Kafka', /kafka/i], ['Spark', /\bspark\b/i], ['Airflow', /airflow/i], ['Snowflake', /snowflake/i], ['BigQuery', /bigquery/i], ['Databricks', /databricks/i],
  ['AWS', /\baws\b|amazon web services/i], ['Azure', /\bazure\b/i], ['GCP', /\bgcp\b|google cloud/i], ['Kubernetes', /kubernetes|\bk8s\b/i], ['Docker', /docker/i],
  ['Terraform', /terraform/i], ['CI/CD', /ci\/cd|jenkins|github actions|gitlab ci/i], ['Linux', /linux/i], ['Networking', /tcp\/ip|networking|routing/i],
  ['Microservices', /microservice/i], ['GraphQL', /graphql/i], ['REST API', /\brest\b|restful/i],
  ['Machine Learning', /machine learning|\bml\b/i], ['Deep Learning', /deep learning|neural network/i], ['PyTorch', /pytorch/i], ['TensorFlow', /tensorflow/i],
  ['LLM', /\bllms?\b|large language model|genai|generative ai/i], ['NLP', /\bnlp\b/i], ['Computer Vision', /computer vision/i], ['MLOps', /mlops/i],
  ['Statistics', /statistic/i], ['Pandas', /pandas/i], ['Tableau', /tableau/i], ['Power BI', /power ?bi/i], ['Looker', /looker/i], ['Excel', /\bexcel\b/i],
  ['Security', /security|cyber/i], ['SIEM', /\bsiem\b|splunk|sentinel/i], ['Reverse Engineering', /reverse engineer/i], ['Penetration Testing', /penetration|pentest/i],
  ['Selenium', /selenium/i], ['Playwright', /playwright/i], ['Cypress', /cypress/i], ['Automation', /automation/i],
  ['Figma', /figma/i], ['UX', /\bux\b|user experience/i], ['Product Management', /product management|roadmap/i], ['Agile', /agile|scrum/i], ['Jira', /\bjira\b/i],
  ['Salesforce', /salesforce/i], ['SAP', /\bsap\b/i], ['Unity', /\bunity\b/i], ['Unreal', /unreal/i], ['3D', /\b3d\b/i],
  ['Embedded', /embedded|firmware/i], ['FPGA', /fpga/i], ['Verilog', /verilog|systemverilog|vhdl/i], ['RTOS', /rtos/i],
  ['Team Management', /people management|managing (a )?team|lead(ing)? a team|team management|ניהול צוות/i],
  ['Hebrew', /hebrew|עברית/i], ['English', /english|אנגלית/i]
];

function extractSkills(text) {
  const out = [];
  for (const [name, re] of SKILLS) if (re.test(text)) out.push(name);
  return out;
}
module.exports = { SKILLS, extractSkills };
