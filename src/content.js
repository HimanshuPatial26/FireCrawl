// All site copy lives here.
//
// Each entry in `projects` is one case study. `group` decides where it is listed:
//   'work'     -> Past work (#work)
//   'projects' -> Projects (#projects)
//
// Fields
//   slug      URL name (letters, digits, hyphens), used as #slug
//   title     large display title
//   company   shown in the eyebrow and the details list
//   role, period, area
//   summary   one or two sentences for the index and the page header
//   metrics   key results as [value, label] pairs; the first one is also shown on the index
//   body      paragraphs for the case study page
//   visuals   labels for the three illustrations on the page
//   style     generative artwork: 0 dunes, 1 orbits, 2 liquid, 3 grid, 4 aurora, 5 crystal
//   seed      any number; changes the composition of the artwork
//   colors    bg / a (accent) / b (secondary); tints the whole 3D scene for this entry
//   cover     optional real media: { type: 'image' | 'video', src: './media/x.jpg' }
//   media     optional per-illustration media (same shape as cover)

export const site = {
  name: 'Himanshu Patial',
  role: 'Product Manager',
  focus: 'Payments, Growth & AI',
  location: 'Dubai, UAE',
  timezone: 'Asia/Dubai',
  availability: 'Open to APM, PM and AI PM roles in the UAE',
  email: 'hppatial@gmail.com',
  linkedin: 'https://www.linkedin.com/in/himanshu-patial-8164b6149/',
  resume: './himanshu-patial-resume.pdf',
  intro: 'Product manager for payments, growth and AI. I take features from 0 to 1 and through to adoption.',
  about: [
    'Associate Product Manager with 3 years at Classplus, taking B2B (Classplus) and D2C (Testbook) features from 0 to 1 through adoption across payments, conversion and AI, working with business, engineering and design teams.',
    'Now completing a Master of Global Business in Dubai, and looking for APM, PM and AI PM roles in the UAE.',
  ],
  experience: [
    { role: 'Associate Product Manager', org: 'Classplus', period: 'Aug 2022 – Aug 2025' },
    { role: 'Deputy Lead, Customer Delight', org: 'Classplus', period: 'Apr 2020 – Jul 2022' },
  ],
  education: [
    {
      role: 'Master of Global Business, Global Marketing Management',
      org: 'SP Jain School of Global Management · Singapore, London, Dubai',
      period: 'Oct 2025 – Feb 2027',
    },
    { role: 'Bachelor of Business Administration (BBA)', org: 'GGSIPU', period: 'Aug 2016 – Sep 2019' },
  ],
  skills: [
    { label: 'Product', items: ['Roadmapping', 'A/B testing', 'Stakeholder management', 'Jira', 'Notion', 'Trello', 'Figma'] },
    {
      label: 'Data & technical',
      items: ['SQL', 'Redash', 'Tableau', 'Power BI', 'Excel', 'Python', 'JavaScript', 'Postman', 'Apps Script'],
    },
    { label: 'AI', items: ['LLM products', 'RAG', 'Vector DB', 'Conversational AI', 'Bolt'] },
    { label: 'Methods', items: ['Scrum', 'Kanban', 'Root cause analysis'] },
  ],
};

const APM = { company: 'Classplus', role: 'Associate Product Manager', period: 'Aug 2022 – Aug 2025', year: '2022–25' };

