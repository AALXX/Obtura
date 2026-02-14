export interface TeamData {
    id: string
    name: string
    updated_at: string
    memberCount: number
    is_active: boolean
}

export interface TeamMemberData {
    id: string
    email: string
    name: string
    rolename: string
    can_edit: boolean
    is_you: boolean
    teamname: string
}

export interface TeamCard {
    id: string
    name: string
    description: string
}

export enum TeamRole {
    CEO = 'ceo',
    CTO = 'cto',
    CFO = 'cfo',
    ENGINEERING_MANAGER = 'engineering_manager',
    TECH_LEAD = 'tech_lead',
    DEVOPS_LEAD = 'devops_lead',
    SENIOR_DEVELOPER = 'senior_developer',
    DEVELOPER = 'developer',
    JUNIOR_DEVELOPER = 'junior_developer',
    QA_LEAD = 'qa_lead',
    QA_ENGINEER = 'qa_engineer',
    PRODUCT_MANAGER = 'product_manager',
    DESIGNER = 'designer',
    BUSINESS_ANALYST = 'business_analyst',
    VIEWER = 'viewer'
}

export const TEAM_ROLE_LABELS: Record<TeamRole, string> = {
    [TeamRole.CEO]: 'CEO',
    [TeamRole.CTO]: 'CTO',
    [TeamRole.CFO]: 'CFO',
    [TeamRole.ENGINEERING_MANAGER]: 'Engineering Manager',
    [TeamRole.TECH_LEAD]: 'Tech Lead',
    [TeamRole.DEVOPS_LEAD]: 'DevOps Lead',
    [TeamRole.SENIOR_DEVELOPER]: 'Senior Developer',
    [TeamRole.DEVELOPER]: 'Developer',
    [TeamRole.JUNIOR_DEVELOPER]: 'Junior Developer',
    [TeamRole.QA_LEAD]: 'QA Lead',
    [TeamRole.QA_ENGINEER]: 'QA Engineer',
    [TeamRole.PRODUCT_MANAGER]: 'Product Manager',
    [TeamRole.DESIGNER]: 'Designer',
    [TeamRole.BUSINESS_ANALYST]: 'Business Analyst',
    [TeamRole.VIEWER]: 'Viewer'
}
