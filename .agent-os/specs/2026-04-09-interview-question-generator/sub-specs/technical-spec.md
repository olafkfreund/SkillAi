# Technical Specification

This is the technical specification for the spec detailed in @.agent-os/specs/2026-04-09-interview-question-generator/spec.md

> Created: 2026-04-09
> Version: 1.0.0

## Two-Stage Claude Pipeline

### Stage 1 — CV Structured Extraction

Before generating questions, extract structured fields from the raw CV text. This produces a rich context object that enables personalisation.

**Prompt:**
```
Extract structured data from this CV. Return only fields that are explicitly stated — do not infer.

<cv>{{cvText}}</cv>

Return JSON matching this schema exactly.
```

**Output schema (`CvProfile`):**
```typescript
const CvProfileSchema = z.object({
  name: z.string().optional(),
  experience_years: z.number().optional(),
  experience_level: z.enum(['junior', 'mid', 'senior', 'lead']).optional(),
  companies: z.array(z.object({
    name: z.string(),
    role: z.string(),
    duration_months: z.number().optional(),
    key_achievements: z.array(z.string()).max(3),
  })).max(5),
  technical_skills: z.array(z.string()).max(20),
  notable_projects: z.array(z.object({
    name: z.string(),
    tech_stack: z.array(z.string()),
    outcome: z.string().optional(),
  })).max(5),
  personalizable_moments: z.array(z.string()).max(8),
  // Moments where CV + role overlap — e.g. "Led FastAPI migration at CompanyX"
})
```

### Stage 2 — Question Generation

Uses the extracted `CvProfile` + role description + competency framework to generate personalised questions.

**System prompt (role-cached with `cache_control: ephemeral`):**
```
You are an expert technical interviewer. Generate interview questions that:
- Reference specific projects, companies, and technologies from the candidate's CV
- Probe decision-making, not just knowledge recall
- Are answerable in 5-10 minutes in a live interview
- Follow STAR format for behavioral questions
- Avoid yes/no questions, industry platitudes, and algorithm memorization puzzles

Core competencies for this role: {{competencies}}
Job requirements: {{roleDescription}}
```

**User prompt (generated fresh per candidate):**
```
Candidate profile:
<profile>{{cvProfile}}</profile>

Generate {{questionCount}} interview questions with this distribution:
- behavioral: 40% (reference specific CV projects/achievements)
- technical: 35% (probe stack knowledge and design decisions)
- situational: 15% (role-specific scenarios)
- cultural: 10% (fit and working style)

{{#if includeCodeChallenge}}
Also generate one coding challenge calibrated to a {{experienceLevel}} developer.
{{/if}}

Return JSON matching the InterviewPack schema exactly.
```

### Output Schema (`InterviewPack`)

```typescript
const InterviewQuestionSchema = z.object({
  question_text: z.string(),
  question_type: z.enum(['behavioral', 'technical', 'situational', 'cultural']),
  difficulty: z.enum(['junior', 'mid', 'senior']),
  competency: z.string(),
  personalization_level: z.enum(['high', 'medium', 'low']),
  estimated_duration_minutes: z.number().int().min(2).max(15),
  cv_references: z.array(z.string()).max(3),
  expected_answer_signals: z.object({
    strong: z.string().max(300),
    acceptable: z.string().max(300),
    weak: z.string().max(300),
  }),
  follow_ups: z.array(z.object({
    trigger: z.string().max(150),
    question: z.string(),
  })).max(2),
})

const CodeChallengeSchema = z.object({
  title: z.string(),
  difficulty: z.enum(['junior', 'mid', 'senior']),
  estimated_minutes: z.number().int(),
  problem_description: z.string(),
  starter_code: z.string(),
  unit_tests: z.string(),
  language: z.string(),
  evaluation_criteria: z.array(z.string()).max(5),
})

const InterviewPackSchema = z.object({
  questions: z.array(InterviewQuestionSchema).min(6).max(14),
  code_challenge: CodeChallengeSchema.optional(),
  pack_summary: z.string().max(400),
  recommended_duration_minutes: z.number().int(),
})
```

### Caching Strategy

Per Anthropic's `cache_control` API:
- **Cache** (role description + competency framework): Added as a separate `user` turn with `cache_control: { type: 'ephemeral' }` — shared across all candidates scored for the same role
- **Fresh** (candidate CV profile): Always sent as a fresh final turn per candidate
- **Benefit**: ~60-70% token cost reduction for bulk generation in a single hiring round

```typescript
const messages: MessageParam[] = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: buildRoleContext(role),
        cache_control: { type: 'ephemeral' }, // cached per role
      },
    ],
  },
  {
    role: 'user',
    content: buildCandidatePrompt(cvProfile, options),  // fresh per candidate
  },
]
```

### Competency Framework

Five competencies extracted from role type (inferred from role title keywords):

| Role Type | Competencies |
|---|---|
| Engineering | Problem Solving, Technical Depth, Code Quality, System Thinking, Collaboration |
| Product | Strategic Thinking, User Empathy, Prioritisation, Data-Driven Decisions, Stakeholder Management |
| Design | Visual Communication, User Research, Iteration, Accessibility, Tool Proficiency |
| Data/ML | Statistical Rigour, Data Intuition, Model Understanding, Communication, Tooling |
| Default | Problem Solving, Communication, Collaboration, Adaptability, Domain Expertise |

### Experience Level Inference

Inferred from `CvProfile.experience_years`:
- `< 3 years` → junior
- `3-7 years` → mid
- `> 7 years` → senior / lead

Fallback: scan for senior/lead/principal titles in `companies[].role`.

### Code Challenge Language Selection

Language inferred from `CvProfile.technical_skills`:
- JavaScript/TypeScript in top skills → TypeScript
- Python in top skills → Python
- Go → Go
- Java/Kotlin → Java
- Fallback → TypeScript

### File Structure (additions to existing project)

```
src/
├── lib/ai/
│   ├── interview.ts          # generateInterviewPack() — two-stage pipeline
│   └── schemas.ts            # + InterviewPackSchema, CvProfileSchema
├── actions/
│   └── interview.ts          # createInterviewPack(), deleteInterviewPack()
├── app/(dashboard)/
│   └── candidates/[id]/
│       └── interview/
│           └── [packId]/
│               └── page.tsx  # Interview pack view page
└── components/interview/
    ├── pack-generator.tsx    # "Generate Pack" button + options modal
    ├── question-card.tsx     # Single question with expandable rubric
    ├── code-challenge.tsx    # Code challenge display with syntax highlighting
    └── pack-list.tsx         # List of existing packs for a candidate
```

## External Dependencies (New)

| Package | Purpose | Justification |
|---|---|---|
| `shiki` | Syntax highlighting for code challenges | Best-in-class, used by shadcn/ui docs |

No other new dependencies — the feature uses the existing Claude SDK, Zod, Drizzle, and shadcn/ui.