export const projects = [
  /* ------------------------------ Past work ------------------------------ */
  {
    group: 'work',
    slug: 'payments-autopay',
    title: 'Payments & Autopay',
    ...APM,
    area: 'Payments',
    style: 3,
    seed: 0.21,
    colors: { bg: '#04070d', a: '#6fa8ff', b: '#1c2f66' },
    summary:
      'Owned the payments vertical at 40,000+ daily transactions. Rebuilt the payment journey with WhatsApp recovery flows and launched Autopay.',
    metrics: [
      ['40,000+', 'daily transactions'],
      ['+10–15%', 'successful payments'],
      ['30%', 'of monthly recurring revenue via Autopay'],
    ],
    body: [
      'I owned the payments vertical at Classplus, which handled more than 40,000 transactions a day at an 85% success rate.',
      'I rebuilt the in-app payment journey and added WhatsApp recovery flows, which lifted successful payments by 10–15%. I also launched Autopay, which grew to 30% of monthly recurring revenue.',
    ],
    visuals: ['Payment journey', 'WhatsApp recovery', 'Autopay'],
  },
  {
    group: 'work',
    slug: 'ctwa-purchase-flow',
    title: 'CTWA Purchase Flow',
    ...APM,
    area: 'Growth',
    style: 2,
    seed: 0.47,
    colors: { bg: '#030a08', a: '#4fe0a0', b: '#0f4a3a' },
    summary: 'A WhatsApp chatbot purchase flow that cut purchase steps and raised bottom-funnel conversion 14%.',
    metrics: [
      ['+14%', 'bottom-funnel conversion'],
      ['3x', 'ROI reached by clients'],
    ],
    body: [
      'I built a purchase flow inside a WhatsApp chatbot that cut the number of steps needed to buy.',
      'It raised bottom-funnel conversion by 14% and helped clients reach 3x return on investment.',
    ],
    visuals: ['Chat purchase flow', 'Fewer steps to buy', 'Client ROI'],
  },
  {
    group: 'work',
    slug: 'ai-convert',
    title: 'AI-Convert',
    ...APM,
    area: 'AI · Growth',
    style: 1,
    seed: 0.63,
    colors: { bg: '#0a0705', a: '#ffb45c', b: '#6a3a12' },
    summary: 'An activity-triggered conversion engine for B2B clients, generating ₹4M (~US $50K) a month.',
    metrics: [['₹4M', 'a month (~US $50K)']],
    body: [
      'I launched AI-Convert, a conversion engine for Classplus B2B clients that is triggered by user activity.',
      'The engine generates ₹4M (about US $50K) a month.',
    ],
    visuals: ['Activity triggers', 'Conversion engine', 'Monthly revenue'],
  },
  {
    group: 'work',
    slug: 'ai-tutor',
    title: 'AI Tutor',
    ...APM,
    area: 'AI',
    style: 5,
    seed: 0.58,
    colors: { bg: '#08060d', a: '#c39bff', b: '#3b2370' },
    summary: 'Led development of Doubt Mate, an AI tutor chatbot that grounds its answers in course material.',
    metrics: [['RAG', 'answers grounded in course material']],
    body: [
      'I led development of Doubt Mate, an AI tutor chatbot for students.',
      'I defined the requirements and user flows, and a retrieval-augmented generation (RAG) approach that grounded answers in course material to improve accuracy.',
    ],
    visuals: ['Doubt Mate', 'Retrieval from course material', 'Grounded answers'],
  },
  {
    group: 'work',
    slug: 'ai-call-analysis',
    title: 'AI Call Analysis',
    ...APM,
    area: 'AI',
    style: 4,
    seed: 0.29,
    colors: { bg: '#030a0d', a: '#5fe3ff', b: '#124a5c' },
    summary: 'Automated the quality team’s manual call reviews and gave leadership insight into lead quality.',
    metrics: [['+8–10%', 'team productivity']],
    body: [
      'I built a call-analysis tool that automated the quality team’s manual call reviews.',
      'It gave leadership insight into lead quality so sales effort could be redirected, and lifted team productivity by 8–10%.',
    ],
    visuals: ['Call reviews', 'Lead-quality insight', 'Sales focus'],
  },
  {
    group: 'work',
    slug: 'crm-lead-management',
    title: 'CRM & Lead Management',
    ...APM,
    area: 'Sales tools',
    style: 3,
    seed: 0.84,
    colors: { bg: '#070707', a: '#ffd65a', b: '#4b3c12' },
    summary: 'Co-built an internal and client-facing CRM with an auto-dialer and lead scoring.',
    metrics: [
      ['+30%', 'agent productivity'],
      ['+8%', 'sales team productivity'],
    ],
    body: [
      'I co-built a CRM used both internally and by clients, with a built-in auto-dialer.',
      'It raised agent productivity by 30% and sales team productivity by 8%. I also added lead scoring that matched each lead to a product.',
    ],
    visuals: ['CRM', 'Auto-dialer', 'Lead scoring'],
  },
  {
    group: 'work',
    slug: 'super-coaching-onboarding',
    title: 'Super Coaching Onboarding',
    ...APM,
    area: 'Growth',
    style: 2,
    seed: 0.93,
    colors: { bg: '#0d0606', a: '#ff7a6b', b: '#5c1c1a' },
    summary: 'An in-app onboarding overlay for a high-value segment that lifted conversion 7%.',
    metrics: [['+7%', 'conversion']],
    body: ['I shipped an in-app onboarding overlay for a high-value segment, which lifted conversion by 7%.'],
    visuals: ['Onboarding overlay', 'High-value segment', 'Conversion'],
  },
  {
    group: 'work',
    slug: 'customer-delight',
    title: 'Customer Delight',
    company: 'Classplus',
    role: 'Deputy Lead, Customer Delight',
    period: 'Apr 2020 – Jul 2022',
    year: '2020–22',
    area: 'Support operations',
    style: 4,
    seed: 0.71,
    colors: { bg: '#0c050a', a: '#ff86c5', b: '#5d1b45' },
    summary: 'Led a 16-agent support team, holding CSAT at 89–90% against an industry benchmark of 78–85%.',
    metrics: [
      ['89–90%', 'CSAT, against a 78–85% benchmark'],
      ['90%', 'of tickets resolved within 6 hours'],
      ['+40%', 'agent productivity'],
    ],
    body: [
      'As Deputy Lead of Customer Delight, I led a 16-agent support team and held CSAT at 89–90%, against an industry benchmark of 78–85%.',
      'We resolved 90% of tickets within 6 hours without CSAT slipping, and I reworked the support workflows, raising agent productivity by 40%.',
    ],
    visuals: ['Support team', 'Resolution speed', 'Workflows'],
  },

  /* ------------------------------ Projects ------------------------------- */
  {
    group: 'projects',
    slug: 'fintech-adoption',
    title: 'FinTech Adoption',
    company: 'SP Jain School of Global Management',
    role: 'Master’s research project',
    period: 'Jan – Apr 2026',
    year: '2026',
    area: 'Research · Go-to-market',
    style: 1,
    seed: 0.36,
    colors: { bg: '#04070c', a: '#bfe3ff', b: '#2a4f7a' },
    summary: 'FinTech app adoption in India and Dubai: a 71-person survey modelled with PLS-SEM, turned into go-to-market recommendations.',
    metrics: [
      ['71', 'survey respondents'],
      ['96%', 'of adoption-intention variance explained'],
    ],
    body: [
      'A Master’s research project comparing FinTech app adoption in India and Dubai. I surveyed 71 respondents and modelled the results in SmartPLS 4 using PLS-SEM.',
      'The model explained 96% of the variance in adoption intention, and I turned the main drivers into go-to-market recommendations.',
    ],
    visuals: ['India vs Dubai', 'PLS-SEM model', 'Go-to-market drivers'],
  },
  {
    group: 'projects',
    slug: 'rebel-foods-behrouz',
    title: 'Behrouz Biryani',
    company: 'Rebel Foods, Dubai',
    role: 'Master’s strategy project',
    period: 'Jun – Sep 2026',
    year: '2026',
    area: 'Strategy · Positioning',
    style: 0,
    seed: 0.13,
    colors: { bg: '#0d0806', a: '#ffb347', b: '#7a3a12' },
    summary: 'Benchmarked Behrouz Biryani against UAE delivery rivals and recommended changes to positioning, pricing and channel mix.',
    metrics: [['3', 'frameworks: PESTLE, CAGE, Five Forces']],
    body: [
      'A Master’s project benchmarking Behrouz Biryani, a Rebel Foods brand, against delivery rivals in the UAE.',
      'I used PESTLE, CAGE and Porter’s Five Forces, and recommended changes to the brand’s positioning, pricing and channel mix.',
    ],
    visuals: ['UAE delivery market', 'Competitive benchmark', 'Positioning and pricing'],
  },
];
