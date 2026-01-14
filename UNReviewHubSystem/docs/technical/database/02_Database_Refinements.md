# UNReviewHub - Database Schema Refinements

## Overview

This document outlines the database schema refinements implemented to address specific requirements and improve data relationships.

## 1. ReviewItem Duplicate Link Enhancement

### Original Schema Issue
The original schema had a `duplicateOf` field but it was not clearly defined as a relationship to another ReviewItem.

### Refined Schema
```sql
model ReviewItem {
  id                     String        @id @default(cuid())
  organizationId          String
  externalId              String?
  duplicateOfId           String?    // Link to original item if this is a duplicate
  contentType             ContentType
  title                  String?
  content                Json
  metadata               Json          @default("{}")
  priority               PriorityLevel  @default(MEDIUM)
  requiredSkills          Json          @default("[]")
  requiredLanguages       Json          @default("[]")
  estimatedDurationMinutes Int?
  slaDeadline            DateTime?
  status                 ItemStatus     @default(PENDING)
  assignedTo             String?
  assignedAt             DateTime?
  startedAt              DateTime?
  completedAt            DateTime?
  createdBy              String?
  createdAt              DateTime      @default(now())
  updatedAt              DateTime      @updatedAt

  // Relations
  organization           Organization  @relation(fields: [organizationId], references: [id], onDelete: Restrict)
  assignedUser           UserProfile?   @relation("UserAssignments", fields: [assignedTo])
  creatorUser            UserProfile?   @relation("UserCreatedItems", fields: [createdBy])
  attachments           ItemAttachment[]
  decisions              Decision[]
  queueAssignments       QueueAssignment[]
  qaReviews              QAReview[]
  escalations            Escalation[]
  auditEntries           AuditEntry[]
  consensusReviews        ReviewItem[]    @relation("ConsensusReviews")

  @@index([status, priority])
  @@index([organizationId, status])
  @@index([assignedTo])
  @@index([slaDeadline])
  @@index([createdAt(sort: Desc)])
  @@index([duplicateOfId])  // Added index for duplicate relationships
  @@map("review_items")
}
```

### Benefits
- **Clear Relationship**: `duplicateOfId` clearly references another ReviewItem
- **Indexing**: Added index for efficient duplicate queries
- **Query Support**: Enables finding duplicate chains and original items
- **Data Integrity**: Foreign key relationship ensures referential integrity

## 2. QA Consensus Model Enhancement

### Original Schema Limitation
The original QA schema didn't clearly support consensus-based reviews where multiple reviewers evaluate the same item.

### Refined QA Schema
```sql
model QAReview {
  id                  String    @id @default(cuid())
  originalDecisionId    String
  qaReviewerId         String
  reviewItemId         String
  consensusGroupId     String?  // For many-to-one consensus reviews
  agreementScore       Int?
  feedback            String?
  discrepancyReason    String?
  recommendedAction    String?
  status              QAStatus  @default(PENDING)
  reviewDurationSeconds Int?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  // Relations
  originalDecision  Decision    @relation(fields: [originalDecisionId], references: [id], onDelete: Restrict)
  consensusDecision  Decision?   @relation("ConsensusDecision", fields: [id])
  qaReviewer       UserProfile  @relation(fields: [qaReviewerId], references: [id])
  reviewItem       ReviewItem   @relation(fields: [reviewItemId], references: [id], onDelete: Restrict)
  auditEntries     AuditEntry[]
  consensusReviews  ReviewItem[] @relation("ConsensusReviews")

  @@index([originalDecisionId])
  @@index([qaReviewerId, status])
  @@index([reviewItemId])
  @@index([status])
  @@index([consensusGroupId])  // Added for consensus grouping
  @@map("qa_reviews")
}
```

### Consensus Workflow Support
```sql
-- Example: Create consensus review group
INSERT INTO qa_reviews (
  id, original_decision_id, qa_reviewer_id, review_item_id,
  consensus_group_id, status, created_at
) VALUES
  (gen_random_uuid(), $decisionId, $reviewer1Id, $itemId, 'group-123', 'pending', NOW()),
  (gen_random_uuid(), $decisionId, $reviewer2Id, $itemId, 'group-123', 'pending', NOW()),
  (gen_random_uuid(), $decisionId, $reviewer3Id, $itemId, 'group-123', 'pending', NOW());

-- Query consensus results
SELECT
  consensus_group_id,
  AVG(agreement_score) as avg_score,
  COUNT(*) as total_reviews,
  COUNT(CASE WHEN agreement_score >= 4 THEN 1 END) as agreements
FROM qa_reviews
WHERE consensus_group_id = 'group-123'
GROUP BY consensus_group_id;
```

### Benefits
- **Consensus Support**: `consensusGroupId` groups multiple QA reviews for the same item
- **Scalable**: Supports both individual and consensus-based QA workflows
- **Analytics**: Enables consensus analysis and agreement metrics
- **Flexible**: Can be used for different QA sampling strategies

## 3. Database Partitioning Strategy

### Organization-Based Partitioning
```sql
-- Partition by organization for data residency
CREATE TABLE review_items (
    -- ... existing columns
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
```

