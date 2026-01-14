# UNReviewHub - Database Schema & Design

## Overview

UNReviewHub uses PostgreSQL as its primary database with a focus on data sovereignty, auditability, and performance. The schema is designed to support partitioning per organization, immutable audit trails, and efficient query patterns.

## Database Design Principles

### 1. Data Sovereignty
- **Partitioning**: Tables partitioned by organization for data residency
- **Isolation**: Data access restricted to user's organization
- **Compliance**: Configurable retention policies per jurisdiction

### 2. Audit Trail
- **Immutable**: All modifications logged in append-only audit tables
- **Complete**: Every CRUD operation tracked with before/after values
- **Tamper-Evident**: Cryptographic hashes ensure log integrity

### 3. Performance
- **Indexing**: Optimized indexes for common query patterns
- **Partitioning**: Horizontal partitioning for large datasets
- **Caching**: Redis integration for frequently accessed data

## Core Tables

### 1. Organizations & Users

#### Organizations
```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50) UNIQUE NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    agency_type VARCHAR(100) NOT NULL,
    data_residency_rules JSONB DEFAULT '{}',
    retention_policy JSONB DEFAULT '{}',
    security_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_country_code CHECK (country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT valid_agency_type CHECK (agency_type IN ('UNHCR', 'UNICEF', 'WFP', 'WHO', 'UNDP', 'OTHER'))
);

-- Indexes
CREATE INDEX idx_organizations_country_agency ON organizations(country_code, agency_type);
CREATE INDEX idx_organizations_active ON organizations(is_active) WHERE is_active = true;
```

#### User Profiles
```sql
CREATE TYPE user_role AS ENUM ('admin', 'reviewer', 'qa', 'data_scientist', 'system_operator');

CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    un_sso_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    skills JSONB DEFAULT '[]',
    languages JSONB DEFAULT '[]',
    preferences JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT non_empty_skills CHECK (jsonb_typeof(skills) = 'array'),
    CONSTRAINT non_empty_languages CHECK (jsonb_typeof(languages) = 'array')
);

-- Indexes
CREATE INDEX idx_user_profiles_org_role ON user_profiles(organization_id, role);
CREATE INDEX idx_user_profiles_sso_id ON user_profiles(un_sso_id);
CREATE INDEX idx_user_profiles_active ON user_profiles(is_active) WHERE is_active = true;
CREATE INDEX idx_user_profiles_skills ON user_profiles USING gin(skills);
CREATE INDEX idx_user_profiles_languages ON user_profiles USING gin(languages);
```

### 2. Review Items

#### Review Items (Partitioned)
```sql
CREATE TYPE content_type AS ENUM ('document', 'image', 'text', 'audio', 'video', 'mixed');
CREATE TYPE item_status AS ENUM ('pending', 'assigned', 'in_review', 'completed', 'escalated', 'archived');
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical', 'urgent');

CREATE TABLE review_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    external_id VARCHAR(255),
    content_type content_type NOT NULL,
    title VARCHAR(500),
    content JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    priority priority_level DEFAULT 'medium',
    required_skills JSONB DEFAULT '[]',
    required_languages JSONB DEFAULT '[]',
    estimated_duration_minutes INTEGER,
    sla_deadline TIMESTAMPTZ,
    status item_status DEFAULT 'pending',
    assigned_to UUID REFERENCES user_profiles(id),
    assigned_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_duration CHECK (estimated_duration_minutes > 0 AND estimated_duration_minutes <= 480),
    CONSTRAINT non_empty_required_skills CHECK (jsonb_typeof(required_skills) = 'array'),
    CONSTRAINT non_empty_required_languages CHECK (jsonb_typeof(required_languages) = 'array')
) PARTITION BY HASH (organization_id);

-- Create partitions (example: 4 partitions for load distribution)
CREATE TABLE review_items_partition_0 PARTITION OF review_items
    FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE review_items_partition_1 PARTITION OF review_items
    FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE review_items_partition_2 PARTITION OF review_items
    FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE review_items_partition_3 PARTITION OF review_items
    FOR VALUES WITH (MODULUS 4, REMAINDER 3);

-- Indexes (created on each partition)
CREATE INDEX idx_review_items_status_priority ON review_items(status, priority);
CREATE INDEX idx_review_items_org_status ON review_items(organization_id, status);
CREATE INDEX idx_review_items_assigned ON review_items(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_review_items_sla_deadline ON review_items(sla_deadline) WHERE sla_deadline IS NOT NULL;
CREATE INDEX idx_review_items_created_at ON review_items(created_at DESC);
CREATE INDEX idx_review_items_content_fts ON review_items USING gin(to_tsvector('english', content::text));
CREATE INDEX idx_review_items_skills ON review_items USING gin(required_skills);
```

