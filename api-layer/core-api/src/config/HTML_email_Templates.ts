/**
 * Returns an HTML template for a password reset email.
 * @param {string} email The email address of the user.
 * @param {string} link The link to reset the password.
 * @return {string} The HTML template for the email.
 */
function getResetEmailTemplate(email: string, link: string) {
    return `<!DOCTYPE html>
<html>
  <head>
    <style>
      body {
        font-family: Arial, sans-serif;
        background-color: #f2f2f2;
        padding: 40px 0;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #fff;
        padding: 30px;
        border-radius: 6px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      .header {
        background-color: #333;
        padding: 20px;
        text-align: center;
      }
      .header img {
        max-height: 40px;
      }
      h2 {
        color: #333;
      }
      .content {
        font-size: 16px;
        color: #333;
        line-height: 1.6;
      }
      a {
        color: #2a6fdb;
        text-decoration: none;
      }
      .footer {
        margin-top: 30px;
        font-size: 12px;
        color: #aaa;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <img src="https://via.placeholder.com/100x40?text=Logo" alt="Logo" />
      </div>
      <h2>You have requested a password change</h2>
      <div class="content">
        <p>
          We received a request to reset the password for your account. To proceed, please click the link below to create a new password:
        </p>
        <p>
          <a href="${link}">${link}</a>
        </p>
        <p>This link will expire in one hour.</p>
        <p>
          If you didn't request this password reset, please ignore this email or let us know immediately. Your account remains secure.
        </p>
        <p>Best regards,<br />Titanium Ignis Team</p>
      </div>
      <div class="footer">
        The email was sent to ${email}.<br />
        You received this email because you are registered with Titanium Ignis
      </div>
    </div>
  </body>
</html>`;
}

/**
 * Returns an HTML template for a password reset email.
 * @param {string} email The email address of the user.
 * @param {string} link The link to reset the password.
 * @return {string} The HTML template for the email.
 */
