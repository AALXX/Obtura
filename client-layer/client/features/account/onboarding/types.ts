import { Zap, TrendingUp, Briefcase, Crown } from 'lucide-react'

export const subscriptionPlans = [
    {
        id: 'starter',
        name: 'Starter',
        price: 79,
        annualPrice: 672,
        icon: Zap,
        description: 'Perfect for small teams starting with DevOps automation',
        popular: false,
        tier: 1,

        team: {
            members: 8,
            environments: 3,
            projects: 5
        },

        buildLimits: {
            concurrentBuilds: 5,
            buildMinutes: 20,
            buildsPerMonth: 100,
            pipelines: 1,
            jobsPerPipeline: 10,
            artifacts: 100
        },

        buildResources: {
            cpu: 1.0,
            memoryGb: 2
        },

        deployment: {
            deploymentsPerMonth: 100,
            regions: 1,
            rollbacks: 3,
            services: 5,
            environments: 10
        },

        runtimeResources: {
            cpu: 0.5,
            memoryGb: 1
        },

        storage: {
            totalGb: 10,
            backupsGb: 5,
            logsGb: 5,
            retentionDays: 7,
            backupRetentionDays: 30
        },

        traffic: {
            bandwidthGb: 50,
            requestsPerMonth: 100,
            cdn: false
        },

        integrations: {
            webhooks: 3,
            repos: 2,
            customIntegrations: 0,
            github: true,
            gitlab: false,
            bitbucket: false,
            retentionDays: null
        },

        support: {
            level: 'community',
            price: null,
            responseHours: 48
        },

        features: {
            sso: false,
            auditLogs: false,
            customDomains: false,
            sla: false
        }
    },

    {
        id: 'team',
        name: 'Team',
        price: 299,
        annualPrice: 2978,
        icon: TrendingUp,
        description: 'For growing teams with multiple projects',
        popular: true,
        tier: 2,

        team: {
            members: 25,
            environments: 10,
            projects: 15
        },

        buildLimits: {
            concurrentBuilds: 20,
            buildMinutes: 100,
            buildsPerMonth: 500,
            pipelines: 3,
            jobsPerPipeline: 30,
            artifacts: 500
        },

        buildResources: {
            cpu: 4.0,
            memoryGb: 8
        },

        deployment: {
            deploymentsPerMonth: 500,
            regions: 3,
            rollbacks: 5,
            services: 20,
            environments: 30
        },

        runtimeResources: {
            cpu: 1.0,
            memoryGb: 2
        },

        storage: {
            totalGb: 50,
            backupsGb: 30,
            logsGb: 20,
            retentionDays: 30,
            backupRetentionDays: 60
        },

        traffic: {
            bandwidthGb: 200,
            requestsPerMonth: 500,
            cdn: true
        },

        integrations: {
            webhooks: 10,
            repos: 5,
            customIntegrations: 5,
            github: true,
            gitlab: true,
            bitbucket: true,
            retentionDays: 30
        },

        support: {
            level: 'email',
            price: 99.5,
            responseHours: 24
        },

        features: {
            sso: true,
            auditLogs: false,
            customDomains: false,
            sla: false
        }
    },

    {
        id: 'business',
        name: 'Business',
        price: 799,
        annualPrice: 7963,
        icon: Briefcase,
        description: 'For established SMEs with complex needs',
        popular: false,
        tier: 3,

        team: {
            members: 50,
            environments: 25,
            projects: 30
        },

        buildLimits: {
            concurrentBuilds: 100,
            buildMinutes: 500,
            buildsPerMonth: 1000,
            pipelines: 10,
            jobsPerPipeline: 60,
            artifacts: 2000
        },

        buildResources: {
            cpu: 8.0,
            memoryGb: 16
        },

        deployment: {
            deploymentsPerMonth: 1000,
            regions: 5,
            rollbacks: 10,
            services: 50,
            environments: 60
        },

        runtimeResources: {
            cpu: 2.0,
            memoryGb: 4
        },

        storage: {
            totalGb: 3072,
            backupsGb: 100,
            logsGb: 100,
            retentionDays: 90,
            backupRetentionDays: 90
        },

        traffic: {
            bandwidthGb: 1000,
            requestsPerMonth: 1000,
            cdn: true
        },

        integrations: {
            webhooks: 50,
            repos: 20,
            customIntegrations: null,
            github: true,
            gitlab: true,
            bitbucket: true,
            retentionDays: 90
        },

        support: {
            level: 'priority',
            price: 99.9,
            responseHours: 4
        },

        features: {
            sso: true,
            auditLogs: true,
            customDomains: true,
            sla: false
        }
    },

    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 2199,
        annualPrice: null,
        icon: Crown,
        description: 'Custom limits for large organizations',
        popular: false,
        tier: 4,

        team: {
            members: null,
            environments: null,
            projects: null
        },

        buildLimits: {
            concurrentBuilds: null,
            buildMinutes: null,
            buildsPerMonth: null,
            pipelines: 20,
            jobsPerPipeline: 120,
            artifacts: 5000
        },

        buildResources: {
            cpu: 16.0,
            memoryGb: 32
        },

        deployment: {
            deploymentsPerMonth: null,
            regions: 10,
            rollbacks: 4,
            services: 4,
            environments: 100
        },

        runtimeResources: {
            cpu: 4.0,
            memoryGb: 8
        },

        storage: {
            totalGb: 5120,
            backupsGb: 500,
            logsGb: 500,
            retentionDays: 365,
            backupRetentionDays: 365
        },

        traffic: {
            bandwidthGb: null,
            requestsPerMonth: 2000,
            cdn: true
        },

        integrations: {
            webhooks: 30,
            repos: null,
            customIntegrations: null,
            github: true,
            gitlab: true,
            bitbucket: true,
            retentionDays: 365
        },

        support: {
            level: 'dedicated',
            price: 99.99,
            responseHours: 1
        },

        features: {
            sso: true,
            auditLogs: true,
            customDomains: true,
            sla: true
        }
    }
]