#### Item Attachments
```sql
CREATE TYPE attachment_type AS ENUM ('pdf', 'doc', 'docx', 'jpg', 'png', 'mp3', 'mp4', 'other');

CREATE TABLE item_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_item_id UUID NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    attachment_type attachment_type NOT NULL,
    is_processed BOOLEAN DEFAULT false,
    processed_data JSONB,
    uploaded_by UUID NOT NULL REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT positive_file_size CHECK (file_size_bytes > 0)
);

-- Indexes
CREATE INDEX idx_item_attachments_review_item ON item_attachments(review_item_id);
CREATE INDEX idx_item_attachments_type ON item_attachments(attachment_type);
```

### 3. Decisions & Reviews

#### Decisions (Append-Only)
```sql
CREATE TYPE decision_type AS ENUM ('approve', 'reject', 'escalate', 'request_info', 'skip');

CREATE TABLE decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_item_id UUID NOT NULL REFERENCES review_items(id) ON DELETE RESTRICT,
    reviewer_id UUID NOT NULL REFERENCES user_profiles(id),
    decision_type decision_type NOT NULL,
    rationale TEXT NOT NULL,
    confidence_score INTEGER CHECK (confidence_score BETWEEN 1 AND 5),
    pii_redactions JSONB DEFAULT '[]',
    tags JSONB DEFAULT '[]',
    metadata JSONB DEFAULT '{}',
    review_duration_seconds INTEGER,
    is_latest BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT rationale_length CHECK (char_length(rationale) >= 10),
    CONSTRAINT valid_duration CHECK (review_duration_seconds > 0 AND review_duration_seconds <= 3600),
    CONSTRAINT unique_latest_decision UNIQUE (review_item_id, is_latest) WHERE is_latest = true
);

-- Indexes
CREATE INDEX idx_decisions_review_item ON decisions(review_item_id, created_at DESC);
CREATE INDEX idx_decisions_reviewer_latest ON decisions(reviewer_id, is_latest) WHERE is_latest = true;
CREATE INDEX idx_decisions_type ON decisions(decision_type);
CREATE INDEX idx_decisions_created_at ON decisions(created_at DESC);
```

#### Decision History (Versioning)
```sql
CREATE TABLE decision_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
    review_item_id UUID NOT NULL,
    reviewer_id UUID NOT NULL REFERENCES user_profiles(id),
    previous_decision_id UUID REFERENCES decisions(id),
    change_reason TEXT,
    changed_by UUID NOT NULL REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_decision_history_decision ON decision_history(decision_id);
CREATE INDEX idx_decision_history_review_item ON decision_history(review_item_id);
```

### 4. Routing & Assignment

#### Review Queues
```sql
CREATE TABLE review_queues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    routing_rules JSONB DEFAULT '{}',
    sla_config JSONB DEFAULT '{}',
    auto_assignment BOOLEAN DEFAULT true,
    max_queue_size INTEGER DEFAULT 100,
    processing_time_target_minutes INTEGER DEFAULT 60,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT positive_queue_size CHECK (max_queue_size > 0),
    CONSTRAINT positive_processing_time CHECK (processing_time_target_minutes > 0)
);

-- Indexes
CREATE INDEX idx_review_queues_org_active ON review_queues(organization_id, is_active) WHERE is_active = true;
```

