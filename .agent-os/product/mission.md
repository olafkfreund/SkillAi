# Product Mission

> Last Updated: 2026-04-09
> Version: 1.0.0

## Pitch

SkillAI is an internal AI-powered recruiting portal that helps recruiters and hiring managers quickly rank and navigate candidates against specific job roles by using Claude and Gemini to score CVs across skills, experience, and role-fit dimensions. It replaces manual CV sifting with fast, explainable AI scoring while maintaining a growing historical candidate archive.

## Users

### Primary Customers

- **Internal Recruiters:** Responsible for sourcing, reviewing, and shortlisting candidates across multiple open roles
- **Hiring Managers:** Consuming ranked shortlists and making final hire decisions

### User Personas

**Senior Recruiter** (30-45 years old)
- **Role:** Talent Acquisition Specialist
- **Context:** Managing 5-15 open roles simultaneously, receiving 50-200 CVs per role from multiple agencies
- **Pain Points:** Drowning in unstructured CVs, inconsistent scoring across reviewers, no historical candidate memory, hard to match past candidates to new roles
- **Goals:** Shortlist top 5-10 candidates per role within hours, reuse historical candidates for new roles, track agency performance

**Hiring Manager** (35-55 years old)
- **Role:** Engineering Manager / Department Head
- **Context:** Receives candidate shortlists from recruiter and needs to make fast decisions
- **Pain Points:** Seeing inconsistent candidate summaries, no standard scoring to compare against, no context on why a candidate was shortlisted
- **Goals:** Understand at a glance why each candidate scored highly, compare candidates side-by-side, add personal notes and decisions

## The Problem

### CV Volume Overwhelm

Recruiters receive dozens to hundreds of CVs per role from multiple recruitment agencies. Manually reviewing each one is slow, inconsistent, and leaves good candidates buried. This costs companies days of recruiter time per role.

**Our Solution:** AI automatically parses and scores every CV against a role description, surfacing the best-fit candidates in seconds with explainable dimension scores.

### No Candidate Memory

When a candidate is not selected for one role, their profile is lost. When a similar role opens months later, the recruiter starts from scratch. Industry data suggests 20-40% of past candidates are relevant to future roles.

**Our Solution:** Every scored candidate is archived with their AI-generated profile summary and dimension scores, searchable and re-rankable against any future role.

### Inconsistent Evaluation Standards

Different recruiters and hiring managers apply different standards, making it impossible to compare candidates fairly across time or across team members.

**Our Solution:** Standardised AI scoring rubrics per role dimension ensure every candidate is evaluated against the same criteria, with per-dimension breakdowns and reasoning.

### Agency Tracking Gap

Companies use multiple recruitment agencies but rarely track which agencies deliver the best candidates at what cost over time.

**Our Solution:** Recruitment companies are first-class entities in the system — candidates are linked to their originating agency, and notes/history are maintained per agency.

## Differentiators

### Fast, Not a Platform

Unlike full ATS systems (Greenhouse, Workday, Lever), SkillAI does one thing: rank candidates fast. No complex pipelines, no integrations, no bloat. You get a result in seconds, not after configuring 15 settings.

### Reusable Candidate Archive

Unlike ad-hoc spreadsheet tracking, every candidate is stored with AI-generated skills profiles and full scoring history, making past candidates immediately reusable against future roles without manual re-review.

### Explainable AI Scores

Unlike black-box ranking tools, SkillAI shows per-dimension scores (technical skills, experience level, role-fit, communication indicators) with brief AI reasoning, so recruiters understand and trust the ranking.

## Key Features

### Core Features

- **CV Upload + AI Parsing:** Upload PDFs/Word docs; AI extracts and structures skills, experience, and profile data
- **Role-Based Ranking:** Upload or create a job role description; AI scores all candidates against it with per-dimension breakdowns
- **Candidate Archive:** All candidates stored historically with profile summaries and scoring history, searchable across past and current roles
- **Role Description Library:** Store internal job descriptions as reusable templates for repeated use across hiring rounds
- **AI Model Flexibility:** Use Claude (claude-sonnet-4-6) or Gemini (gemini-2.0-flash) for scoring; switch per-role or compare outputs

### Organisation Features

- **Multi-Tenant Access:** Multiple users/teams with isolated data per tenant; role-based access (admin, recruiter, viewer)
- **Recruitment Agency Management:** Maintain a list of agencies with notes, performance history, and candidate linkage
- **Candidate Notes:** Add structured notes, interview feedback, and decisions to any candidate at any point in time
- **Candidate-to-Role History:** See every role a candidate has been scored against and their result for each
- **Side-by-Side Comparison:** Select 2-5 candidates and compare their dimension scores, summaries, and notes on one screen
