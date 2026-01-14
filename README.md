# UNReviewHub - Federated Human-in-the-Loop Review Platform

## Project Overview

UNReviewHub is a secure, auditable, federated Human-in-the-Loop (HITL) management platform designed for UN agencies. The platform routes items (model outputs, flagged cases) to human reviewers, captures decisions and rationales, provides QA/escalation workflows, and exports structured feedback to ML pipelines.

**Sponsor**: UN OICT / Steering Group  
**Target Scale**: 1,000 items/day, 200 concurrent reviewers (pilot)  
**Hosting Model**: UN-managed private cloud / UN-approved public cloud (hybrid)

## 🏗️ Project Structure

```
UNReviewHubSystem/
├── docs/                    # Complete documentation suite
│   ├── prd/                 # Product Requirements Document
│   ├── architecture/         # System architecture & diagrams
│   ├── technical/           # API specs, database, infrastructure
│   ├── compliance/           # DPIA, security, audit requirements
│   └── project/             # Roadmap, team, success metrics
├── api/                     # Backend services (Node.js + TypeScript)
├── web/                     # Frontend applications (React + TypeScript)
├── infra/                   # Infrastructure as code (Terraform + K8s)
├── scripts/                 # Database migrations, seeding, utilities
├── tests/                   # Test suites (unit, integration, e2e)
├── monitoring/              # Monitoring & logging setup
├── compliance/              # Compliance tools and templates
└── tools/                   # Development and deployment tools
```

## 🏗️ Current Status

**Phase**: Phase 2: Foundation Implementation  
**Status**: Core models, Audit Logging, and Next.js scaffolding completed. Initializing API services.

### 📋 Completed Deliverables
- [x] Project Structure & Documentation Framework
- [x] System Architecture & Database Schema Design
- [x] Backend API Scaffolding (Fastify + Prisma)
- [x] Frontend React Scaffolding (Next.js 16 + Tailwind 4)
- [x] MFA Metadata & Audit Logging Foundation

### 🔄 In Progress
- [ ] User Authentication & UN SSO Integration
- [ ] Routing Engine Logic
- [ ] Reviewer Workspace UI Components
- [ ] Security Threat Model

### 🚧 Development Setup
Follow these steps to get the project running locally:

```bash
# 1. Clone and navigate to implementation root
git clone <repository-url>
cd UNReviewHubSystem/UNReviewHubSystem

# 2. Setup Environment
cp .env.example .env

# 3. Setup Backend
cd api
npm install
npm run db:generate

# 4. Start Development Servers (from implementation root)
# In terminal 1 (API)
cd api && npm run dev

# In terminal 2 (WEB)
cd web && npm run dev
```



## 📋 Key Features

- ✅ **UN SSO Integration** (SAML/OIDC) with role-based access control
- ✅ **Per-Agency Data Partitioning** with configurable data residency rules
- ✅ **Immutable Audit Logging** with tamper-evidence for all decisions
- ✅ **Built-in PII Redaction** tools supporting DPIA requirements
- ✅ **Skill-Based Routing** with language matching and load balancing
- ✅ **Reviewer Workspace** with decision controls and history tracking
- ✅ **QA Workflows** with sampling engine and disagreement resolution
- ✅ **Feedback Export** to ML pipelines in JSON/CSV formats
- ✅ **Real-time Dashboards** for SLA monitoring and analytics

## 🔒 Security & Compliance

- **Authentication**: UN SSO integration with MFA for privileged roles
- **Authorization**: Role-based access control (Admin, Reviewer, QA)
- **Data Protection**: AES-256 encryption at rest, TLS 1.2+ in transit
- **Audit Trail**: Immutable logging of all decisions and data changes
- **PII Protection**: Built-in redaction tools with configurable rules
- **Data Residency**: Per-agency partitioning with configurable policies

## 🏗️ Architecture Highlights

