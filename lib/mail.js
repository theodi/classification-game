const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');

let transporterState = null;

function fromAddress() {
  const fromEmail = process.env.EMAIL_FROM || process.env.SMTP_FROM || '';
  const fromName = process.env.EMAIL_FROM_NAME || 'Classification Game';
  if (!fromEmail) {
    return '';
  }
  return fromName + ' <' + fromEmail + '>';
}

function mailMode() {
  const useServiceAccount = String(process.env.EMAIL_USE_SERVICE_ACCOUNT || 'false').toLowerCase() === 'true';
  if (useServiceAccount) {
    return 'service_account';
  }
  const useOAuth2 = String(process.env.EMAIL_USE_OAUTH2 || 'true').toLowerCase() === 'true';
  if (useOAuth2) {
    return 'oauth2';
  }
  return 'smtp';
}

function configured() {
  const mode = mailMode();
  if (mode === 'service_account') {
    return !!(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_PRIVATE_KEY &&
      process.env.EMAIL_USER &&
      (process.env.EMAIL_FROM || process.env.SMTP_FROM)
    );
  }
  if (mode === 'oauth2') {
    return !!(
      process.env.EMAIL_USER &&
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_OAUTH_REFRESH_TOKEN &&
      (process.env.EMAIL_FROM || process.env.SMTP_FROM)
    );
  }
  return !!(process.env.SMTP_HOST && (process.env.EMAIL_FROM || process.env.SMTP_FROM));
}

function getTransporter() {
  if (transporterState) {
    return transporterState;
  }

  const mode = mailMode();
  if (mode === 'service_account') {
    const jwtAuth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      scopes: ['https://mail.google.com/'],
      subject: process.env.EMAIL_USER || undefined
    });
    transporterState = {
      mode: mode,
      jwtAuth: jwtAuth,
      transporter: nodemailer.createTransport({ service: 'gmail' })
    };
    return transporterState;
  }

  if (mode === 'oauth2') {
    transporterState = {
      mode: mode,
      transporter: nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.EMAIL_USER,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: process.env.GOOGLE_OAUTH_REFRESH_TOKEN,
          accessToken: process.env.GOOGLE_OAUTH_ACCESS_TOKEN || undefined
        }
      })
    };
    return transporterState;
  }

  transporterState = {
    mode: mode,
    transporter: nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
      auth: process.env.SMTP_USER && process.env.SMTP_PASS ? {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      } : undefined
    })
  };
  return transporterState;
}

async function sendMail(mailOptions) {
  if (!configured()) {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('Email is not configured');
      error.code = 'NO_MAIL';
      throw error;
    }
    return;
  }

  const state = getTransporter();
  const options = Object.assign({ from: fromAddress() }, mailOptions);

  if (state.mode === 'service_account' && state.jwtAuth) {
    const { token } = await state.jwtAuth.getAccessToken();
    options.auth = {
      type: 'OAuth2',
      user: process.env.EMAIL_USER,
      accessToken: token
    };
  }

  await state.transporter.sendMail(options);
}

async function sendLoginCode(email, code) {
  await sendMail({
    to: email,
    subject: 'Your classification game code',
    text: 'Your sign-in code is ' + code + '. It expires in 10 minutes.\n\nIf you did not ask for this, you can ignore the email.'
  });
}

async function sendSessionLink(email, details) {
  const sessionName = (details && details.sessionName) || 'your class session';
  const url = details && details.url;
  if (!url) {
    const error = new Error('Missing session link');
    error.code = 'BAD_REQUEST';
    throw error;
  }
  await sendMail({
    to: email,
    subject: 'Classification game link — ' + sessionName,
    text: 'Open this link to play the classification game for ' + sessionName + ':\n\n' + url + '\n\nYou do not need to sign in.'
  });
}

function hashCode(email, code) {
  return crypto.createHash('sha256').update((process.env.CODE_PEPPER || 'school-game') + ':' + email + ':' + code).digest('hex');
}

module.exports = {
  configured: configured,
  sendLoginCode: sendLoginCode,
  sendSessionLink: sendSessionLink,
  hashCode: hashCode
};