#### Queue Assignments
```sql
CREATE TYPE assignment_status AS ENUM ('assigned', 'accepted', 'completed', 'skipped', 'escalated', 'expired');

CREATE TABLE queue_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_item_id UUID NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
    queue_id UUID NOT NULL REFERENCES review_queues(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES user_profiles(id),
    assigned_by UUID REFERENCES user_profiles(id),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    status assignment_status DEFAULT 'assigned',
    assignment_metadata JSONB DEFAULT '{}',
    
    -- Constraints
    CONSTRAINT valid_assignment_window CHECK (expires_at IS NULL OR expires_at > assigned_at)
);

-- Indexes
CREATE INDEX idx_queue_assignments_queue_status ON queue_assignments(queue_id, status);
CREATE INDEX idx_queue_assignments_reviewer ON queue_assignments(assigned_to, status);
CREATE INDEX idx_queue_assignments_review_item ON queue_assignments(review_item_id);
CREATE INDEX idx_queue_assignments_expires ON queue_assignments(expires_at) WHERE expires_at IS NOT NULL;
```

### 5. Quality Assurance

#### QA Reviews
```sql
CREATE TYPE qa_status AS ENUM ('pending', 'in_review', 'completed', 'disagreement', 'escalated');

CREATE TABLE qa_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_decision_id UUID NOT NULL REFERENCES decisions(id) ON DELETE RESTRICT,
    qa_reviewer_id UUID NOT NULL REFERENCES user_profiles(id),
    review_item_id UUID NOT NULL REFERENCES review_items(id) ON DELETE RESTRICT,
    agreement_score INTEGER CHECK (agreement_score BETWEEN 1 AND 5),
    feedback TEXT,
    discrepancy_reason VARCHAR(255),
    recommended_action VARCHAR(255),
    status qa_status DEFAULT 'pending',
    review_duration_seconds INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_qa_duration CHECK (review_duration_seconds > 0 AND review_duration_seconds <= 3600)
);

-- Indexes
CREATE INDEX idx_qa_reviews_original_decision ON qa_reviews(original_decision_id);
CREATE INDEX idx_qa_reviews_qa_reviewer ON qa_reviews(qa_reviewer_id, status);
CREATE INDEX idx_qa_reviews_review_item ON qa_reviews(review_item_id);
CREATE INDEX idx_qa_reviews_status ON qa_reviews(status);
```

#### Sampling Plans
```sql
CREATE TYPE sampling_strategy AS ENUM ('random', 'stratified', 'risk_based', 'time_based');

CREATE TABLE sampling_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    strategy sampling_strategy NOT NULL,
    sampling_rate DECIMAL(5,4) CHECK (sampling_rate > 0 AND sampling_rate <= 1),
    strata_rules JSONB DEFAULT '{}',
    risk_factors JSONB DEFAULT '{}',
    time_rules JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sampling_plans_org_active ON sampling_plans(organization_id, is_active) WHERE is_active = true;
```

### 6. Escalations

#### Escalations
```sql
CREATE TYPE escalation_level AS ENUM ('1', '2', '3');
CREATE TYPE escalation_status AS ENUM ('pending', 'in_review', 'resolved', 'rejected');

CREATE TABLE escalations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_item_id UUID NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
    escalated_by UUID NOT NULL REFERENCES user_profiles(id),
    escalation_reason TEXT NOT NULL,
    escalation_level escalation_level DEFAULT '1',
    assigned_to UUID REFERENCES user_profiles(id),
    status escalation_status DEFAULT 'pending',
    resolution TEXT,
    resolution_summary TEXT,
    escalated_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES user_profiles(id),
    metadata JSONB DEFAULT '{}'
);

-- Indexes
CREATE INDEX idx_escalations_review_item ON escalations(review_item_id);
CREATE INDEX idx_escalations_status ON escalations(status);
CREATE INDEX idx_escalations_level ON escalations(escalation_level);
CREATE INDEX idx_escalations_assigned_to ON escalations(assigned_to, status) WHERE assigned_to IS NOT NULL;
```

### 7. Audit & Compliance

#### Audit Log (Immutable)
```sql
CREATE TYPE audit_operation AS ENUM ('INSERT', 'UPDATE', 'DELETE', 'DECISION', 'ESCALATION', 'EXPORT', 'LOGIN', 'LOGOUT');

CREATE TABLE audit_entries (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    record_id UUID,
    operation audit_operation NOT NULL,
    old_values JSONB,
    new_values JSONB,
    changed_fields TEXT[],
    user_id UUID REFERENCES user_profiles(id),
    organization_id UUID REFERENCES organizations(id),
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    hash_value VARCHAR(64), -- SHA-256 for integrity
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_audit_entries_table_record ON audit_entries(table_name, record_id);
CREATE INDEX idx_audit_entries_user_time ON audit_entries(user_id, created_at DESC);
CREATE INDEX idx_audit_entries_operation_time ON audit_entries(operation, created_at DESC);
CREATE INDEX idx_audit_entries_org_time ON audit_entries(organization_id, created_at DESC);
CREATE INDEX idx_audit_entries_created_at ON audit_entries(created_at DESC);
```

