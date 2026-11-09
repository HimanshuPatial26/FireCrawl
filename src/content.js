// All site copy lives here.
//
// Each entry in `projects` is one case study. `group` decides where it is listed:
//   'work'     -> Work (#work): the three flagship case studies
//   'projects' -> Projects (#projects): Master's projects
//
// Case study fields
//   slug       URL name (letters, digits, hyphens), used as #slug
//   pillar     short label above the title (Payments, Growth, AI, ...)
//   title      large display title
//   company, role, period, year, area
//   summary    one-line outcome for the index and the page header
//   metrics    key results as [value, label]; the first one also shows on the index
//   chapters   what was shipped: { title, text, metrics } - each chapter gets an illustration
//   problem, insight, decisions, learnings
//              optional story sections; they appear on the page only when filled in
//   style      generative artwork: 0 dunes, 1 orbits, 2 liquid, 3 grid, 4 aurora, 5 crystal
//   seed       any number; changes the composition of the artwork
//   colors     bg / a (accent) / b (secondary); tints the whole 3D scene for this entry
//   cover      optional real media for the wall and hero: { type: 'image' | 'video', src }
//   media      optional real media per chapter illustration (same shape as cover)

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
  proof: [
    { value: '30%', label: 'of monthly recurring revenue from Autopay', slug: 'payments-autopay', pillar: 'Payments', code: 'PAY.01' },
    { value: '+14%', label: 'bottom-funnel conversion from a WhatsApp purchase flow', slug: 'growth-conversion', pillar: 'Growth', code: 'GRW.02' },
    { value: '₹4M', label: 'a month from AI-Convert, an AI conversion engine', slug: 'ai-products', pillar: 'AI', code: 'AI.03' },
  ],
  // Home, poster-style labels: the results heading and the words laid over the helix
  homeIndex: 'Selected results // Classplus_2022–25',
  homeOverlay: 'Payments growth AI adoption',
  homeFoot: '3 years at Classplus · Master of Global Business, SP Jain School of Global Management',

  aboutLede:
    'Three years at Classplus taking B2B and D2C features from 0 to 1 and through to adoption, across payments, conversion and AI.',
  about: [
    'Associate Product Manager with 3 years at Classplus, taking B2B (Classplus) and D2C (Testbook) features from 0 to 1 through adoption across payments, conversion and AI, working with business, engineering and design teams.',
    'Now completing a Master of Global Business in Dubai, and looking for APM, PM and AI PM roles in the UAE.',
  ],
  howIWork: [
    'Take features from 0 to 1 and through to adoption.',
    'Work closely with business, engineering and design teams.',
    'Deliver with Scrum and Kanban, test with A/B experiments and trace issues with root cause analysis.',
    'Work hands-on with data in SQL, Redash, Tableau and Power BI.',
  ],
  experience: [
    {
      role: 'Associate Product Manager',
      org: 'Classplus',
      period: 'Aug 2022 – Aug 2025',
      points: [
        { text: 'Payments: owned the vertical at 40,000+ daily transactions; Autopay grew to 30% of MRR.', slug: 'payments-autopay' },
        { text: 'Growth: WhatsApp purchase flow (+14% conversion), onboarding overlay (+7%), CRM (+30% agent productivity).', slug: 'growth-conversion' },
        { text: 'AI: AI-Convert (₹4M a month), AI Tutor with RAG, AI Call Analysis (+8–10% productivity).', slug: 'ai-products' },
      ],
    },
    {
      role: 'Deputy Lead, Customer Delight',
      org: 'Classplus',
      period: 'Apr 2020 – Jul 2022',
      points: [
        { text: 'Led a 16-agent support team, holding CSAT at 89–90% against an industry benchmark of 78–85%.' },
        { text: 'Resolved 90% of tickets within 6 hours without CSAT slipping.' },
        { text: 'Reworked support workflows, raising agent productivity 40%.' },
      ],
    },
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
  /* --------------------------------- Work --------------------------------- */
  {
    group: 'work',
    slug: 'payments-autopay',
    pillar: 'Payments',
    title: 'Payments & Autopay',
    ...APM,
    area: 'Payments',
    style: 3,
    seed: 0.21,
    colors: { bg: '#04070d', a: '#6fa8ff', b: '#1c2f66' },
    summary:
      'Owned payments at 40,000+ daily transactions, rebuilt the payment journey and launched Autopay, which grew to 30% of monthly recurring revenue.',
    metrics: [
      ['40,000+', 'daily transactions'],
      ['+10–15%', 'successful payments'],
      ['30%', 'of monthly recurring revenue via Autopay'],
    ],
    chapters: [
      {
        title: 'The payments vertical',
        text: 'I owned the payments vertical at Classplus, handling more than 40,000 transactions a day at an 85% success rate.',
        metrics: [
          ['40,000+', 'transactions a day'],
          ['85%', 'success rate'],
        ],
      },
      {
        title: 'Payment journey and WhatsApp recovery',
        text: 'I rebuilt the in-app payment journey and added WhatsApp recovery flows, which lifted successful payments by 10–15%.',
        metrics: [['+10–15%', 'successful payments']],
      },
      {
        title: 'Autopay',
        text: 'I launched Autopay, which grew to 30% of monthly recurring revenue.',
        metrics: [['30%', 'of monthly recurring revenue']],
      },
    ],
    problem: '',
    insight: '',
    decisions: '',
    learnings: '',
  },
  {
    group: 'work',
    slug: 'growth-conversion',
    pillar: 'Growth',
    title: 'Growth & Conversion',
    ...APM,
    area: 'Growth · Conversion · Sales',
    style: 2,
    seed: 0.47,
    colors: { bg: '#030a08', a: '#4fe0a0', b: '#0f4a3a' },
    summary:
      'Shortened the path to purchase with a WhatsApp purchase flow and an onboarding overlay, and gave sales teams a CRM with lead scoring.',
    metrics: [
      ['+14%', 'bottom-funnel conversion'],
      ['3x', 'ROI reached by clients'],
      ['+7%', 'conversion from onboarding'],
      ['+30%', 'agent productivity'],
    ],
    chapters: [
      {
        title: 'CTWA purchase flow',
        text: 'I built a WhatsApp chatbot purchase flow that cut the steps needed to buy. It raised bottom-funnel conversion by 14% and helped clients reach 3x ROI.',
        metrics: [
          ['+14%', 'bottom-funnel conversion'],
          ['3x', 'client ROI'],
        ],
      },
      {
        title: 'Super Coaching onboarding',
        text: 'I shipped an in-app onboarding overlay for a high-value segment, which lifted conversion by 7%.',
        metrics: [['+7%', 'conversion']],
      },
      {
        title: 'CRM and lead management',
        text: 'I co-built an internal and client-facing CRM with an auto-dialer, raising agent productivity by 30% and sales team productivity by 8%. I added lead scoring that matched each lead to a product.',
        metrics: [
          ['+30%', 'agent productivity'],
          ['+8%', 'sales team productivity'],
        ],
      },
    ],
    problem: '',
    insight: '',
    decisions: '',
    learnings: '',
  },
  {
    group: 'work',
    slug: 'ai-products',
    pillar: 'AI',
    title: 'AI Products',
    ...APM,
    area: 'AI · LLM · RAG',
    style: 1,
    seed: 0.63,
    colors: { bg: '#08060d', a: '#c39bff', b: '#3b2370' },
    summary:
      'Three AI products: a conversion engine generating ₹4M a month, an AI tutor grounded in course material, and automated call analysis for sales quality.',
    metrics: [
      ['₹4M', 'a month from AI-Convert (~US $50K)'],
      ['RAG', 'AI tutor grounded in course material'],
      ['+8–10%', 'team productivity from call analysis'],
    ],
    chapters: [
      {
        title: 'AI-Convert',
        text: 'I launched an activity-triggered conversion engine for B2B clients that generates ₹4M (about US $50K) a month.',
        metrics: [['₹4M', 'a month (~US $50K)']],
      },
      {
        title: 'AI Tutor (Doubt Mate)',
        text: 'I led development of an AI tutor chatbot: the requirements, the user flows and a retrieval-augmented generation (RAG) approach that grounded answers in course material to improve accuracy.',
        metrics: [],
      },
      {
        title: 'AI Call Analysis',
        text: 'I built a call-analysis tool that automated the quality team’s manual call reviews and gave leadership insight into lead quality to redirect sales effort, lifting team productivity by 8–10%.',
        metrics: [['+8–10%', 'team productivity']],
      },
    ],
    problem: '',
    insight: '',
    decisions: '',
    learnings: '',
  },

  /* ------------------------------- Projects ------------------------------- */
  {
    group: 'projects',
    slug: 'fintech-adoption',
    pillar: 'Research',
    title: 'FinTech Adoption',
    company: 'SP Jain School of Global Management',
    role: 'Master’s research project',
    period: 'Jan – Apr 2026',
    year: '2026',
    area: 'Research · Go-to-market',
    style: 5,
    seed: 0.36,
    colors: { bg: '#04070c', a: '#bfe3ff', b: '#2a4f7a' },
    summary:
      'What drives FinTech app adoption in India and Dubai: a 71-person survey modelled with PLS-SEM and turned into go-to-market recommendations.',
    metrics: [
      ['71', 'survey respondents'],
      ['96%', 'of adoption-intention variance explained'],
    ],
    chapters: [
      {
        title: 'Survey',
        text: 'I surveyed 71 respondents on FinTech app adoption in India and Dubai.',
        metrics: [['71', 'respondents']],
      },
      {
        title: 'Model',
        text: 'I modelled the results in SmartPLS 4 using PLS-SEM. The model explained 96% of the variance in adoption intention.',
        metrics: [['96%', 'variance explained']],
      },
      {
        title: 'Go-to-market',
        text: 'I turned the main adoption drivers into go-to-market recommendations.',
        metrics: [],
      },
    ],
  },
  {
    group: 'projects',
    slug: 'rebel-foods-behrouz',
    pillar: 'Strategy',
    title: 'Behrouz Biryani',
    company: 'Rebel Foods, Dubai',
    role: 'Master’s strategy project',
    period: 'Jun – Sep 2026',
    year: '2026',
    area: 'Strategy · Positioning',
    style: 0,
    seed: 0.13,
    colors: { bg: '#0d0806', a: '#ffb347', b: '#7a3a12' },
    summary:
      'Benchmarked Behrouz Biryani against UAE delivery rivals and recommended changes to positioning, pricing and channel mix.',
    metrics: [],
    chapters: [
      {
        title: 'Market benchmark',
        text: 'I benchmarked Behrouz Biryani, a Rebel Foods brand, against delivery rivals in the UAE.',
        metrics: [],
      },
      {
        title: 'Frameworks',
        text: 'I analysed the market with PESTLE, CAGE and Porter’s Five Forces.',
        metrics: [],
      },
      {
        title: 'Recommendations',
        text: 'I recommended changes to the brand’s positioning, pricing and channel mix.',
        metrics: [],
      },
    ],
  },
];
