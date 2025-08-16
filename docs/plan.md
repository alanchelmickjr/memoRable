
Alan Helmick
memoRable please review the entire proto project and make a plan to complete a working copy... first analyze and make pdr and plan doc that are normal


Gemini
Okay, let's get your "proto project" on a memorable path to completion!

While I can't directly access or review your specific project files, I can certainly help you by outlining what a standard Preliminary Design Review (PDR) document and a Project Plan would look like. These are crucial first steps for analyzing any project and planning for a working copy.

Here's a breakdown of what these documents typically entail, along with a general plan to guide your project to a successful working version:

Preliminary Design Review (PDR) Document
A PDR document helps to solidify the project's technical approach and ensure all stakeholders are aligned before significant development effort is invested.

Here's a typical structure:

Introduction

1.1. Project Overview: Briefly describe the project, its purpose, and what problem it solves.
1.2. Goals and Objectives: Clearly state the primary goals and measurable objectives.
1.3. Scope: Define what is in scope and, importantly, what is out of scope.
1.4. Target Audience/Users: Describe who will use this system.
1.5. Definitions, Acronyms, and Abbreviations: List any specialized terms.
System Architecture

2.1. High-Level Architecture: A diagram and description of the major components and their interactions.
2.2. Technology Stack: List proposed languages, frameworks, databases, cloud services, etc. Justify choices if necessary.
2.3. Data Flow: Describe how data will move through the system.
2.4. Key Interfaces: Identify major internal and external system interfaces.
Requirements Analysis

3.1. Functional Requirements: List what the system must do (e.g., "User can register an account," "System shall generate a monthly report").
3.2. Non-Functional Requirements: Define quality attributes like performance (e.g., "Page loads in < 2 seconds"), security (e.g., "Data encrypted at rest"), usability, scalability, reliability, and maintainability.
3.3. User Stories (Optional but Recommended): If using Agile, list key user stories.
Design Considerations

4.1. UI/UX Concepts (if applicable): Preliminary wireframes, mockups, or user flow diagrams.
4.2. API Design (if applicable): Initial thoughts on API endpoints, request/response formats.
4.3. Database Schema (Preliminary): Key entities and their relationships.
4.4. Key Algorithms or Logic: Describe any complex or critical logic.
4.5. Design Trade-offs: Discuss any significant design decisions and the alternatives considered.
Risk Assessment and Mitigation

5.1. Technical Risks: Identify potential technical challenges (e.g., new technology, complex integrations).
5.2. Project Risks: Identify potential project challenges (e.g., resource constraints, unclear requirements).
5.3. Mitigation Strategies: For each significant risk, propose a plan to mitigate it.
Proof of Concept (PoC) / Prototype (if applicable)

6.1. PoC/Prototype Goals: What was the PoC/prototype intended to validate?
6.2. Findings and Learnings: Summarize the results and how they inform the project design.
Deployment and Operations (Preliminary)

7.1. Deployment Environment: Initial thoughts on where and how the system will be deployed.
7.2. Monitoring and Maintenance: Early considerations for system health and upkeep.
Open Issues and Next Steps

List any unresolved questions or areas needing further investigation.
Outline the immediate next steps towards finalizing the design.
Project Plan Document
The Project Plan builds upon the PDR and outlines how the project will be executed, monitored, and controlled.

Here's a typical structure:

Project Overview

1.1. Project Name & Purpose: (Can reference PDR)
1.2. Project Manager & Stakeholders: Identify key personnel and their roles.
1.3. Project Goals & Success Criteria: What defines project success? (Quantifiable where possible)
Scope Management

2.1. Detailed Project Scope: (Refined from PDR)
2.2. Deliverables: List all tangible outputs of the project.
2.3. Work Breakdown Structure (WBS): Decompose the project into smaller, manageable tasks.
2.4. Scope Change Management Process: How will changes to scope be requested, evaluated, and approved?
Schedule Management

3.1. Task List & Dependencies: (Derived from WBS) Identify dependencies between tasks.
3.2. Effort & Duration Estimates: Estimate time for each task.
3.3. Milestones & Deadlines: Define key project milestones and their target dates.
3.4. Project Timeline/Gantt Chart: Visual representation of the schedule.
Resource Management