function getPasswordResetEmailTemplate(email: string, link: string) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background-color: #f4f6f8;
      margin: 0;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      margin: auto;
      background-color: #ffffff;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.05);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .header img {
      max-height: 50px;
    }
    h2 {
      color: #222;
      text-align: center;
    }
    .content {
      color: #555;
      font-size: 16px;
      line-height: 1.6;
    }
    .btn {
      display: inline-block;
      background-color: #2a6fdb;
      color: #ffffff;
      padding: 12px 20px;
      margin: 20px 0;
      border-radius: 5px;
      text-decoration: none;
      font-weight: bold;
    }
    .link {
      word-break: break-all;
      font-size: 14px;
      color: #2a6fdb;
    }
    .footer {
      margin-top: 40px;
      font-size: 12px;
      color: #999;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://via.placeholder.com/120x40?text=Logo" alt="Titanium Ignis Logo" />
    </div>
    <h2>Password Reset Request</h2>
    <div class="content">
      <p>Hello,</p>
      <p>We received a request to reset the password for your account. To continue, please click the button below:</p>
      <p style="text-align: center;">
        <a class="btn" href="${link}" target="_blank" rel="noopener noreferrer">Reset Your Password</a>
      </p>
      <p>If the button above doesn't work, you can also use this link:</p>
      <p class="link">${link}</p>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request a password reset, you can safely ignore this email.</p>
      <p>Thank you,<br />The Titanium Ignis Team</p>
    </div>
    <div class="footer">
      This message was sent to ${email}.<br />
      You are receiving this email because you have an account with Titanium Ignis.
    </div>
  </div>
</body>
</html>`;
}


/**
 * Returns an HTML template for a team invitation email.
 * @param {string} invitedEmail The email address of the user who is being invited.
 * @param {string} inviterName The name of the user who is sending the invitation.
 * @param {string} companyName The name of the company.
 * @param {string} inviteLink The link to join the team.
 * @param {string} role The role of the user in the team. Defaults to 'Member'.
 * @return {string} The HTML template for the email.
 */
function getCompanyInvitationEmailTemplate(invitedEmail: string, inviterName: string, companyName: string, inviteLink: string, role: string) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #0a0a0a;
      margin: 0;
      padding: 40px 20px;
    }
    .container {
      max-width: 600px;
      margin: auto;
      background: linear-gradient(180deg, #1a1410 0%, #0f0c0a 100%);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      border: 1px solid #2a1f1a;
    }
    .header {
      background: linear-gradient(135deg, #1a1410 0%, #0f0c0a 100%);
      padding: 40px;
      text-align: center;
      border-bottom: 1px solid rgba(255, 107, 53, 0.1);
    }
    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      font-size: 28px;
      font-weight: 600;
      color: #ffffff;
      letter-spacing: -0.5px;
    }
    .logo-icon {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #ff6b35 0%, #ff8555 100%);
      border-radius: 8px;
      display: inline-block;
    }
    .content {
      padding: 48px 40px;
      color: #d4d4d4;
      font-size: 16px;
      line-height: 1.7;
    }
    h2 {
      color: #ffffff;
      font-size: 28px;
      margin: 0 0 16px 0;
      font-weight: 600;
      letter-spacing: -0.5px;
    }
    .subtitle {
      color: #999;
      font-size: 15px;
      margin-bottom: 32px;
    }
    .invite-card {
      background: rgba(26, 20, 16, 0.6);
      border: 1px solid rgba(255, 107, 53, 0.15);
      border-radius: 12px;
      padding: 24px;
      margin: 32px 0;
      backdrop-filter: blur(10px);
    }
    .invite-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 0;
      border-bottom: 1px solid rgba(255, 107, 53, 0.08);
    }
    .invite-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }
    .invite-row:first-child {
      padding-top: 0;
    }
    .invite-label {
      color: #888;
      font-size: 14px;
      font-weight: 500;
    }
    .invite-value {
      color: #fff;
      font-weight: 600;
      font-size: 15px;
    }
    .role-badge {
      display: inline-block;
      background: linear-gradient(135deg, #ff6b35 0%, #ff8555 100%);
      color: #ffffff;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #ff6b35 0%, #ff8555 100%);
      color: #ffffff;
      padding: 16px 40px;
      margin: 32px 0;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      transition: all 0.3s ease;
      box-shadow: 0 4px 16px rgba(255, 107, 53, 0.3);
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 24px rgba(255, 107, 53, 0.4);
    }
    .btn-container {
      text-align: center;
      margin: 36px 0;
    }
    .features {
      background: rgba(26, 20, 16, 0.4);
      border-left: 3px solid #ff6b35;
      border-radius: 8px;
      padding: 20px 24px;
      margin: 32px 0;
    }
    .features-title {
      color: #fff;
      font-weight: 600;
      font-size: 15px;
      margin-bottom: 12px;
    }
    .feature-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .feature-list li {
      color: #b0b0b0;
      padding: 8px 0;
      padding-left: 24px;
      position: relative;
      line-height: 1.6;
    }
    .feature-list li:before {
      content: "✓";
      position: absolute;
      left: 0;
      color: #ff6b35;
      font-weight: bold;
    }
    .expiry-notice {
      background: rgba(255, 107, 53, 0.08);
      border: 1px solid rgba(255, 107, 53, 0.2);
      padding: 14px 18px;
      margin: 28px 0;
      border-radius: 8px;
      font-size: 14px;
      color: #ffb399;
      text-align: center;
    }
    .link-fallback {
      margin-top: 32px;
      padding-top: 28px;
      border-top: 1px solid rgba(255, 107, 53, 0.1);
    }
    .link {
      word-break: break-all;
      font-size: 13px;
      color: #ff6b35;
      text-decoration: none;
    }
    .footer {
      background: #0a0a0a;
      padding: 32px 40px;
      font-size: 13px;
      color: #666;
      text-align: center;
      border-top: 1px solid rgba(255, 107, 53, 0.1);
    }
    .footer-links {
      margin-top: 16px;
    }
    .footer-links a {
      color: #888;
      text-decoration: none;
      margin: 0 16px;
      transition: color 0.2s;
    }
    .footer-links a:hover {
      color: #ff6b35;
    }
    .highlight {
      color: #ff6b35;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">
        <span class="logo-icon"></span>
        <span>Obtura</span>
      </div>
    </div>
    
    <div class="content">
      <h2>You've been invited to Obtura</h2>
      <p class="subtitle">Start shipping code without DevOps complexity</p>
      
      <p><span class="highlight">${inviterName}</span> from <span class="highlight">${companyName}</span> has invited you to join their organization on Obtura.</p>
      
      <div class="invite-card">
        <div class="invite-row">
          <span class="invite-label">Company</span>
          <span class="invite-value">${companyName}</span>
        </div>
        <div class="invite-row">
          <span class="invite-label">Role</span>
          <span class="role-badge">${role}</span>
        </div>
        <div class="invite-row">
          <span class="invite-label">Invited by</span>
          <span class="invite-value">${inviterName}</span>
        </div>
      </div>
      
      <div class="btn-container">
        <a class="btn" href="${inviteLink}" target="_blank" rel="noopener noreferrer">Accept Invitation →</a>
      </div>
      
      <div class="expiry-notice">
        ⏱ This invitation expires in 7 days
      </div>
      
      <div class="features">
        <div class="features-title">What you'll get access to:</div>
        <ul class="feature-list">
          <li>5-minute deploy with zero-config infrastructure</li>
          <li>Built-in observability and monitoring</li>
          <li>GDPR compliant European hosting</li>
          <li>Collaborate with your team on deployments</li>
        </ul>
      </div>
      
      <div class="link-fallback">
        <p style="color: #888; font-size: 14px; margin-bottom: 12px;">If the button doesn't work, copy and paste this link:</p>
        <a class="link" href="${inviteLink}" target="_blank" rel="noopener noreferrer">${inviteLink}</a>
      </div>
      
      <p style="margin-top: 36px; color: #888; font-size: 14px;">
        If you didn't expect this invitation or don't know ${inviterName}, you can safely ignore this email.
      </p>
    </div>
    
    <div class="footer">
      <p style="margin-bottom: 8px;">This invitation was sent to <strong style="color: #999;">${invitedEmail}</strong></p>
      <div class="footer-links">
        <a href="https://obtura-market.vercel.app" target="_blank">Website</a>
        <a href="https://obtura-market.vercel.app/docs" target="_blank">Documentation</a>
        <a href="mailto:support@obtura.io">Support</a>
      </div>
      <p style="margin-top: 20px; color: #555;">© 2025 Obtura. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
}

export { getResetEmailTemplate, getPasswordResetEmailTemplate, getCompanyInvitationEmailTemplate };
