# UNReviewHub - System Architecture Overview

## Executive Summary

UNReviewHub implements a microservices architecture with a clear separation of concerns, enabling scalability, maintainability, and security while meeting UN agency requirements for data sovereignty and compliance.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          UNReviewHub System                          │
├─────────────────────────────────────────────────────────────────────┤
│  CDN & Load Balancer Layer (CloudFront/ALB)                        │
├─────────────────────────────────────────────────────────────────────┤
│  Frontend Applications                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │   Reviewer UI   │  │   Admin UI      │  │   QA Dashboard  │      │
│  │  (React+TS)     │  │  (React+TS)     │  │  (React+TS)     │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
├─────────────────────────────────────────────────────────────────────┤
│  API Gateway Layer                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  Kong API Gateway + Rate Limiting + Auth + WAF                ││
│  └─────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────┤
│  Backend Services Layer (Microservices)                             │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │   Auth      │ │   Review    │ │   Routing   │ │   QA &      │   │
│  │   Service   │ │   Service   │ │   Engine    │ │  Export     │   │
│  │ (Node.js)   │ │ (Node.js)   │ │ (Node.js)   │ │ (Node.js)   │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │  Notification│ │  Reporting  │ │  File Store │ │   Audit     │   │
│  │   Service   │ │   Service   │ │   Service   │ │   Service   │   │
│  │ (Node.js)   │ │ (Node.js)   │ │ (Node.js)   │ │ (Node.js)   │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│  Message Queue Layer                                                │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │  RabbitMQ / Apache Kafka (Event Streaming)                     ││
│  └─────────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────────┤
│  Data Layer                                                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐      │
│  │  PostgreSQL     │ │     Redis       │ │  Object Store  │      │
│  │  (Primary DB)   │ │   (Cache)       │ │ (MinIO/S3)     │      │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘      │
├─────────────────────────────────────────────────────────────────────┤
│  Infrastructure & Monitoring Layer                                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ Prometheus  │ │ Grafana     │ │ ELK Stack   │ │ HashiCorp   │   │
│  │ (Metrics)   │ │ (Dashboard) │ │ (Logging)   │ │ (Vault)     │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Architecture Principles

### 1. Microservices Architecture
- **Service Isolation**: Each business capability is a separate service
- **Loose Coupling**: Services communicate via well-defined APIs
- **Independent Scaling**: Services can scale based on demand
- **Technology Diversity**: Different services can use optimal technologies

### 2. API-First Design
- **OpenAPI 3.0**: All services documented with OpenAPI specifications
- **Versioning**: Backward-compatible API versioning strategy
- **Rate Limiting**: Built-in rate limiting and throttling
- **Security**: API gateway handles authentication and authorization

### 3. Data Sovereignty
- **Partitioning**: Database partitioned by organization/country
- **Residency Rules**: Configurable data residency policies
- **Access Control**: Role-based access with organizational boundaries
- **Audit Trail**: Complete audit trail for all data access

### 4. Security by Design
- **Zero Trust**: No implicit trust between services
- **Encryption**: Data encrypted at rest and in transit
- **Least Privilege**: Minimum necessary access permissions
- **Defense in Depth**: Multiple layers of security controls

## Service Architecture

### Authentication Service
```typescript
// Responsibilities:
- UN SSO integration (SAML/OIDC)
- JWT token generation and validation
- Role-based access control
- Session management
- Multi-factor authentication

// Technologies:
- Node.js + TypeScript
- Passport.js (authentication)
- JWT (tokens)
- Redis (session storage)
```

### Review Service
```typescript
// Responsibilities:
- Review item CRUD operations
- Decision capture and validation
- PII redaction processing
- File attachment handling
- Search and filtering

// Technologies:
- Node.js + TypeScript
- PostgreSQL (data storage)
- Elasticsearch (search)
- MinIO/S3 (file storage)
```

### Routing Engine
```typescript
// Responsibilities:
- Skill-based assignment algorithms
- Language matching
- Load balancing
- SLA deadline enforcement
- Queue management

// Technologies:
- Node.js + TypeScript
- Redis (queue management)
- PostgreSQL (routing rules)
- Custom algorithm library
```

### QA & Export Service
```typescript
// Responsibilities:
- Sampling engine
- Reviewer scoring
- Disagreement resolution
- Data export pipelines
- ML feedback integration

// Technologies:
- Node.js + TypeScript
- PostgreSQL (analytics)
- Apache Kafka (event streaming)
- Custom ML integration
```

## Data Architecture

### Database Design (PostgreSQL)

