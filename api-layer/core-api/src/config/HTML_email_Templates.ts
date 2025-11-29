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

export { getResetEmailTemplate, getPasswordResetEmailTemplate };