#### Data Subject Requests
```sql
CREATE TYPE request_type AS ENUM ('access', 'rectification', 'erasure', 'portability', 'restriction');
CREATE TYPE request_status AS ENUM ('pending', 'in_progress', 'completed', 'rejected', 'expired');

CREATE TABLE data_subject_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_identifier VARCHAR(255) NOT NULL, -- Email, ID, etc.
    request_type request_type NOT NULL,
    request_data JSONB DEFAULT '{}',
    status request_status DEFAULT 'pending',
    processed_by UUID REFERENCES user_profiles(id),
    processing_notes TEXT,
    data_provided JSONB,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_data_subject_requests_subject ON data_subject_requests(subject_identifier);
CREATE INDEX idx_data_subject_requests_status ON data_subject_requests(status);
CREATE INDEX idx_data_subject_requests_expires ON data_subject_requests(expires_at);
```

### 8. Export & Analytics

#### Export Jobs
```sql
CREATE TYPE export_format AS ENUM ('json', 'csv', 'parquet', 'xml');
CREATE TYPE export_status AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'cancelled');

CREATE TABLE export_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES user_profiles(id),
    export_name VARCHAR(255) NOT NULL,
    description TEXT,
    export_format export_format NOT NULL,
    filters JSONB DEFAULT '{}',
    file_path VARCHAR(500),
    file_size_bytes BIGINT,
    record_count BIGINT,
    status export_status DEFAULT 'pending',
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_export_jobs_org_status ON export_jobs(organization_id, status);
CREATE INDEX idx_export_jobs_requested_by ON export_jobs(requested_by);
CREATE INDEX idx_export_jobs_created_at ON export_jobs(created_at DESC);
CREATE INDEX idx_export_jobs_expires ON export_jobs(expires_at) WHERE expires_at IS NOT NULL;
```

## Database Triggers & Functions

### Audit Trigger Function
```sql
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    old_data JSONB;
    new_data JSONB;
    changed_fields TEXT[];
    user_id_param UUID;
BEGIN
    -- Get current user ID from session variable
    BEGIN
        user_id_param := current_setting('app.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN
        user_id_param := NULL;
    END;
    
    IF TG_OP = 'DELETE' THEN
        old_data := to_jsonb(OLD);
        INSERT INTO audit_entries (
            table_name, record_id, operation, old_values, 
            user_id, hash_value, created_at
        ) VALUES (
            TG_TABLE_NAME, OLD.id, 'DELETE', old_data, 
            user_id_param, encode(sha256(old_data::text), 'hex'), NOW()
        );
        RETURN OLD;
        
    ELSIF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        
        -- Find changed fields
        SELECT array_agg(key) INTO changed_fields
        FROM jsonb_each_text(old_data) old_kv
        JOIN jsonb_each_text(new_data) new_kv ON old_kv.key = new_kv.key
        WHERE old_kv.value IS DISTINCT FROM new_kv.value;
        
        INSERT INTO audit_entries (
            table_name, record_id, operation, old_values, new_values, 
            changed_fields, user_id, hash_value, created_at
        ) VALUES (
            TG_TABLE_NAME, NEW.id, 'UPDATE', old_data, new_data, 
            changed_fields, user_id_param, encode(sha256(new_data::text), 'hex'), NOW()
        );
        RETURN NEW;
        
    ELSIF TG_OP = 'INSERT' THEN
        new_data := to_jsonb(NEW);
        INSERT INTO audit_entries (
            table_name, record_id, operation, new_values, 
            user_id, hash_value, created_at
        ) VALUES (
            TG_TABLE_NAME, NEW.id, 'INSERT', new_data, 
            user_id_param, encode(sha256(new_data::text), 'hex'), NOW()
        );
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Apply Audit Triggers
```sql
-- Apply audit triggers to key tables
CREATE TRIGGER audit_organizations
    AFTER INSERT OR UPDATE OR DELETE ON organizations
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_user_profiles
    AFTER INSERT OR UPDATE OR DELETE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_review_items
    AFTER INSERT OR UPDATE OR DELETE ON review_items
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_decisions
    AFTER INSERT OR UPDATE OR DELETE ON decisions
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
```

### Decision Management Trigger
```sql
CREATE OR REPLACE FUNCTION decision_management_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Ensure only one latest decision per review item
    IF NEW.is_latest = true THEN
        UPDATE decisions 
        SET is_latest = false 
        WHERE review_item_id = NEW.review_item_id AND id != NEW.id;
    END IF;
    
    -- Update review item status
    UPDATE review_items 
    SET 
        status = CASE NEW.decision_type
            WHEN 'escalate' THEN 'escalated'
            ELSE 'completed'
        END,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = NEW.review_item_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER decision_management
    AFTER INSERT ON decisions
    FOR EACH ROW EXECUTE FUNCTION decision_management_trigger();
