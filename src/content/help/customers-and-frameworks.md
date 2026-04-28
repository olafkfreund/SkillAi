---
title: "Customers, hiring frameworks, and customer portal links"
category: "Agencies & Customers"
audience: ["recruiter", "admin"]
order: 20
lastUpdated: "2026-04-28"
tags: ["customers", "frameworks", "portal", "pdf-export"]
---

# Customers, hiring frameworks, and customer portal links

Customers in SkillAI are the companies you're placing into — the demand side. Each role belongs to a customer, and each customer carries its own structured context: a hiring framework, a portal URL, contact details, and notes. This article explains how the pieces fit.

## Creating a customer

Open Customers from the sidebar. Each customer record holds:

- **Name** and **website**.
- **Primary contact** — name, email, phone.
- **Portal base URL** — the root URL of the customer's vendor management or hiring portal (e.g. `https://acme-portal.example.com`).
- **Notes** — anything: payment terms, framework documents, the account manager's preferences.

Customers can be archived but not deleted — they hold an audit trail of every role you've placed for them.

## Per-customer hiring frameworks

A **hiring framework** describes how a customer grades roles internally — the seniority ladder, the skill matrices, the level expectations. SkillAI stores per-customer framework levels so the AI scoring engine can target the customer's own definitions rather than generic seniority.

For each customer you can define framework levels — e.g. "Associate", "Consultant", "Senior Consultant", "Principal" — each with their own description, expected experience range, and core competencies. When you create a role for that customer you select the framework level it targets, and the AI uses that context when scoring.

> A consultancy customer that calls a five-year engineer "Senior" produces different rankings than one that calls them "Mid-level." The framework field is what makes the AI sensitive to that.

## Linking a role to a customer

When you create a role, the customer picker is on the role form. Pick the customer; the framework level dropdown appears with that customer's levels. From then on, every score against that role uses the customer's framework as part of the AI prompt.

You can change the customer or framework level on an existing role — but be aware that changing it doesn't automatically rescore candidates. Use the per-candidate rescore button if you want updated scores against the new framework.

## Customer portal links

Many customers want you to log candidates in their own portal. Rather than typing the same URL stem for every candidate, SkillAI assembles the link for you:

1. The customer's **portal base URL** — set once on the customer record.
2. The role's **customer portal path** — set per role on the role form.

The role detail page renders these as a single one-click **Open in customer portal** pill. Click it and you're in the customer's system on the right page.

## Customer-facing PDFs

Customers usually want a candidate brief that doesn't reveal what you pay your contractor or what your margin is. SkillAI generates **two variants** of every candidate PDF:

- **Internal** — full detail, including day rates, margin, recruiter notes.
- **Customer-facing (sanitised)** — same scoring and AI reasoning, but day rates, margin, and internal notes are stripped.

On the candidate page the export button has both options. Use the customer-facing one when you're sending to the client.

## What customers don't see in this app

Customers are an **entity in your data model** — they don't have logins to SkillAI. They don't approve candidates here. If they want to track a candidate, you send them the sanitised PDF or the customer portal link. The hiring manager approval flow inside SkillAI is for **your** internal manager, not the customer.

## Tips

- Set the **portal base URL** even if you don't have per-role paths yet — you can always copy it from the customer page later.
- Define **framework levels** before you create the first role — retrofitting is fine, but starting with the framework gives sharper rankings on day one.
- The customer's notes field is the right home for "things to remember for this account" — payment cycle, preferred contract terms, blacklisted agencies.

Related: [Recruitment agencies and the internal bench](/dashboard/help/agencies-and-internal-bench), [Roles: creating and editing](/dashboard/help/roles-creating-and-editing).
