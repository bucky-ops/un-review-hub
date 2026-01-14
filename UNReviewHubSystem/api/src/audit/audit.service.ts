import { createHash } from 'crypto';
import { prisma } from '../utils/prisma';
import { AuditOperation } from '@prisma/client';

export interface AuditLogOptions {
    tableName: string;
    recordId?: string;
    operation: AuditOperation;
    oldValues?: any;
    newValues?: any;
    userId?: string;
    organizationId?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
}

export class AuditService {
    /**
     * Logs an entry to the audit trail with SHA-256 integrity verification.
     */
    static async log(options: AuditLogOptions) {
        const {
            tableName,
            recordId,
            operation,
            oldValues,
            newValues,
            userId,
            organizationId,
            ipAddress,
            userAgent,
            sessionId,
        } = options;

        // Determine changed fields for updates
        let changedFields: string[] = [];
        if (operation === 'UPDATE' && oldValues && newValues) {
            changedFields = Object.keys(newValues).filter(
                (key) => JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])
            );
        }

        // Generate SHA-256 hash for tamper evidence
        // We hash the new values (or old if delete) along with a secret salt if available
        const dataToHash = JSON.stringify({
            operation,
            recordId,
            newValues: newValues || oldValues,
            timestamp: new Date().toISOString(),
        });

        const hashValue = createHash('sha256')
            .update(dataToHash + (process.env.AUDIT_ENCRYPTION_KEY || ''))
            .digest('hex');

        try {
            return await prisma.auditEntry.create({
                data: {
                    tableName,
                    recordId,
                    operation,
                    oldValues: oldValues ? (oldValues as any) : undefined,
                    newValues: newValues ? (newValues as any) : undefined,
                    changedFields,
                    userId,
                    organizationId,
                    ipAddress,
                    userAgent,
                    sessionId,
                    hashValue,
                },
            });
        } catch (error) {
            console.error('Failed to create audit entry:', error);
            // In a production system, we might want to throw or log to an external failure service
            // since audit failures can be a compliance issue.
            throw error;
        }
    }
}