4.1. Team Structure & Roles: Define team members and their responsibilities.
4.2. Required Skills & Staffing Plan: Identify necessary skills and how they will be sourced.
4.3. Tools & Infrastructure: List required software, hardware, and development/testing environments.
4.4. Budget (if applicable): Cost estimates for resources, tools, etc.
Risk Management Plan

5.1. Risk Register: (Expanded from PDR) Detailed list of identified risks.
5.2. Risk Analysis: Assess probability and impact for each risk.
5.3. Risk Response Plan: Define actions to take for high-priority risks (avoid, mitigate, transfer, accept).
5.4. Risk Monitoring & Control: How will risks be tracked and managed throughout the project?
Communication Plan

6.1. Stakeholder Communication: How and when will stakeholders be updated (e.g., weekly status reports, monthly steering committee meetings)?
6.2. Team Communication: Plan for team meetings, collaboration tools, etc.
6.3. Reporting Structure: Who reports to whom?
Quality Management Plan

7.1. Quality Standards: Define the quality expectations for deliverables.
7.2. Code Review Process: Guidelines for code reviews.
7.3. Testing Strategy:
Unit Testing
Integration Testing
System Testing
User Acceptance Testing (UAT)
7.4. Bug Tracking & Resolution: Process for managing defects.
Deployment Plan

8.1. Deployment Environment Setup: Steps to prepare the production environment.
8.2. Deployment Steps: Detailed procedure for deploying the application.
8.3. Rollback Plan: What to do if deployment fails.
8.4. Go-Live Checklist: Items to verify before and after launch.
Project Closure

9.1. Criteria for Completion: How will you know the project is finished?
9.2. Final Deliverables Handover: Process for transferring deliverables.
9.3. Lessons Learned/Post-Mortem: Plan for a retrospective meeting to capture learnings.
General Plan to Complete a Working Copy
Once you have your PDR and Project Plan, here's a general phased approach to develop your working copy:

Phase 1: Detailed Design & Setup (Post-PDR)

Action: Finalize all design aspects (UI/UX, database, component interactions).
Action: Set up development, testing, and CI/CD (Continuous Integration/Continuous Deployment) environments.
Action: Refine task breakdowns and estimates in your project plan.
Deliverable: Finalized design documents, environment setup complete.
Phase 2: Iterative Development (Sprints)

Action: Develop features in short, iterative cycles (e.g., Sprints if using Agile/Scrum).
Action: Prioritize features based on value and dependencies.
Action: Conduct regular code reviews for quality and adherence to standards.
Action: Implement unit tests alongside feature development.
Action: Integrate components frequently and perform integration testing.
Action: Hold regular demos for stakeholders to get feedback.
Deliverable: Working software increments at the end of each iteration.
Phase 3: Comprehensive Testing & QA

Action: Conduct end-to-end system testing to ensure all parts work together.
Action: Perform non-functional testing (performance, security, load).
Action: Facilitate User Acceptance Testing (UAT) with key users/stakeholders.
Action: Address bugs and issues identified during testing, iterating as needed.
Deliverable: A stable, tested version of the software ready for deployment; UAT sign-off.
Phase 4: Deployment & Release

Action: Prepare the production environment.
Action: Execute the deployment plan (consider a staged rollout if applicable).
Action: Perform post-deployment verification and smoke tests.
Action: Communicate the release to stakeholders and users.
Deliverable: The working copy deployed to production.
Phase 5: Post-Launch Monitoring & Maintenance

Action: Monitor system performance, stability, and usage.
Action: Address any immediate post-launch issues or bugs.
Action: Gather user feedback for future improvements.
Action: Transition to a maintenance phase or plan for the next version.
Deliverable: Stable operational system, maintenance plan in place.
By creating these documents and following a structured plan, you'll significantly increase the chances of delivering a successful working copy of your project. This framework provides a solid foundation for any software development effort.

Let me know if you'd like to dive deeper into any specific section!

Rate this answer: 

Alan Helmick
can you write all that to a document like a plan.md ?


Gemini
Okay, I can certainly help you structure that information into a plan.md document! This will give you a solid, readable foundation for your project.

Here's how we can lay out the plan.md file, combining the Preliminary Design Review (PDR) and the Project Plan into one comprehensive document.