### Partition Management Functions
```sql
-- Function to create new partitions dynamically
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

### Benefits
- **Data Residency**: Ensures data stays within geographic boundaries
- **Performance**: Reduces index size and improves query performance
- **Scalability**: Enables horizontal scaling across multiple nodes
- **Compliance**: Supports UN data sovereignty requirements

## 4. Audit Trail Enhancements

### Cryptographic Verification
```sql
-- Enhanced audit entry with cryptographic verification
CREATE TABLE audit_entries (
    id            String          @id @default(cuid())
    tableName     String
    recordId      String?
    operation     AuditOperation
    oldValues     Json?
    newValues     Json?
    changedFields String[]
    userId        String?
    organizationId String?
    ipAddress     String?
    userAgent     String?
    sessionId     String?
    hashValue     String?        // SHA-256 hash for integrity
    createdAt     DateTime        @default(now())

    @@index([tableName, recordId])
    @@index([userId, createdAt(sort: Desc)])
    @@index([operation, createdAt(sort: Desc)])
    @@index([organizationId, createdAt(sort: Desc)])
    @@index([createdAt(sort: Desc)])
    @@map("audit_entries")
);
```

### Audit Trigger Function
```sql
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
DECLARE
    old_data JSONB;
    new_data JSONB;
    changed_fields TEXT[];
    user_id_param TEXT;
    hash_value TEXT;
BEGIN
    -- Get current user from session
    BEGIN
        user_id_param := current_setting('app.current_user_id', true);
    EXCEPTION WHEN OTHERS THEN
        user_id_param := NULL;
    END;

    IF TG_OP = 'DELETE' THEN
        old_data := to_jsonb(OLD);
        hash_value := encode(sha256(old_data::text), 'hex');

        INSERT INTO audit_entries (
            table_name, record_id, operation, old_values,
            user_id, hash_value, created_at
        ) VALUES (
            TG_TABLE_NAME, OLD.id::text, 'DELETE', old_data,
            user_id_param, hash_value, NOW()
        );
        RETURN OLD;

    ELSIF TG_OP = 'UPDATE' THEN
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        hash_value := encode(sha256(new_data::text), 'hex');

        -- Calculate changed fields
        SELECT array_agg(key) INTO changed_fields
        FROM jsonb_each_text(old_data) old_kv
        JOIN jsonb_each_text(new_data) new_kv ON old_kv.key = new_kv.key
        WHERE old_kv.value IS DISTINCT FROM new_kv.value;

        INSERT INTO audit_entries (
            table_name, record_id, operation, old_values, new_values,
            changed_fields, user_id, hash_value, created_at
        ) VALUES (
            TG_TABLE_NAME, NEW.id::text, 'UPDATE', old_data, new_data,
            changed_fields, user_id_param, hash_value, NOW()
        );
        RETURN NEW;

    ELSIF TG_OP = 'INSERT' THEN
        new_data := to_jsonb(NEW);
        hash_value := encode(sha256(new_data::text), 'hex');

        INSERT INTO audit_entries (
            table_name, record_id, operation, new_values,
            user_id, hash_value, created_at
        ) VALUES (
            TG_TABLE_NAME, NEW.id::text, 'INSERT', new_data,
            user_id_param, hash_value, NOW()
        );
        RETURN NEW;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Benefits
- **Tamper Evidence**: Cryptographic hashes prevent log modification
- **Complete Tracking**: Before/after values and changed fields
- **Performance**: Efficient indexing for audit queries
- **Compliance**: Supports UN audit requirements

## 5. Indexing Strategy Optimization

### Performance Indexes
```sql
-- Composite indexes for common query patterns
CREATE INDEX idx_review_items_status_priority ON review_items(status, priority DESC);
CREATE INDEX idx_review_items_org_status ON review_items(organization_id, status);
CREATE INDEX idx_review_items_assigned_sla ON review_items(assigned_to, sla_deadline) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_decisions_reviewer_latest ON decisions(reviewer_id, is_latest) WHERE is_latest = true;
CREATE INDEX idx_qa_reviews_consensus ON qa_reviews(consensus_group_id, status) WHERE consensus_group_id IS NOT NULL;

-- Full-text search indexes
CREATE INDEX idx_review_items_content_fts ON review_items USING gin(to_tsvector('english', content::text));
CREATE INDEX idx_review_items_title_fts ON review_items USING gin(to_tsvector('english', title));

-- JSON indexes for metadata queries
CREATE INDEX idx_review_items_metadata ON review_items USING gin(metadata);
CREATE INDEX idx_decisions_metadata ON decisions USING gin(metadata);
```

### Index Maintenance
```sql
-- Function to rebuild indexes during maintenance windows
CREATE OR REPLACE FUNCTION rebuild_indexes()
RETURNS VOID AS $$
BEGIN
    REINDEX INDEX CONCURRENTLY idx_review_items_status_priority;
    REINDEX INDEX CONCURRENTLY idx_decisions_reviewer_latest;
    REINDEX INDEX CONCURRENTLY idx_audit_entries_created_at;

    -- Log maintenance completion
    INSERT INTO system_logs (event_type, message, created_at)
    VALUES ('MAINTENANCE', 'Database indexes rebuilt successfully', NOW());
END;
$$ LANGUAGE plpgsql;
```