#### Partitioning Strategy
```sql
-- Partition by organization for data residency
CREATE TABLE review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    content JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- Other fields...
) PARTITION BY HASH (organization_id);

-- Create partitions for each organization
CREATE TABLE review_items_org_1 PARTITION OF review_items
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);
```

#### Audit Trail Design
```sql
-- Immutable audit log with cryptographic verification
CREATE TABLE audit_entries (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    record_id UUID NOT NULL,
    operation audit_operation NOT NULL,
    old_values JSONB,
    new_values JSONB,
    user_id UUID,
    hash_value VARCHAR(64), -- SHA-256 for integrity
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger for automatic audit logging
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit_entries (
        table_name, record_id, operation, 
        old_values, new_values, user_id, hash_value
    ) VALUES (
        TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP,
        to_jsonb(OLD), to_jsonb(NEW), current_setting('app.current_user_id'),
        encode(sha256(to_jsonb(NEW)::text), 'hex')
    );
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
```

#### Indexing Strategy
```sql
-- Performance indexes
CREATE INDEX idx_review_items_status_priority ON review_items(status, priority DESC);
CREATE INDEX idx_decisions_reviewer_latest ON decisions(reviewer_id, is_latest) WHERE is_latest = true;
CREATE INDEX idx_audit_entries_time_org ON audit_entries(created_at DESC, organization_id);
CREATE INDEX idx_user_profiles_active_skills ON user_profiles(is_active) WHERE is_active = true;

-- Full-text search index
CREATE INDEX idx_review_items_content_fts ON review_items USING gin(to_tsvector('english', content::text));
```

### Caching Strategy (Redis)

#### Cache Tiers
```typescript
// L1: Application cache (memory)
const appCache = {
  userProfiles: new Map(), // Current user sessions
  routingRules: new Map(),  // Frequently accessed routing rules
  skillMappings: new Map()   // Skill-to-reviewer mappings
};

// L2: Distributed cache (Redis)
const redisCache = {
  userSessions: `session:${userId}`, // 8 hour TTL
  reviewQueue: `queue:${orgId}`,    // 5 minute TTL
  auditLogs: `audit:${date}`,        // 24 hour TTL
  exportJobs: `export:${jobId}`      // 7 day TTL
};

// L3: Database cache (PostgreSQL query cache)
// Automatic result caching for frequent queries
```

## Security Architecture

### Authentication Flow
```
1. User Access → UN SSO (SAML/OIDC)
2. SSO Response → API Gateway
3. Token Validation → Auth Service
4. Role Extraction → RBAC Engine
5. Session Creation → Redis Storage
6. Access Token → Client Application
7. API Requests → Gateway (Token Validation)
8. Authorization → Service Level
```

### Data Encryption
```typescript
// Encryption at Rest
const encryptionConfig = {
  database: 'AES-256-GCM',  // PostgreSQL transparent encryption
  files: 'AES-256-CBC',      // Object storage encryption
  backups: 'AES-256-XTS',    // Backup encryption
  logs: 'AES-256-CTR'        // Log encryption
};

// Encryption in Transit
const transportConfig = {
  api: 'TLS-1.3',           // API communications
  database: 'TLS-1.3',      // Database connections
  messageQueue: 'TLS-1.3',   // Message queue security
  fileTransfer: 'TLS-1.3'    // File upload/download
};
```

### Network Security
```yaml
# Network Segmentation
networks:
  dmz:
    services: [api-gateway, load-balancer]
    firewall: external-facing rules
  application:
    services: [auth-service, review-service, routing-service]
    firewall: internal application rules
  data:
    services: [postgresql, redis, object-storage]
    firewall: database access rules
  management:
    services: [monitoring, logging, backup]
    firewall: administrative access rules
```

## Integration Architecture

### External Systems Integration
```typescript
// UN SSO Integration
const ssoConfig = {
  protocol: ['SAML-2.0', 'OIDC'],
  provider: 'UN-Identity-Provider',
  mappings: {
    attributes: ['email', 'displayName', 'department'],
    roles: ['UNHCR-Reviewer', 'UNICEF-Admin'],
    groups: ['Data-Scientists', 'QA-Specialists']
  }
};

// ML Pipeline Integration
const mlConfig = {
  format: ['JSON', 'CSV', 'Parquet'],
  delivery: ['S3', 'HTTPS-API', 'Message-Queue'],
  schedule: ['real-time', 'daily-batch', 'weekly-aggregate'],
  feedback: ['model-predictions', 'human-labels', 'confidence-scores']
};

// Notification Integration
const notificationConfig = {
  email: ['smtp-relay', 'sendgrid'],
  sms: ['twilio', 'aws-sns'],
  push: ['fcm', 'apns'],
  webhook: ['slack', 'msteams', 'custom-endpoints']
};
```