```
Frontend Layer     → Reviewer UI, Admin UI, QA Dashboard (React+TS)
API Gateway        → Kong/Nginx with Auth & Rate Limiting
Backend Services   → Node.js services (Auth, Review, Routing, QA, Export)
Data Layer         → PostgreSQL + Redis Cache + Object Storage
Infrastructure     → Monitoring, Logging, Secrets, Backup systems
```

## 📊 Performance Targets

- **API Response**: P95 < 300ms for GET operations
- **UI Load Time**: < 2.5s for reviewer workspace
- **Throughput**: Support 1,000 items/day (pilot)
- **Concurrency**: 200 simultaneous reviewers
- **Availability**: 99.9% uptime SLA

## 🧪 Testing Strategy

- **Unit Tests**: 80%+ coverage for core services
- **Integration Tests**: API endpoints and database operations
- **E2E Tests**: User workflows with Playwright
- **Security Tests**: SAST/DAST scans and penetration testing
- **Accessibility**: WCAG 2.1 AA compliance verification

## 📊 Project Progress

### Documentation Progress
- **Product Requirements Document**: 60% Complete
  - ✅ Executive Summary & Vision
  - ✅ User Personas & Journey Mapping  
  - ✅ Functional & Non-Functional Requirements
  - 🔄 User Stories & Acceptance Criteria (In Progress)
  - ⏳ Success Metrics & KPIs (Pending)

- **Technical Documentation**: 40% Complete
  - ✅ System Architecture Overview
  - ✅ Database Schema Design
  - 🔄 API Specification (OpenAPI 3.0) (In Progress)
  - ⏳ Security Architecture (Pending)
  - ⏳ Infrastructure as Code (Pending)

- **Compliance Documentation**: 20% Complete
  - ⏳ DPIA Template (Pending)
  - ⏳ Security Controls (Pending)
  - ⏳ Data Residency Framework (Pending)

### Next Immediate Steps
1. Implement **UN SSO** OAuth2 callback handler.
2. Develop **Review Dashboard** front-end components.
3. Finalize **Pii Redaction** logic in the Review Service.
4. Set up **Terraform** for pilot cloud deployment.

## 👥 Team & Roles

- **Product Manager**: UN liaison for policy/compliance
- **Tech Lead/Architect**: Platform architecture and design
- **Backend Engineers**: API, database, routing (2)
- **Frontend Engineers**: React UI implementation (2)
- **DevOps Engineer**: IaC, CI/CD, observability (1)
- **Security Engineer**: Threat modeling, security testing (1)
- **QA Engineer**: Testing, accessibility (1)
- **Data/ML Engineer**: Export pipelines, integration (1)
- **UX/Designer**: Reviewer workflows (1)

## 📚 Documentation

| Document | Description | Location |
|----------|-------------|----------|
| PRD | Complete Product Requirements Document | `/docs/prd/` |
| Architecture | System design & component interactions | `/docs/architecture/` |
| API Spec | OpenAPI 3.0 specification | `/docs/technical/api/` |
| Database | Schema design & migrations | `/docs/technical/database/` |
| Security | Threat model & security controls | `/docs/compliance/security/` |
| DPIA | Data Protection Impact Assessment | `/docs/compliance/dpia/` |
| Roadmap | Implementation timeline & milestones | `/docs/project/roadmap/` |

## 🔧 Development Commands

```bash
# Install dependencies
npm run install:all

# Start development servers
npm run dev

# Run tests
npm run test
npm run test:e2e

# Build for production
npm run build

# Database operations
npm run db:migrate
npm run db:seed

# Infrastructure
npm run infra:plan
npm run infra:deploy
```

## 🚨 Getting Help

- 📖 **Documentation**: See `/docs` directory
- 🔧 **Technical Issues**: Create GitHub issue
- 📧 **UN Process Questions**: Contact project sponsor
- 🚨 **Security Concerns**: Contact security team immediately

## 📜 License & Copyright

© United Nations 2025. All rights reserved.

---

**Last Updated**: 2025-01-14  
**Version**: 1.0.0  
**Environment**: Development# un-review-hub