```

## Database Views

### Review Queue View
```sql
CREATE VIEW review_queue_view AS
SELECT 
    ri.id as review_item_id,
    ri.organization_id,
    ri.title,
    ri.priority,
    ri.content_type,
    ri.sla_deadline,
    ri.status,
    ri.created_at,
    up.display_name as assigned_reviewer,
    ri.assigned_at,
    CASE 
        WHEN ri.sla_deadline < NOW() THEN 'overdue'
        WHEN ri.sla_deadline < NOW() + INTERVAL '4 hours' THEN 'urgent'
        ELSE 'normal'
    END as sla_status
FROM review_items ri
LEFT JOIN user_profiles up ON ri.assigned_to = up.id
WHERE ri.status IN ('pending', 'assigned', 'in_review');
```

### Reviewer Performance View
```sql
CREATE VIEW reviewer_performance_view AS
SELECT 
    up.id as reviewer_id,
    up.display_name,
    up.organization_id,
    COUNT(d.id) as total_reviews,
    AVG(d.confidence_score) as avg_confidence,
    AVG(d.review_duration_seconds) as avg_review_time,
    COUNT(CASE WHEN d.decision_type = 'approve' THEN 1 END) as approvals,
    COUNT(CASE WHEN d.decision_type = 'reject' THEN 1 END) as rejections,
    COUNT(CASE WHEN d.decision_type = 'escalate' THEN 1 END) as escalations,
    MIN(d.created_at) as first_review,
    MAX(d.created_at) as last_review
FROM user_profiles up
LEFT JOIN decisions d ON up.id = d.reviewer_id
WHERE up.role = 'reviewer' AND d.created_at >= NOW() - INTERVAL '30 days'
GROUP BY up.id, up.display_name, up.organization_id;
```

## Performance Optimizations

### Materialized Views for Analytics
```sql
CREATE MATERIALIZED VIEW daily_metrics_view AS
SELECT 
    DATE_TRUNC('day', ri.created_at) as date,
    ri.organization_id,
    COUNT(*) as items_created,
    COUNT(CASE WHEN ri.status = 'completed' THEN 1 END) as items_completed,
    AVG(EXTRACT(EPOCH FROM (ri.completed_at - ri.created_at))/60) as avg_processing_minutes,
    COUNT(CASE WHEN ri.sla_deadline < ri.completed_at THEN 1 END) as sla_violations
FROM review_items ri
GROUP BY DATE_TRUNC('day', ri.created_at), ri.organization_id;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX idx_daily_metrics_view_date_org ON daily_metrics_view(date, organization_id);

-- Refresh strategy
-- REFRESH MATERIALIZED VIEW CONCURRENTLY daily_metrics_view;
```

### Partition Maintenance
```sql
-- Function to create new partitions
CREATE OR REPLACE FUNCTION create_partitions(table_name TEXT, num_partitions INTEGER)
RETURNS VOID AS $$
DECLARE
    partition_name TEXT;
    i INTEGER;
BEGIN
    FOR i IN 0..num_partitions-1 LOOP
        partition_name := table_name || '_partition_' || i;
        EXECUTE format('CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES WITH (MODULUS %s, REMAINDER %s)',
                     partition_name, table_name, num_partitions, i);
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

This comprehensive database schema provides the foundation for UNReviewHub's data management, ensuring scalability, auditability, and compliance with UN requirements.