## Performance Architecture

### Horizontal Scaling
```yaml
# Kubernetes Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: review-service
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
      - name: review-service
        image: unreviewhub/review-service:latest
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Database Scaling
```sql
-- Read replicas for query scaling
CREATE DATABASE replica_unreviewhub;

-- Connection pooling with PgBouncer
-- Max connections: 100 per service instance
-- Connection timeout: 30 seconds
-- Query timeout: 10 seconds

-- Database sharding (if needed)
-- Shard 1: Organizations A-D
-- Shard 2: Organizations E-H
-- Shard 3: Organizations I-L
-- Shard 4: Organizations M-Z
```

### Caching Layers
```typescript
// Multi-level caching
const cacheHierarchy = {
  // CDN Level (global)
  cdn: {
    provider: 'CloudFront',
    ttl: '24 hours',
    content: ['static-assets', 'api-responses']
  },
  
  // Application Level (instance)
  application: {
    provider: 'Node-Memory',
    ttl: '1 hour',
    content: ['user-sessions', 'routing-rules']
  },
  
  // Distributed Level (cluster)
  distributed: {
    provider: 'Redis-Cluster',
    ttl: '24 hours',
    content: ['review-items', 'user-profiles', 'audit-logs']
  },
  
  // Database Level (persistent)
  database: {
    provider: 'PostgreSQL',
    ttl: '7 days',
    content: ['historical-data', 'analytics']
  }
};
```

## Monitoring & Observability

### Metrics Collection (Prometheus)
```yaml
# Custom Metrics
metrics:
  application:
    - name: review_items_processed_total
      type: counter
      labels: [organization, status, priority]
    - name: review_processing_duration_seconds
      type: histogram
      buckets: [0.1, 0.5, 1.0, 2.5, 5.0, 10.0]
    - name: active_reviewers_count
      type: gauge
      labels: [organization]
  
  infrastructure:
    - name: cpu_usage_percent
      type: gauge
      labels: [service, instance]
    - name: memory_usage_bytes
      type: gauge
      labels: [service, instance]
    - name: disk_io_ops_total
      type: counter
      labels: [service, operation]
```

### Logging Strategy (ELK Stack)
```json
{
  "log_format": {
    "timestamp": "2025-01-14T10:30:00Z",
    "level": "INFO",
    "service": "review-service",
    "trace_id": "abc123-def456-ghi789",
    "user_id": "user-uuid",
    "organization_id": "org-uuid",
    "request_id": "req-uuid",
    "message": "Review item processed successfully",
    "metadata": {
      "item_id": "item-uuid",
      "processing_time_ms": 150,
      "decision_type": "approve"
    }
  }
}
```

### Distributed Tracing (Jaeger)
```typescript
// Trace Context
const traceContext = {
  traceId: generateTraceId(),
  spanId: generateSpanId(),
  parentSpanId: getParentSpanId(),
  flags: {
    sampled: true,
    debug: false
  },
  baggage: {
    userId: 'user-uuid',
    organizationId: 'org-uuid',
    requestId: 'req-uuid'
  }
};
```

## Deployment Architecture

### Environment Strategy
```yaml
environments:
  development:
    infrastructure: 'Docker-Compose'
    database: 'PostgreSQL-15'
    caching: 'Redis-7'
    monitoring: 'Basic-Prometheus'
    
  staging:
    infrastructure: 'Kubernetes'
    database: 'PostgreSQL-15-HA'
    caching: 'Redis-Cluster'
    monitoring: 'Full-Observability-Stack'
    
  production:
    infrastructure: 'UN-Private-Cloud-Kubernetes'
    database: 'PostgreSQL-15-Enterprise-HA'
    caching: 'Redis-Enterprise-Cluster'
    monitoring: 'Enterprise-Observability'
    disaster_recovery: 'Multi-Region'
```

### CI/CD Pipeline
```yaml
pipeline:
  stages:
    - name: 'code-quality'
      tools: ['sonarqube', 'eslint', 'prettier']
    - name: 'security-scan'
      tools: ['snyk', 'owasp-zap', 'trivy']
    - name: 'unit-testing'
      tools: ['jest', 'coverage-reports']
    - name: 'integration-testing'
      tools: ['cypress', 'postman-newman']
    - name: 'deployment'
      strategy: 'blue-green'
      tools: ['helm', 'kubernetes']
    - name: 'post-deployment'
      tools: ['smoke-tests', 'performance-tests']
```

This architecture provides a robust, scalable, and secure foundation for UNReviewHub that meets all requirements while maintaining flexibility for future enhancements and scaling.