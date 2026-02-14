export interface InvitationData {
    type: string
    companyId: string
    invitedEmail: string
    invitedBy: string
    role: string
    companyName: string
    iat: number
    exp: number
}