## 6. Data Retention and Archival

### Retention Policies
```sql
-- Retention policy configuration
CREATE TABLE retention_policies (
    id              SERIAL PRIMARY KEY,
    table_name      VARCHAR(255) NOT NULL,
    retention_days  INTEGER NOT NULL,
    archive_strategy VARCHAR(50) DEFAULT 'delete', -- 'archive', 'compress', 'delete'
    archive_table   VARCHAR(255),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Example policies
INSERT INTO retention_policies (table_name, retention_days, archive_strategy) VALUES
    ('audit_entries', 2555, 'archive'),  -- 7 years for audit logs
    ('review_items', 365, 'compress'),   -- 1 year for completed items
    ('decisions', 365, 'compress'),      -- 1 year for decisions
    ('qa_reviews', 180, 'delete');       -- 6 months for QA reviews
```

### Archival Process
```sql
-- Automated archival function
CREATE OR REPLACE FUNCTION archive_old_data()
RETURNS VOID AS $$
DECLARE
    policy RECORD;
    archive_query TEXT;
BEGIN
    FOR policy IN SELECT * FROM retention_policies LOOP
        -- Build archival query based on strategy
        CASE policy.archive_strategy
            WHEN 'archive' THEN
                archive_query := format(
                    'INSERT INTO %I SELECT * FROM %I WHERE created_at < NOW() - INTERVAL ''%s days''',
                    policy.archive_table, policy.table_name, policy.retention_days
                );
            WHEN 'compress' THEN
                -- Implement compression logic
                archive_query := format(
                    'UPDATE %I SET content = compress(content) WHERE created_at < NOW() - INTERVAL ''%s days''',
                    policy.table_name, policy.retention_days
                );
            WHEN 'delete' THEN
                archive_query := format(
                    'DELETE FROM %I WHERE created_at < NOW() - INTERVAL ''%s days''',
                    policy.table_name, policy.retention_days
                );
        END CASE;

        -- Execute archival
        EXECUTE archive_query;

        -- Log archival activity
        INSERT INTO system_logs (event_type, message, created_at)
        VALUES ('ARCHIVAL', format('Archived %s records from %s', policy.table_name), NOW());
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

## 7. Migration Strategy

### Safe Migration Process
```sql
-- Migration versioning table
CREATE TABLE schema_migrations (
    version VARCHAR(255) PRIMARY KEY,
    description TEXT,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    applied_by VARCHAR(255)
);

-- Example migration: Add duplicate_of_id column
DO $$
BEGIN
    -- Check if migration already applied
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '001_add_duplicate_link') THEN

        -- Add column
        ALTER TABLE review_items ADD COLUMN duplicate_of_id VARCHAR(255);

        -- Add foreign key constraint
        ALTER TABLE review_items ADD CONSTRAINT fk_review_items_duplicate
            FOREIGN KEY (duplicate_of_id) REFERENCES review_items(id);

        -- Add index
        CREATE INDEX idx_review_items_duplicate_of ON review_items(duplicate_of_id);

        -- Record migration
        INSERT INTO schema_migrations (version, description, applied_by)
        VALUES ('001_add_duplicate_link', 'Add duplicate_of_id column with foreign key', current_user);

    END IF;
END $$;
```

### Rollback Strategy
```sql
-- Rollback function for migrations
CREATE OR REPLACE FUNCTION rollback_migration(target_version VARCHAR)
RETURNS VOID AS $$
DECLARE
    migration RECORD;
BEGIN
    -- Find migrations to rollback (in reverse order)
    FOR migration IN
        SELECT * FROM schema_migrations
        WHERE version > target_version
        ORDER BY version DESC
    LOOP
        -- Execute rollback logic based on version
        CASE migration.version
            WHEN '001_add_duplicate_link' THEN
                ALTER TABLE review_items DROP CONSTRAINT IF EXISTS fk_review_items_duplicate;
                DROP INDEX IF EXISTS idx_review_items_duplicate_of;
                ALTER TABLE review_items DROP COLUMN IF EXISTS duplicate_of_id;
            -- Add other rollback cases...
        END CASE;

        -- Remove migration record
        DELETE FROM schema_migrations WHERE version = migration.version;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
```

## Summary

These database schema refinements provide:

1. **Duplicate Item Tracking**: Clear relationships between original and duplicate items
2. **QA Consensus Support**: Many-to-one review relationships for quality assurance
3. **Enhanced Partitioning**: Organization-based data residency compliance
4. **Cryptographic Audit**: Tamper-evident audit trails with integrity verification
5. **Optimized Indexing**: Performance improvements for common query patterns
6. **Data Lifecycle Management**: Configurable retention and archival policies
7. **Safe Migrations**: Version-controlled schema changes with rollback capability

These enhancements ensure the database supports all UNReviewHub requirements for data sovereignty, auditability, performance, and compliance.