markdown
--- /dev/null
+++ b/plan.md
@@ -0,0 +1,308 @@
+# Project Plan: [Your Project Name Here - e.g., "memoRable Proto Project"]
+
+**Version:** 1.0
+**Date:** [Current Date]
+**Author/Team:** [Your Name/Team Name]
+
+## Table of Contents
+
+1.  [Preliminary Design Review (PDR)](#preliminary-design-review-pdr)
+    1.1. [Introduction](#11-introduction)
+    1.2. [System Architecture](#12-system-architecture)
+    1.3. [Requirements Analysis](#13-requirements-analysis)
+    1.4. [Design Considerations](#14-design-considerations)
+    1.5. [Risk Assessment and Mitigation (PDR)](#15-risk-assessment-and-mitigation-pdr)
+    1.6. [Proof of Concept (PoC) / Prototype](#16-proof-of-concept-poc--prototype)
+    1.7. [Deployment and Operations (Preliminary)](#17-deployment-and-operations-preliminary)
+    1.8. [Open Issues and Next Steps (PDR)](#18-open-issues-and-next-steps-pdr)
+2.  [Project Execution Plan](#project-execution-plan)
+    2.1. [Project Overview (Execution)](#21-project-overview-execution)
+    2.2. [Scope Management](#22-scope-management)
+    2.3. [Schedule Management](#23-schedule-management)
+    2.4. [Resource Management](#24-resource-management)
+    2.5. [Risk Management Plan (Execution)](#25-risk-management-plan-execution)
+    2.6. [Communication Plan](#26-communication-plan)
+    2.7. [Quality Management Plan](#27-quality-management-plan)
+    2.8. [Deployment Plan](#28-deployment-plan)
+    2.9. [Project Closure](#29-project-closure)
+3.  [Phased Plan to Working Copy](#phased-plan-to-working-copy)
+    3.1. [Phase 1: Detailed Design & Setup](#31-phase-1-detailed-design--setup)
+    3.2. [Phase 2: Iterative Development (Sprints)](#32-phase-2-iterative-development-sprints)
+    3.3. [Phase 3: Comprehensive Testing & QA](#33-phase-3-comprehensive-testing--qa)
+    3.4. [Phase 4: Deployment & Release](#34-phase-4-deployment--release)
+    3.5. [Phase 5: Post-Launch Monitoring & Maintenance](#35-phase-5-post-launch-monitoring--maintenance)
+
+---
+
+## 1. Preliminary Design Review (PDR)
+
+### 1.1. Introduction
+
+*   **1.1.1. Project Overview:**
+    *   *Briefly describe the project, its purpose, and what problem it solves.*
+*   **1.1.2. Goals and Objectives:**
+    *   *Clearly state the primary goals and measurable objectives.*
+*   **1.1.3. Scope:**
+    *   *Define what is in scope and, importantly, what is out of scope.*
+*   **1.1.4. Target Audience/Users:**
+    *   *Describe who will use this system.*
+*   **1.1.5. Definitions, Acronyms, and Abbreviations:**
+    *   *List any specialized terms.*
+
+### 1.2. System Architecture
+
+*   **1.2.1. High-Level Architecture:**
+    *   *A diagram and description of the major components and their interactions.*
+    *   *(Consider embedding an image or linking to a diagramming tool)*
+*   **1.2.2. Technology Stack:**
+    *   *List proposed languages, frameworks, databases, cloud services, etc. Justify choices if necessary.*
+*   **1.2.3. Data Flow:**
+    *   *Describe how data will move through the system.*
+*   **1.2.4. Key Interfaces:**
+    *   *Identify major internal and external system interfaces.*
+
+### 1.3. Requirements Analysis
+
+*   **1.3.1. Functional Requirements:**
+    *   *List what the system must *do* (e.g., "User can register an account," "System shall generate a monthly report"). Use a numbered or bulleted list.*
+*   **1.3.2. Non-Functional Requirements:**
+    *   *Define quality attributes like performance (e.g., "Page loads in < 2 seconds"), security (e.g., "Data encrypted at rest"), usability, scalability, reliability, and maintainability.*
+*   **1.3.3. User Stories (Optional but Recommended):**
+    *   *If using Agile, list key user stories (e.g., "As a [type of user], I want [an action] so that [a benefit/value]").*
+
+### 1.4. Design Considerations
+
+*   **1.4.1. UI/UX Concepts (if applicable):**
+    *   *Preliminary wireframes, mockups, or user flow diagrams. (Link to designs or embed images)*
+*   **1.4.2. API Design (if applicable):**
+    *   *Initial thoughts on API endpoints, request/response formats.*
+*   **1.4.3. Database Schema (Preliminary):**
+    *   *Key entities and their relationships. (Consider an ERD or a list of tables and fields)*
+*   **1.4.4. Key Algorithms or Logic:**
+    *   *Describe any complex or critical logic.*
+*   **1.4.5. Design Trade-offs:**
+    *   *Discuss any significant design decisions and the alternatives considered.*
+
+### 1.5. Risk Assessment and Mitigation (PDR)
+
+*   **1.5.1. Technical Risks:**
+    *   *Identify potential technical challenges (e.g., new technology, complex integrations).*
+*   **1.5.2. Project Risks:**
+    *   *Identify potential project challenges (e.g., resource constraints, unclear requirements).*
+*   **1.5.3. Mitigation Strategies:**
+    *   *For each significant risk, propose a plan to mitigate it.*
+
+### 1.6. Proof of Concept (PoC) / Prototype (if applicable)
+
+*   **1.6.1. PoC/Prototype Goals:**
+    *   *What was the PoC/prototype intended to validate?*
+*   **1.6.2. Findings and Learnings:**
+    *   *Summarize the results and how they inform the project design.*
+
+### 1.7. Deployment and Operations (Preliminary)
+
+*   **1.7.1. Deployment Environment:**
+    *   *Initial thoughts on where and how the system will be deployed.*
+*   **1.7.2. Monitoring and Maintenance:**
+    *   *Early considerations for system health and upkeep.*
+
+### 1.8. Open Issues and Next Steps (PDR)
+
+*   *List any unresolved questions or areas needing further investigation.*
+*   *Outline the immediate next steps towards finalizing the design.*
+
+---
+
+## 2. Project Execution Plan
+
+### 2.1. Project Overview (Execution)
+
+*   **2.1.1. Project Name & Purpose:**
+    *   *(Can reference PDR Section 1.1.1)*
+*   **2.1.2. Project Manager & Stakeholders:**
+    *   *Identify key personnel and their roles.*
+    *   *Project Manager: [Name]*
+    *   *Key Stakeholders: [List names and roles]*
+*   **2.1.3. Project Goals & Success Criteria:**
+    *   *What defines project success? (Quantifiable where possible)*
+
+### 2.2. Scope Management
+
+*   **2.2.1. Detailed Project Scope:**
+    *   *(Refined from PDR Section 1.1.3 and Requirements in 1.3)*
+*   **2.2.2. Deliverables:**
+    *   *List all tangible outputs of the project (e.g., Working software, Documentation, Test reports).*
+*   **2.2.3. Work Breakdown Structure (WBS):**
+    *   *Decompose the project into smaller, manageable tasks. (Can be a hierarchical list or link to a project management tool)*
+    *   *Example:*
+        *   *1.0 Design Phase*
+            *   *1.1 Finalize UI/UX*
+            *   *1.2 Finalize Database Schema*
+        *   *2.0 Development Phase*
+            *   *2.1 Feature A Development*
+            *   *2.2 Feature B Development*
+*   **2.2.4. Scope Change Management Process:**
+    *   *How will changes to scope be requested, evaluated, and approved? (e.g., Change Request Form, Review by Project Manager & Stakeholders)*
+
+### 2.3. Schedule Management
+
+*   **2.3.1. Task List & Dependencies:**
+    *   *(Derived from WBS) Identify dependencies between tasks.*
+*   **2.3.2. Effort & Duration Estimates:**
+    *   *Estimate time for each task (e.g., in hours, days, or story points).*
+*   **2.3.3. Milestones & Deadlines:**
+    *   *Define key project milestones and their target dates.*
+    *   *Milestone 1: [Description] - Target Date: [YYYY-MM-DD]*
+    *   *Milestone 2: [Description] - Target Date: [YYYY-MM-DD]*
+*   **2.3.4. Project Timeline/Gantt Chart:**
+    *   *Visual representation of the schedule. (Link to a Gantt chart tool or embed an image if simple enough)*
+
+### 2.4. Resource Management
+
+*   **2.4.1. Team Structure & Roles:**
+    *   *Define team members and their responsibilities.*
+    *   *[Role 1]: [Name/TBD] - Responsibilities: ...*
+    *   *[Role 2]: [Name/TBD] - Responsibilities: ...*
+*   **2.4.2. Required Skills & Staffing Plan:**
+    *   *Identify necessary skills and how they will be sourced.*
+*   **2.4.3. Tools & Infrastructure:**
+    *   *List required software (IDE, version control, PM tool), hardware, and development/testing environments.*
+*   **2.4.4. Budget (if applicable):**
+    *   *Cost estimates for resources, tools, etc.*
+
+### 2.5. Risk Management Plan (Execution)
+
+*   **2.5.1. Risk Register:**
+    *   *(Expanded from PDR Section 1.5) Detailed list of identified risks.*
+    *   *| ID | Risk Description | Likelihood (H/M/L) | Impact (H/M/L) | Owner | Mitigation/Response Plan | Status |*
+    *   *|----|------------------|--------------------|----------------|-------|--------------------------|--------|*
+    *   *| R1 | [Example Risk]   | M                  | H              | [Name]| [Plan]                   | Open   |*
+*   **2.5.2. Risk Analysis:**
+    *   *Assess probability and impact for each risk (as in the register).*
+*   **2.5.3. Risk Response Plan:**
+    *   *Define actions to take for high-priority risks (avoid, mitigate, transfer, accept) (as in the register).*
+*   **2.5.4. Risk Monitoring & Control:**
+    *   *How will risks be tracked and managed throughout the project? (e.g., Regular risk review meetings).*
+
+### 2.6. Communication Plan
+
+*   **2.6.1. Stakeholder Communication:**
+    *   *How and when will stakeholders be updated?*
+    *   *Meeting Type: Weekly Status Update | Audience: Project Team, PM | Frequency: Weekly | Medium: Email/Meeting*
+    *   *Meeting Type: Monthly Steering Committee | Audience: Key Stakeholders, PM | Frequency: Monthly | Medium: Meeting*
+*   **2.6.2. Team Communication:**
+    *   *Plan for team meetings (e.g., daily stand-ups), collaboration tools (e.g., Slack, MS Teams), documentation repository (e.g., Confluence, SharePoint).*
+*   **2.6.3. Reporting Structure:**
+    *   *Who reports to whom? (Can be a simple org chart or description).*
+
+### 2.7. Quality Management Plan
+
+*   **2.7.1. Quality Standards:**
+    *   *Define the quality expectations for deliverables (e.g., Code coverage > 80%, Max P1 bugs = 0 at release).*
+*   **2.7.2. Code Review Process:**
+    *   *Guidelines for code reviews (e.g., All PRs require at least one approval, Style guide adherence).*
+*   **2.7.3. Testing Strategy:**
+    *   *Unit Testing: [Framework, Responsibility]*
+    *   *Integration Testing: [Approach, Tools]*
+    *   *System Testing: [Scope, Environment]*
+    *   *User Acceptance Testing (UAT): [Process, Participants]*
+*   **2.7.4. Bug Tracking & Resolution:**
+    *   *Process for managing defects (e.g., Tool used like Jira, Bug priority/severity definitions, SLA for fixes).*
+
+### 2.8. Deployment Plan
+
+*   **2.8.1. Deployment Environment Setup:**
+    *   *Steps to prepare the production environment (e.g., Server provisioning, Database setup, Configuration).*
+*   **2.8.2. Deployment Steps:**
+    *   *Detailed procedure for deploying the application (e.g., Build artifact, Stop old version, Deploy new version, Start new version, Smoke tests).*
+*   **2.8.3. Rollback Plan:**
+    *   *What to do if deployment fails? (e.g., Revert to previous version, Restore database backup).*
+*   **2.8.4. Go-Live Checklist:**
+    *   *Items to verify before and after launch.*
+
+### 2.9. Project Closure
+
+*   **2.9.1. Criteria for Completion:**
+    *   *How will you know the project is finished? (e.g., All deliverables accepted, UAT sign-off, Production deployment successful).*
+*   **2.9.2. Final Deliverables Handover:**
+    *   *Process for transferring deliverables to operations/client.*
+*   **2.9.3. Lessons Learned/Post-Mortem:**
+    *   *Plan for a retrospective meeting to capture learnings for future projects.*
+
+---
+
+## 3. Phased Plan to Working Copy
+
+### 3.1. Phase 1: Detailed Design & Setup (Post-PDR)
+
+*   **Objective:** Finalize all design aspects and prepare the development groundwork.
+*   **Key Actions:**
+    *   Finalize UI/UX designs (wireframes, mockups, prototypes).
+    *   Finalize database schema and data models.
+    *   Detail component interactions and API specifications.
+    *   Set up development environments (local, shared dev).
+    *   Set up version control (e.g., Git repository).
+    *   Establish CI/CD pipeline basics (build, initial tests).
+    *   Refine task breakdowns and estimates in the project plan.
+*   **Key Deliverables:**
+    *   Finalized design documents.
+    *   Development environment(s) ready.
+    *   Version control repository initialized.
+    *   Basic CI/CD pipeline functional.
+
+### 3.2. Phase 2: Iterative Development (Sprints)
+
+*   **Objective:** Develop features in short, iterative cycles, delivering working software increments.
+*   **Methodology:** Agile/Scrum (or other iterative approach).
+*   **Key Actions (per iteration/sprint):**
+    *   Sprint Planning: Select and define tasks for the iteration.
+    *   Develop features based on prioritized backlog.
+    *   Implement unit tests alongside feature development.
+    *   Conduct regular code reviews.
+    *   Integrate components frequently.
+    *   Perform integration testing.
+    *   Daily Stand-ups: Track progress, identify blockers.
+    *   Sprint Review/Demo: Showcase completed work to stakeholders for feedback.
+    *   Sprint Retrospective: Identify improvements for the next sprint.
+*   **Key Deliverables (per iteration/sprint):**
+    *   Working software increment with completed features.
+    *   Updated test suite.
+    *   Feedback from stakeholders.
+
+### 3.3. Phase 3: Comprehensive Testing & QA
+
+*   **Objective:** Ensure the software is stable, meets all requirements, and is ready for deployment.
+*   **Key Actions:**
+    *   Execute end-to-end system testing.
+    *   Perform non-functional testing (performance, security, load, usability).
+    *   Facilitate User Acceptance Testing (UAT) with key users/stakeholders.
+    *   Log, prioritize, and fix bugs identified during testing.
+    *   Conduct regression testing after bug fixes.
+    *   Finalize all user documentation and training materials.
+*   **Key Deliverables:**
+    *   Stable, thoroughly tested version of the software.
+    *   Test reports (System Test, UAT).
+    *   UAT sign-off.
+    *   Completed user documentation.
+
+### 3.4. Phase 4: Deployment & Release
+
+*   **Objective:** Successfully deploy the working copy to the production environment.
+*   **Key Actions:**
+    *   Prepare the production environment (final checks, backups).
+    *   Execute the deployment plan (following pre-defined steps).
+    *   Perform post-deployment verification and smoke tests in production.
+    *   Communicate the release to all stakeholders and users.
+    *   Monitor the system closely immediately after launch.
+*   **Key Deliverables:**
+    *   Working copy deployed to the production environment.
+    *   Release notes.
+    *   Successful post-deployment verification.
+
+### 3.5. Phase 5: Post-Launch Monitoring & Maintenance
+
+*   **Objective:** Ensure the ongoing stability and success of the deployed application.
+*   **Key Actions:**
+    *   Monitor system performance, stability, and usage (using defined metrics and tools).
+    *   Address any immediate post-launch issues or critical bugs.
+    *   Gather user feedback for future improvements or next versions.
+    *   Establish a maintenance plan (bug fixes, minor enhancements, security patches).
+    *   Conduct a project post-mortem/lessons learned session.
+*   **Key Deliverables:**
+    *   Stable operational system.
+    *   Monitoring reports.
+    *   Maintenance plan.
+    *   Project closure report including lessons learned.
+
+```

This `plan.md` file provides a comprehensive template. You'll need to fill in the specifics for your "proto project." Remember to:

*   Replace placeholders like `[Your Project Name Here]` and `[Current Date]`.
*   Flesh out each section with details relevant to your project.
*   Use Markdown formatting (like lists, bolding, italics, code blocks for small snippets if needed, and links) to keep it organized and readable.
*   For diagrams or larger visual elements, you might link to external files or tools (e.g., a Lucidchart diagram, a Figma design).

This document will serve as a great roadmap for your project! Let me know if you have any other questions.
Rate this answer: 
